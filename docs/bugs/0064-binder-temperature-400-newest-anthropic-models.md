# Bug 0064 — The binder's spec-pinned `options.temperature = 0` is a hard HTTP 400 on the newest `anthropic-messages` models: every non-bypass `params:` theta bound to `claude-sonnet-5` burns both budgeted binder calls and terminates on `argument binder unavailable`, and the live suite cannot see it because its one binder cell hardcodes an older model

- **Status:** open. Live-confirmed.
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
