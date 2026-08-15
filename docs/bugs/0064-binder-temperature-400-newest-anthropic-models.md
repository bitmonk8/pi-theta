# Bug 0064 — The binder's spec-pinned `options.temperature = 0` is a hard HTTP 400 on the newest `anthropic-messages` models: every non-bypass `params:` theta bound to `claude-sonnet-5` burns both budgeted binder calls and terminates on `argument binder unavailable`, and the live suite cannot see it because its one binder cell hardcodes an older model

- **Status:** fixed (0.94.0). Live-confirmed at filing.
- **Kind:** defect — spec and implementation together fail to deliver
  documented behaviour against a real provider. Three spec pages pin
  `temperature: 0` on the binder inference call as an unconditional
  determinism requirement
  (`docs/spec_topics/binder/determinism-cancellation-failure.md:5`,
  `docs/spec_topics/pi-integration-contract/binder-inference.md:15`,
  `docs/spec_topics/implementation-notes.md:28`), and
  `buildBinderCompleteCall` sets it unconditionally
  (`src/binder/binder-inference.ts:390`). The Anthropic Messages API rejects
  the field outright on its newest models:

  ```
  400 {"type":"error","error":{"type":"invalid_request_error",
       "message":"`temperature` is deprecated for this model."},
       "request_id":"req_011CdddQWVgU4uwC8H9295uN"}
  ```

  The response classifies transport (correctly), consumes the single
  transport retry (HC3-a), fails identically, and terminates the slash
  invocation on the *Binder model transport failure* row. The theta never
  runs. Every non-bypass `params:` theta — the whole `params:` binding
  feature — is dead against such a model, at two provider calls per
  invocation.
- **Related:**
  [0011](./0011-binder-complete-no-forced-tool-free-text-envelope.md) —
  fixed (0.26.0), the fix that first wired `buildBinderCompleteCall` into
  production and therefore first put `temperature: 0` on a live wire. Its
  §Fix records the call triple as pinned; the `temperature` field is the one
  member of that triple no live cell exercises against the suite's own
  preferred model.
  [0009](./0009-live-prompt-queryerror-provider-field-derivation.md) — the
  precedent for a binder/query defect visible only against a real provider.
  [0030](./0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md) —
  the precedent for "the live suite's assertion set cannot witness the
  failure class".
  [0065](./0065-anthropic-overflow-status-gate-unsatisfiable.md) — found
  against the same live artifact (an anthropic-messages HTTP 400 at
  `claude-sonnet-5`); orthogonal root cause — there the classifier cannot
  see a valid 400's status, here the client sends a field the model
  refuses. Fixing one does not fix the other.
- **Affected** (citations verified at HEAD `d06daae3`, 0.52.0):
  - `src/binder/binder-inference.ts:389–391` —
    `buildBinderCompleteCall`'s `options` literal: `temperature: 0` with no
    per-api gate, beside the `toolChoice` field that *does* carry one
    (`forcedToolChoiceForApi`, `:397`, added by bug 0010's fix precisely
    because a normalised spelling was "a 400/TypeError on the
    openai-completions / mistral-family adapters"). The same
    per-api-divergence lesson was not applied to `temperature`.
  - `src/binder/binder-inference.ts:26` — the module header restating
    `options.temperature` is `0` as a contract.
  - `src/extension/production-theta-producer.ts:1033–1057`
    (`#completeBinderReply`) — the sole production dispatcher; it threads
    registry auth into `call.options` and calls `complete()` (`:1057`)
    without inspecting `temperature`.
  - `src/extension/production-theta-producer.ts:932–1020`
    (`#classifyBinderAttempt`) — routes the reply: `stopReason: "error"` is
    non-normal (`:997–1001`), so the response goes to
    `classifyProviderResponse` and returns `{ kind: "transport" }`
    (`:1013`).
  - `src/binder/binder-cancellation.ts:100–140`
    (`runBinderCallWithCancellation`) — the transport budget
    (`transportBudget = 1`, `:104`) re-issues the identical call, which
    fails identically; `runBinder` then emits the failure note and returns
    `bound: false` (`src/extension/production-theta-producer.ts:823–827`).
  - `tests/live/acceptance/fixtures/acc-params-binder.theta:3` —
    `bind_model: anthropic/claude-haiku-4-5`. This fixture is the **only**
    live cell in either suite that reaches a real binder call
    (`grep -rn "params:" tests/live/` returns this fixture and its driver
    only). It hardcodes a model that still accepts `temperature`, so the
    live suite's own shared model-preference rule (AGENTS.md: prefer
    `claude-sonnet-5`) never reaches the binder wire.
- **Observed at:** `0.52.0`, HEAD `d06daae3`, live, host model registry as
  configured for `npm run test:live`; model `claude-sonnet-5`, api
  `anthropic-messages`.

## Summary

`buildBinderCompleteCall` sets `temperature: 0` on every binder
`complete()` call. Anthropic has deprecated the `temperature` request field
on its newest models; sending it is not ignored, it is a `400
invalid_request_error`. The classifier maps that to the transport class, the
per-invocation transport budget re-issues the same call, the second failure
surfaces
`theta /<name>: argument binder unavailable (anthropic-messages: 400 …)`,
and the theta body never runs.

The blast radius is every theta whose `params:` block does not qualify for
one of the two binder bypasses `classifyBinderBypass` classifies (anything
other than "no params" or "one non-defaulted, non-optional, non-nullable
`string`") when its resolved binder
model is one of the affected models. `claude-sonnet-5` is affected; it is
also the model this repo's own live suite prefers and the model a developer
running `pi` today is most likely to have selected.

## Reproduction

All commands run in the hunt worktree at HEAD `d06daae3`.

### Reach 1 — the production path, end to end

Plant a `mode: prompt` theta whose `params:` routes to the binder and whose
`bind_model:` is `claude-sonnet-5`, boot the shipped extension through
`tests/live/harness.ts`, and drive `/bsonnet hello`:

```
---
description: "binder default revalidation probe a"
mode: prompt
bind_model: claude-sonnet-5
bind_echo: true
params:
  topic_a: string
  count_a: integer = "xyzzy"
---
@`SENTINEL39 topic=${topic_a} count=${count_a}. Reply with exactly: done.`
```

Observed (`driveSlashCaptureTurn`, deterministic channels):

```
[bsonnet] SYSTEM NOTES: ["theta /bsonnet: argument binder unavailable (anthropic-messages: 400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_e…"]
[bsonnet] USER TEXTS: []
[bsonnet] ASSISTANT: ""
```

The note is the *Binder model transport failure* row, capped at 120 code
points by the rule-2 cap. `userTexts` is empty: the body's `@`-query never
ran.

### Reach 2 — the raw call, with the counterfactual

Dispatch the production call triple directly through
`buildBinderCompleteCall` + `complete()` against `claude-sonnet-5`, then
re-dispatch the identical triple with `temperature` deleted:

```
REPLY(with temperature): {"role":"assistant","content":[],"api":"anthropic-messages",
  "provider":"anthropic","model":"claude-sonnet-5","stopReason":"error",
  "errorMessage":"400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",
   \"message\":\"`temperature` is deprecated for this model.\"},\"request_id\":\"req_011CdddT2ABb78Rf9T6bUsHB\"}"}

REPLY(no temperature): {"role":"assistant","content":[{"type":"toolCall",
  "id":"toolu_019KcL7Cvdh77UPYyF2QPDCQ","name":"__theta_bind_a9246dbb4129fb41",
  "arguments":{"envelope":{"kind":"ok","args":{"topic":"hello"}}}}],
  "api":"anthropic-messages","model":"claude-sonnet-5","stopReason":"toolUse", …}
```

One field is the difference between a total binder failure and a clean
forced-tool envelope. Nothing else in the triple moved: same system prompt,
same single `__theta_bind_<slug>` tool, same
`toolChoice: {"type":"tool","name":"__theta_bind_a9246dbb4129fb41"}`, same
signal, same `onResponse`. The `seed` field is absent for
`anthropic-messages` by the seed-field mapping, so it is not a variable here
(`OPTIONS KEYS: ["temperature","signal","onResponse","toolChoice"]`).

### Reach 3 — model census

A `temperature: 0` probe (16 output tokens, one turn) against every
Anthropic model in the configured registry:

| model | `stopReason` | `errorMessage` |
|---|---|---|
| `claude-sonnet-5` | `error` | ``400 … `temperature` is deprecated for this model.`` |
| `claude-opus-4-5` | `stop` | — |
| `claude-sonnet-4-5` | `length` | — |
| `claude-haiku-4-5` | `stop` | — |
| `claude-opus-4-1` | `stop` | — |

The rejection is model-scoped, not provider-scoped, and it is on the
*newest* model. The set grows with each Anthropic release that carries the
deprecation; it does not shrink.

### Control — the bypass path is unaffected

A theta with no `params:` or with the single-`string` bypass shape issues no
binder call at all (`classifyBinderBypass`,
`src/binder/binder-envelope.ts:204–225`), so it drives normally against
`claude-sonnet-5`. This is why the H8a typed-query cells
(`tests/live/typed-query-wire-shapes.test.ts`, both green at HEAD against
`claude-sonnet-5`) do not witness the failure: their fixtures declare no
`params:`.

## Expected behaviour

`docs/spec_topics/binder/determinism-cancellation-failure.md:5` — "Binder
calls use `temperature: 0`." — with §Determinism's own framing that what
theta controls is "byte-identical binder input and a deterministic seed
value", and that "whether the provider then maps that
`(prompt-bytes, temperature: 0, seed)` input to byte-identical output is
provider-dependent and outside theta's control"
(`docs/spec_topics/binder/binder-model-and-context.md:50`).

`docs/spec_topics/pi-integration-contract/binder-inference.md:15` —
"`options.temperature` is `0`".

The determinism intent is "do not sample"; the mechanism is a request field
one provider family has retired. The same page already carries the pattern
for a per-api request-shape divergence: the seed is "included in the request
payload … under which field name" per a static per-api table, and is
**omitted** for `anthropic-messages` and `amazon-bedrock`
(`docs/spec_topics/pi-integration-contract/provider-error-mapping.md`
§Provider seed-field mapping, cited at
`binder/binder-model-and-context.md:50`). A model that refuses
`temperature` is the same class of fact as a transport that carries no
`seed` field, and the spec has no row for it.

Whatever the resolution, the delivered behaviour must not be "the whole
`params:` feature returns `argument binder unavailable` on the current
model".

## Actual behaviour / root cause

`buildBinderCompleteCall` (`src/binder/binder-inference.ts:389–391`) writes
`temperature: 0` into `ProviderStreamOptions` unconditionally. There is no
per-api table for it — the adjacent `toolChoice` line (`:397`) has one, added
by bug 0010's fix for exactly this failure mode on a different field, and
the seed placement below it (`:401–404`) has one too.

`#completeBinderReply` (`src/extension/production-theta-producer.ts:1038`)
passes the constructed options through to `complete()` verbatim.

The provider returns `stopReason: "error"` with the 400 body in
`errorMessage`. `#classifyBinderAttempt` finds no matching `ToolCall`, sees
a non-normal `stopReason` (`:995–1001`), and routes to
`classifyProviderResponse`, which returns `kind: "transport"` — correct, and
therefore retry-eligible. `runBinderCallWithCancellation`
(`src/binder/binder-cancellation.ts:130–133`) spends the single transport
budget on an identical re-issue, which fails identically, and returns the
most-recent outcome (HC3-e). `runBinder`
(`src/extension/production-theta-producer.ts:823–827`) emits the mapped
failure note and returns `bound: false`.

Two provider round-trips are spent per slash invocation to arrive at a
failure that is a property of the request shape, not of the provider's
state.

**Why no test catches it.** `tests/binder-inference-provider-mapping.test.ts`
and `tests/binder-forced-tool-dispatch.test.ts` pin `temperature: 0` on the
constructed options against doubles — they assert the field is present,
which is exactly the behaviour that breaks. The only live binder cell,
H9a acceptance area (d), pins `bind_model: anthropic/claude-haiku-4-5` in
its fixture (`tests/live/acceptance/fixtures/acc-params-binder.theta:3`), a
model that still accepts the field. The live-suite model-preference rule
that every other live cell obeys (prefer `claude-sonnet-5`) is bypassed at
the one seam where it would have caught this.

## Why it matters

1. The `params:` binder is the documented entry point for every theta that
   takes typed slash arguments. On the affected models it is not degraded,
   it is unavailable, and the author's only signal is a truncated 400 body
   in a system note.
2. The failure is silent to CI: `npm test` is green, `npm run test:live` is
   green, because neither exercises the binder against the model the suite
   itself prefers.
3. Each failed invocation costs two provider calls.
4. The affected set is the newest models and grows monotonically. A repo
   that pins its live binder fixture to an old model will keep reporting
   green while the feature is dead for its users.

## Fix

Constraint-pinned; the route is a spec decision, so this report states the
constraints rather than choosing.

**Option 1 — per-api `temperature` placement table (recommended).** Mirror
the existing seed-field mapping: a static table keyed on `Model<Api>.api`
(and, where the deprecation is model-scoped rather than api-scoped, on the
model id) deciding whether `temperature` is written. Constraints: the table
must be a spec artefact on
`docs/spec_topics/pi-integration-contract/provider-error-mapping.md` beside
the seed table, so the determinism claim in
`binder/determinism-cancellation-failure.md:5` can cite it the way
`binder-model-and-context.md:50` already cites the seed table; the
`Api`-coverage build assertion that guards the seed table should guard this
one; and §Determinism's prose must say what determinism means when the field
is omitted (the same thing it already says for a seedless transport:
byte-identical *input*, provider-dependent output).

**Option 2 — classify and degrade.** Detect the specific
`invalid_request_error` on the first attempt and re-issue once without
`temperature` instead of spending the transport budget on an identical call.
Constraints: this makes the request shape non-deterministic across attempts,
which the malformed-retry rule explicitly forbids for the envelope schema
("no schema mutation between attempts") and which §Determinism's
fixed-footprint framing argues against for the whole triple; it also matches
on provider-owned wording, which
`provider-error-mapping.md`'s *Provider-owned-wording presupposition*
already flags as undetectable drift.

**Option 3 — drop `temperature` from the binder call entirely.** The
provider default for a forced single-tool call with a fixed prompt is
already the low-variance path, and the envelope is schema-constrained.
Constraints: three spec pages change; the determinism section must be
rewritten around "fixed prompt bytes + forced tool + fixed seed where
supported"; the existing unit pins asserting `temperature: 0` invert.

**Test witness — live, and it must be live.** The offline pins already
assert the shipped (broken) shape, so no offline cell can red on this. The
witness is one live cell driving a non-bypass `params:` theta whose
`bind_model:` is resolved by the live suite's own shared preference rule
(not a hardcoded id), asserting the `bind_echo` success note
`Running /<name>: …` on the `theta-system-note` channel and the ABSENCE of
`argument binder unavailable`. That cell reds today at HEAD and greens under
any of the three options. The H9a area (d) fixture's hardcoded
`bind_model:` should be re-derived from the same rule for the same reason.

## Non-goals

- **Whether `temperature: 0` is the right determinism primitive.** Out of
  scope; this report is about a request field a provider refuses.
- **The transport-class retry spending a call on an identical request.**
  The per-invocation budget is spec-pinned as immediate re-issue with no
  backoff (`determinism-cancellation-failure.md`
  §per-invocation-retry-budget) and is correct as written; that a
  deterministic 400 is retried at all is a consequence of the request-shape
  defect, not a separate one.
- **The 120-code-point note cap truncating the 400 body mid-JSON.** Rule 2
  is normative and the truncation is conformant; that the operator cannot
  read the cause from the note is a consequence, not a defect of the cap.
- **`onResponse` not firing on the 400** (so the classifier's `http_status`
  is `null` rather than `400`). Filed separately — it does not change this
  report's class, which is transport either way.

## Provenance

- Spec: `docs/spec_topics/binder/determinism-cancellation-failure.md:5`
  (§Determinism, the `temperature: 0` pin; §Failure-class taxonomy
  transport-class row `:35`; §per-invocation-retry-budget);
  `docs/spec_topics/pi-integration-contract/binder-inference.md:15`
  (`options.temperature` is `0`);
  `docs/spec_topics/implementation-notes.md:28` ("The binder call itself
  runs with `temperature: 0` and a fixed seed where supported");
  `docs/spec_topics/binder/binder-model-and-context.md:50` (the
  determinism-vs-provider framing and the seed-table precedent);
  `docs/spec_topics/pi-integration-contract/provider-error-mapping.md`
  §Provider seed-field mapping (the per-api request-field table this
  report's Option 1 mirrors);
  `docs/spec_topics/binder/binder-bypass-and-envelope.md` §Binder bypass
  (the two shapes that escape the defect).
- Implementation evidence at `d06daae3`:
  `src/binder/binder-inference.ts:26` (header restatement), `:366–408`
  (`buildBinderCompleteCall`), `:389–391` (the `temperature` write), `:397`
  (the per-api `toolChoice`), `:401–404` (the per-api seed placement);
  `src/extension/production-theta-producer.ts:932–1020`
  (`#classifyBinderAttempt`), `:995–1013` (the failure routing), `:1033–1058`
  (`#completeBinderReply`), `:823–827` (the failure-note arm of `runBinder`);
  `src/binder/binder-cancellation.ts:100–140`
  (`runBinderCallWithCancellation`, transport budget at `:104`/`:130–133`);
  `src/binder/binder-envelope.ts:204–225` (`classifyBinderBypass`);
  `src/binder/retry-taxonomy.ts:88–129` (`renderBinderSystemNote`, the
  transport row at `:118–124`).
- Test evidence at `d06daae3`:
  `tests/live/acceptance/fixtures/acc-params-binder.theta:3` (the hardcoded
  `bind_model:`); `tests/live/acceptance/noninteractive-acceptance.test.ts:256`
  (area (d), the only live binder driver);
  `tests/binder-inference-provider-mapping.test.ts`,
  `tests/binder-forced-tool-dispatch.test.ts` (offline pins asserting the
  shipped `temperature: 0`).
- Live evidence: scratch probes at HEAD `d06daae3` against the configured
  live registry, model `claude-sonnet-5` (production path and raw
  `complete()` counterfactual) and the five-model `temperature: 0` census
  above. Probes deleted after recording, per hunt protocol.

## Fix (0.94.0)

- **What shipped:**
  - `src/binder/binder-temperature.ts` (new) — §Fix Option 1's placement table:
    `BINDER_TEMPERATURE_TABLE`, one row per pinned pi-ai `Api` value, each row
    `{ placement: "sent" | "omitted", refusedByModelId }`; and
    `binderSendsTemperature(api, modelId)`, an exact-`id` match against the
    row's refusal set. Null-prototyped and `Object.hasOwn`-guarded per fix
    records 0031/0038 (`api` is a registry-origin string, so an unguarded
    bracket read would resolve an `Object.prototype` own key as a value);
    table, rows and id arrays all frozen for the module-level-mutable gate.
  - `src/binder/binder-inference.ts` — `buildBinderCompleteCall` drops
    `temperature: 0` from its `options` literal and writes it only when
    `binderSendsTemperature` says so, beside the per-api seed placement; a
    refusing pair gets NO `temperature` own key. Module header and the
    constructor's doc-comment restate the conditional contract and cite the new
    anchor.
  - `src/binder/binder-seed.ts`, `src/extension/production-theta-producer.ts`
    (`#completeBinderReply`) — the two doc-comments that restated the
    unconditional pin. Comment text only; the producer's doc-block was held at
    its original line count so the external test citations into that file did
    not shift.
  - `src/extension/version-bump-gates.ts` — `apiCoverageFailures`'s second
    parameter renamed `seedFieldTableKeys` to `tableRowKeys` (all four call
    sites positional) and its doc-comment plus the module header's step-6
    bullet now state that one coverage function guards two tables.
  - `docs/spec_topics/pi-integration-contract/provider-error-mapping.md` — the
    new §Binder temperature placement mapping (anchor
    `#binder-temperature-placement-mapping`), beside §Provider seed-field
    mapping: the keying rule, the per-api table, the model-scoped refusal
    table, "omitted means the key is absent from `options`", the shared
    `Api`-coverage gate, the provider-coupled-not-pi-ai-coupled widening rule,
    the exact-id match rule, and the outside-the-table default.
  - `docs/spec_topics/binder/determinism-cancellation-failure.md` §Determinism,
    `docs/spec_topics/pi-integration-contract/binder-inference.md`,
    `docs/spec_topics/implementation-notes.md`,
    `docs/spec_topics/binder/binder-model-and-context.md`,
    `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` step 6,
    `docs/plan_topics/coverage-matrix.md` (`cka-35` and `cka-42`) — the
    same-commit conditionalisation of every page that pinned `temperature: 0`
    unconditionally. §Determinism says what determinism means when the field is
    omitted: theta pins byte-identical *input*, and whether the provider maps
    that input to byte-identical output is provider-dependent and outside
    theta's control — the claim the page already made for a seedless transport.
    §Determinism's opening stayed a single edited line so the failure-mode
    template line numbers below it did not shift. `docs/reference/**` carries no
    temperature prose (swept twice), so no mirror row exists to update.
  - `tests/version-bump-gates.test.ts` — one additive step-6 cell asserting the
    `Api`-coverage gate over `Object.keys(BINDER_TEMPERATURE_TABLE)` in both
    directions. No existing cell touched.
  - `tests/binder-inference-provider-mapping.test.ts` — five additive `cka-34`
    cells (below).
  - `tests/live/live-production-acceptance.test.ts` — additive H8a cell 36
    (below); 147 insertions, 0 deletions.
  - `tests/live/acceptance/harness.ts`,
    `tests/live/acceptance/noninteractive-acceptance.test.ts`,
    `tests/live/acceptance/fixtures/acc-params-binder.theta` — the H9a area (d)
    re-derivation (below).
- **Parent adjudication (verbatim).** "Option 1 — the per-api `temperature`
  placement table — is settled as the route. The doc recommends it; it mirrors
  two landed precedents (the per-api seed-field table on
  `provider-error-mapping.md`, and bug 0010's `forcedToolChoiceForApi` added
  for exactly this failure class on a neighbouring field); Option 2 is
  disfavoured by two named normative conflicts (the malformed-retry rule's 'no
  schema mutation between attempts', and the provider-owned-wording
  presupposition `provider-error-mapping.md` itself flags as undetectable
  drift); Option 3 has the largest blast radius (three spec pages rewritten
  around a new determinism framing, existing unit pins inverted) and no
  recommendation. STOP only if your measurement contradicts Option 1's
  feasibility."
- **Operator riders (verbatim).** "three spec pages pin the binder's
  temperature: 0 unconditionally, so any drop/conditionalization is a
  same-commit spec edit under the corpus discipline" — and — "H8a cell 31 pins
  bind_model: anthropic/claude-haiku-4-5 DELIBERATELY to sidestep this bug —
  the fix adds sonnet-5-class coverage (additive cell, or a repin only with doc
  authority) and the verifier proves the red path against a real sonnet-5
  binder call once. Provider-billed calls are expected; token cost is not a
  reason to skip."
- **The api-vs-model scoping decision, and the live census that settled it.**
  §Reproduction's Reach 3 census was measured at `d06daae3` (0.52.0) and is
  stale; it was re-derived live at HEAD `e54338a7` against the configured
  registry, one `temperature: 0` probe and one no-`temperature` counterfactual
  per model. Under `anthropic-messages`: `claude-sonnet-5` and `claude-fable-5`
  REFUSE with `400 {"type":"error","error":{"type":"invalid_request_error",
  "message":"\`temperature\` is deprecated for this model."}}` and succeed
  without the field; `claude-opus-5`, `claude-haiku-4-5`,
  `claude-haiku-4-5-20251001`, `claude-opus-4-5`, `claude-opus-4-5-20251101`,
  `claude-opus-4-6`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-sonnet-4-5`,
  `claude-sonnet-4-5-20250929` and `claude-sonnet-4-6` accept it;
  `claude-opus-4-1` and its dated alias answer `404 not_found_error`
  (unavailable — no row claimed); the openrouter `openai-completions` models
  answer `401 Missing Authentication header` (uncredentialed here — no row
  claimed). Two facts decided the shape. (1) The refusal is MODEL-scoped inside
  one api, so an api-only key cannot express it. (2) `claude-fable-5` is absent
  from the filed census, and `claude-opus-5` — newer than both refusing ids —
  ACCEPTS the field, so this report's "the rejection is on the *newest* model …
  the set grows with each Anthropic release" framing does not hold as a rule. A
  family or newest-model heuristic would therefore claim coverage no probe
  measured; the table lists the two measured ids and matches them exactly, and
  the spec section says a dated alias is a distinct id needing its own row.
- **Why the theta-side table is load-bearing at this pi-ai pin.** pi-ai's
  anthropic adapter already gates the field —
  `node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js:737`,
  `options?.temperature !== undefined && !options?.thinkingEnabled &&
  compat.supportsTemperature` — but `dist/providers/anthropic.models.js` sets
  `compat.supportsTemperature: false` for `claude-opus-4-7` and
  `claude-opus-4-8` ONLY, and the default is `true`
  (`anthropic-messages.js:116`). Neither refusing id carries the flag, so pi-ai
  forwards the field for them and the 400 is reached. Two consequences are
  recorded rather than assumed: the mapping is an `options`-shape contract, not
  a wire contract (an adapter may drop what theta writes — the census's
  "accept" rows for opus-4-7/4-8 are options-level, since the adapter strips the
  field before the wire); and an own `temperature` key holding `undefined` is
  wire-identical to an absent one at this pin (`anthropic-messages.js:737`,
  `openai-completions.js:476`, `mistral-conversations.js:184` all guard on
  `!== undefined`), so the spec states only that such a key reaches the adapter
  and presupposes nothing about what the adapter does with it.
- **The `Api`-coverage build assertion, extended.** The gate that guards the
  seed-field table is `apiCoverageFailures`
  (`src/extension/version-bump-gates.ts`), driven by the `api-coverage` row's
  pinned `Api` snapshot in `src/extension/sdk-inventory.ts`. It is
  table-generic (it takes row keys), so it now guards the temperature table
  through one additional assertion cell rather than a second gate function, and
  `version-bump-triggers.md` step 6 tells the contributor a new `Api` needs a
  row in each table in the same commit.
- **The offline pins §Fix pre-authorized for movement did not move.**
  Blast-radius pre-measurement at HEAD (an Option-1 prototype plus the full
  suite) reds ONE test — the module-level-mutable gate on the prototype's
  unfrozen constant, a scratch artefact. Neither
  `tests/binder-inference-provider-mapping.test.ts` nor
  `tests/binder-forced-tool-dispatch.test.ts` flipped: their model doubles are
  `{ api }` with no `id` (`modelOf`) or `id: "binder-model"`, so no id-scoped
  refusal row can match and every existing `temperature: 0` pin stays TRUE. The
  authorization was conditional ("verify then move") and the verification said
  do not move. Both files took additive or comment-only edits instead: five new
  `cka-34` cells (two omission cells for the measured refusing ids; three
  controls — same-api `claude-haiku-4-5` still sends, `openai-completions` +
  `gpt-4o` still sends, and `openai-completions` + `claude-sonnet-5` still
  sends, which is what forbids the table degrading to an id-only denylist), and
  header-bullet qualifications. `tests/binder-system-note-determinism.test.ts`
  took comment/title-only edits under a recorded self-authorization (below);
  its `expect(call.options.temperature).toBe(0)` is untouched and remains true
  for its `openai-completions` fixture.
- **Recorded self-authorization (the `question` tool is unavailable
  non-interactively).** The question that would have been asked: "the `cka-42`
  conformance cell in `tests/binder-system-note-determinism.test.ts` restates
  the now-conditional `temperature: 0` MUST in its `it()` title and three
  comments; that file is not named by §Fix — may the claim text be corrected?"
  Evidence: (1) `docs/plan_topics/coverage-matrix.md` maps `cka-42` to
  `determinism-cancellation-failure.md` §Determinism, the exact section this
  commit conditionalised; (2) that file's own banner names itself "cka-42 —
  Determinism (…; temperature: 0)", so it is that token's conformance witness;
  (3) the operator rider quoted above makes a same-commit sweep of the corpus
  the discipline; (4) the full suite is green with the fix in place, proving the
  cell's assertions stay TRUE for its fixture, so only the claim text is stale.
  Bound: three files (`tests/binder-system-note-determinism.test.ts`,
  `tests/binder-forced-tool-dispatch.test.ts`,
  `src/binder/binder-inference.ts`), comment and `it()`-title text only, zero
  `expect(...)` edits, zero behavioural change. STOP valve declared: any red in
  those files, or any remedy needing an assertion edit, stops the run. Neither
  fired.
- **The live witness (doc-prescribed).**
  `tests/live/live-production-acceptance.test.ts` H8a cell 36 plants a
  non-bypass `params:` theta (two fields, one defaulted — neither
  `classifyBinderBypass` arm) with `bind_echo: true`, DERIVES `bind_model:` as
  `<provider>/<id>` from `requireLiveProvider()` (the shared preference rule,
  never a hardcoded id), asserts both registrations token-free, then asserts the
  BND-1 `Running /b64livebinder…` note is PRESENT and that no note contains
  `argument binder unavailable`, read off the settled `SessionManager`. H8a cell
  31's `anthropic/claude-haiku-4-5` pin is intact and untouched; its sidestep
  rationale retires with this fix, and a later cleanup may repin it.
- **H9a area (d), re-derived.** Per §Fix's "should be re-derived from the same
  rule for the same reason": `materialiseHostBoundThetaDir` (new, in
  `tests/live/acceptance/harness.ts`) materialises a throwaway `--theta` dir
  holding a copy of `acc-params-binder.theta` whose `bind_model:` line is
  rewritten from `resolveAcceptanceHost()`, and area (d) spawns against that
  dir, disposing it in a `finally`. It fails loudly on a missing fixture, an
  unqualifiable host, or a `bind_model:` line count other than 1 — a silent
  no-op would restore the sidestep. The committed fixture's own line moved to
  `anthropic/claude-sonnet-5` so the committed artefact stops naming a model the
  rule would never pick. Area (d) is not a second witness: measured on both
  models, its `pi -p` stdout and stderr are empty either way and its assertion
  set is absence-only (the bind note never reaches print-mode stdout, DOC-73 /
  FIND-S7-4), which is why §Fix requires the witness to be the H8a cell.
- **Gates** (verbatim, at the verified tree):
  - Witness RED at HEAD, offline: `AssertionError: the binder call carries a
    'temperature' own key for an (api, model-id) pair whose placement row
    refuses the field with a 400 … options keys:
    ["temperature","signal","onResponse","toolChoice"]: expected true to be
    false` (both omission cells).
  - Witness RED at HEAD, live: `AssertionError: no bind_echo success note for a
    binder pass against bind_model: 'anthropic/claude-sonnet-5': the binder
    call's own request shape was refused, so the theta never started. Notes:
    ["theta /b64livebinder: argument binder unavailable (anthropic-messages:
    400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_req…"]`.
  - Full suite: `Test Files  296 passed (296)` / `Tests  4893 passed (4893)`.
  - `npm run typecheck` → `tsc -p tsconfig.json --noEmit`, no diagnostics.
  - `npm run lint` → `eslint --no-error-on-unmatched-pattern "src/**/*.ts"`, no
    diagnostics.
  - Live: `tests/live/live-production-acceptance.test.ts` `Tests  36 passed
    (36)`; `tests/live/acceptance/noninteractive-acceptance.test.ts` `Tests  10
    passed (10)`; `tests/live/acceptance/ctor-unresolved-load-refusal.test.ts`
    `Tests  1 passed (1)` — H9a 11/11.
- **Review:** 2 rounds. Round 1 (deep) — FINDINGS: two spec blockers (the "an
  own `undefined` key is not the same request shape as an absent one"
  overclaim, false at the pinned pi-ai; the `cka-42` coverage row left pinning
  the superseded universal contract), one house-rule (a historical "holdover"
  sentence explaining a parameter-name mismatch), two prose (two overclaiming
  "the only … reaches a real binder call" sentences; a stale `modelOf` JSDoc and
  header parenthetical), one test-prose (surviving universal-pin restatements),
  plus three residuals. All fixed except the residuals. Round 2 (fast) — one
  spec finding: two sentences still attributed an "unconditional" `temperature:
  0` pin to the §Determinism this same commit had conditionalised. Fixed as a
  one-word deletion in each; polish verified by gate-diff (comment and prose-only
  hunks, gates re-run green), confirmation round skipped.
- **Verification:** PASS. (1) Red path proven by neutralising
  `binderSendsTemperature` to `return true`: both offline omission cells red
  with the quoted assertion, and the live cell red against a real
  `claude-sonnet-5` binder call with the quoted `argument binder unavailable
  (anthropic-messages: 400 …)` note; restored byte-exact —
  `sha256(src/binder/binder-temperature.ts)` before and after both
  `d031cc362f2e0845c8f0fdb09c2be56c2a3a4ff2ebc9eeb7e57ae340a7b83427` — and both
  green again. (2) Default suite 296/4893 green. (3) End-to-end live: all three
  live files run for real, 47/47 green, H9a area (d) passing with its binder
  pass against the rule-resolved model; no code outside
  `tests/fixtures/h7a/permitted-codes.json` was emitted and that file was not
  edited; none of the open live signatures (0065, the ~180 s H9a stall, the bug
  0080 H8a cell, sentinel-refusal, `0xC0000142`) appeared. (4) typecheck and
  lint clean. No `expect(...)` anywhere in the diff was weakened, removed or
  inverted; `tests/live/live-production-acceptance.test.ts` is 36 cells with 0
  deletions.
- **Residuals:**
  1. `BinderTemperatureRow.placement: "omitted"` is unreachable as shipped —
     every row is `"sent"`, and `binderSendsTemperature` closes over the module
     constant, so no test can drive that arm without a table edit. Kept because
     the spec section defines "omitted" as a legal per-api cell value and the
     adjacent seed table carries real whole-api omitted rows, so a future
     whole-api deprecation is a row edit rather than a shape change. Witnessing
     it would need a table-parameterised core the export closes over.
  2. `BINDER_SEED_FIELD_BY_API[input.model.api]`
     (`src/binder/binder-inference.ts`) is an unguarded bracket read on a
     plain-prototype frozen object, ten lines from the new guarded one — the
     hazard `binder-temperature.ts`'s own 0031/0038 rationale names (an `api`
     spelling `constructor` resolves an `Object.prototype` own key, passes
     `!== undefined`, and becomes an options key). Pre-existing, outside this
     bug's blast radius, untouched.
  3. `tests/live/acceptance/noninteractive-acceptance.test.ts`'s area-(d)
     `it()` title promises "a success echo note surfaces", which that black-box
     cell documents it cannot assert (the note never reaches `pi -p` stdout).
     Pre-existing, on unchanged lines, untouched.
  4. The `V18c-T stub: performs no coverage check` sentence survives on
     `apiCoverageFailures`'s doc-comment though the shipped body does perform
     the check. It is a file-wide pattern on all eight gate functions; sweeping
     one is inconsistent and sweeping all eight is outside this fix.
- **Discharge notes appended:** none. Bug 0065's reproduction is unaffected —
  its anchor is a 200k-token context overflow at `claude-haiku-4-5` that never
  carried `temperature`; only its secondary corroborating aside used a
  `temperature`-carrying `claude-sonnet-5` call, which it already frames as "a
  separate probe" and whose subject it scopes generally ("a property of the
  adapter's error path, not of the overflow case"). No re-anchoring is needed
  and 0065 was not edited.
- **Pinned dispositions / non-goals:** all four §Non-goals hold and none was
  touched — whether `temperature: 0` is the right determinism primitive; the
  transport-class retry spending a call on an identical request; the
  120-code-point note cap truncating the 400 body; `onResponse` not firing on
  the 400 (bug 0065). No new diagnostic code was minted: the failure this fix
  removes was already rendered by the existing *Binder model transport failure*
  row, so the DIAG-2 closed registry is unchanged.
