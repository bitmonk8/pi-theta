# Bug 0417 — The binder's outside-the-table forced-`toolChoice` default `{type:"tool",name}` is a hard HTTP 400 on every `openai-responses` model: a `bind_model:` naming one registers cleanly, then every slash invocation burns both budgeted binder calls and terminates on `argument binder unavailable` — the 0064 mechanism on the neighbouring request field, and the binder is the one forced-tool dispatch site with no provider gate in front of it

- **Status:** open.
  end to end through the shipped composition root).
- **Sev/Diff estimate:** S2/D3 — loud-but-fatal: every `params:` theta on a whole served api family burns two budgeted provider calls per invocation and terminates on a transport note; fix needs a third spelling row plus the stale `apiUnionSnapshot` refresh (forcing rows in three tables), a binder-gate design decision, and a live witness.
- **Kind:** defect — implementation fails to deliver documented behaviour
  against a real provider. The binder inference contract pins that "the
  provider's tool choice is forced to that single tool through the same
  per-provider `options.toolChoice` mechanism the typed-query forced respond
  turn uses" (`docs/spec_topics/pi-integration-contract/binder-inference.md:14`),
  and the per-api spelling table's own outside-the-table default —
  "the spec's normalized `{type:"tool",name}` for … any api outside the table"
  (`src/binder/forced-tool-choice.ts:50–59`) — is a request shape the
  OpenAI Responses API rejects outright:

  ```
  400 … "Invalid value: 'tool'. Supported values are: 'code_interpreter',
  'programmatic_tool_calling', 'function', 'namespace', 'tool_search',
  'file_search', 'web_search_preview', … 'shell', and 'apply_patch'."
  ```

  The response classifies transport (correctly), consumes the single
  transport retry (HC3-a), fails identically, and the invocation terminates
  on the *Binder model transport failure* row. The theta never runs. Every
  non-bypass `params:` theta whose resolved binder model is served through
  the `openai-responses` api is dead, at two provider calls per invocation.
- **Related:**
  - [0064](../../../docs/bugs/0064-binder-temperature-400-newest-anthropic-models.md)
    — fixed (0.94.0). The class exemplar: a binder request field one provider
    surface refuses, invisible offline because the offline pins assert the
    shipped (broken) shape. There the field was `temperature` and the scope
    model-ids inside one api; here it is `toolChoice` and the scope is a whole
    api the tables carry no row for.
  - [0010](../../../docs/bugs/0010-typed-forced-respond-user-visible-no-toolchoice.md)
    — fixed (0.20.0). Introduced `forcedToolChoiceForApi` for exactly this
    failure mode ("a 400/TypeError on the openai-completions / mistral-family
    adapters"); its increment C also introduced the typed-query supported-
    provider set that shields the RESPOND path from this api — the binder path
    got the table but not the gate.
  - [0011](../../../docs/bugs/0011-binder-complete-no-forced-tool-free-text-envelope.md)
    — fixed (0.26.0). Wired the forced-tool binder call this report observes.
- **Affected** (citations verified at HEAD `c2c25d81`, v0.398.0):
  - `src/binder/forced-tool-choice.ts:33–41` — `FORCED_TOOL_CHOICE_BY_API`:
    six rows (`anthropic-messages`, `bedrock-converse-stream`,
    `amazon-bedrock` → `"tool"`; `openai-completions`,
    `mistral-conversations`, `mistral` → `"function"`). No
    `openai-responses` row (nor `azure-openai-responses` /
    `openai-codex-responses`, the sibling Responses-family members of the
    installed pi-ai `KnownApi`).
  - `src/binder/forced-tool-choice.ts:55–59` — the outside-the-table default
    takes the `{type:"tool",name}` arm. The module header's justification —
    "the typed-query provider gate bounds which apis are reachable on the
    respond path" (`:21–23`) — is true only for the respond path: nothing
    bounds which apis are reachable through `bind_model:`.
  - `src/binder/binder-inference.ts:468` — `buildBinderCompleteCall` writes
    that spelling into every binder attempt's `options.toolChoice`.
  - `src/extension/production-theta-producer.ts:1316–1339`
    (`#completeBinderReply`) — dispatches the triple verbatim; `:3296–3299` —
    the typed-query respond path's contrast: an api outside
    `TYPED_QUERY_SUPPORTED_PROVIDER_APIS` gets
    `synthesizeUnsupportedProviderTransportError` instead of a wasted
    provider call. No analogous check exists anywhere on the binder path
    (load-time binder-model resolution checks only registry membership and
    the universally-W `strictCapable` probe,
    `src/extension/production-composition.ts:660`).
  - `src/binder/provider-error-mapping.ts:63–70` —
    `TYPED_QUERY_SUPPORTED_PROVIDER_APIS` (`openai-responses` deliberately
    outside it for typed queries; the binder never consults it).
  - `src/extension/sdk-inventory.ts:352–358` — the `api-coverage`
    `apiUnionSnapshot` is `["openai-completions", "mistral",
    "anthropic-messages", "amazon-bedrock"]`, while the installed pi-ai's
    `KnownApi` (`node_modules/@earendil-works/pi-ai/dist/types.d.ts:14`) is
    `"openai-completions" | "mistral-conversations" | "openai-responses" |
    "azure-openai-responses" | "openai-codex-responses" |
    "anthropic-messages" | "bedrock-converse-stream" |
    "google-generative-ai" | "google-vertex" | "pi-messages"`. The coverage
    gate that guards the temperature/seed tables therefore cannot flag the
    missing rows: it enumerates a snapshot that no longer names the apis the
    host actually serves. Two snapshot members (`mistral`, `amazon-bedrock`)
    are not `KnownApi` members at the installed pin at all.
  - Same-mechanism sibling gaps on the same call, benign today: the
    per-(api, model-id) temperature table has no `openai-responses` row so
    `temperature: 0` is sent (tolerated by the probed gpt-4o/gpt-4.1), and
    `BINDER_SEED_FIELD_BY_API` (`src/binder/binder-inference.ts:70–76,
    484–487`) has no row so no seed is sent to a seed-accepting OpenAI api.
- **Observed at:** v0.398.0, HEAD `c2c25d81`, live; host model registry as
  configured for `npm run test:live`. Models `unity-responses/gpt-4o` and
  `unity-responses/gpt-4.1` (api `openai-responses`, credentialed —
  `hasConfiguredAuth` true), control `unity-completions/gpt-4o`
  (api `openai-completions`).

## Summary

One report, two faces sharing one root cause (the per-api tables and their
coverage gate drifted from the installed pi-ai `KnownApi`):

- **Face A (live-witnessed hard 400):** `FORCED_TOOL_CHOICE_BY_API` has no
  Responses-family row, so every `openai-responses` binder call ships the
  outside-the-table `{type:"tool",name}` default the endpoint rejects.
- **Face B (code-verified):** the `api-coverage` `apiUnionSnapshot` is stale
  — six installed `KnownApi` members missing, two snapshot members
  (`mistral`, `amazon-bedrock`) not in `KnownApi` at the installed pin — so
  the gate that should force rows for new apis cannot fire; the same
  staleness also un-guards 0064's temperature table.

`buildBinderCompleteCall` spells the forced tool choice per
`FORCED_TOOL_CHOICE_BY_API` and defaults any unlisted api to
`{type:"tool",name}`. The operator's registry serves `openai-responses`
models today (the `unity-responses` provider); pi-ai's `openai-responses`
adapter passes `options.toolChoice` through verbatim
(`node_modules/@earendil-works/pi-ai/dist/api/openai-responses.js:202–203`),
and the Responses API rejects `type:"tool"` with a 400. The classifier maps
the reply to the transport class, the per-invocation transport budget
re-issues the identical call, the second failure surfaces
`theta /<name>: argument binder unavailable (openai-responses: …)`, and the
theta body never runs.

Unlike the typed-query respond turn — which refuses an unsupported api with
a synthesized `TransportError` before any provider call — the binder has no
provider gate: `bind_model: unity-responses/gpt-4.1` resolves at load
(registry exact-match plus the universal-W `strictCapable` probe) and the
failure is discovered only by paying for two doomed provider calls per
slash invocation.

## Reproduction

All commands run in the hunt worktree at HEAD `c2c25d81`.

### Reach 1 — the production call triple, with the counterfactual

Dispatch `buildBinderCompleteCall` + registry auth threading (the
`#completeBinderReply` shape) for a one-string-param envelope against
`unity-responses/gpt-4.1`, then re-dispatch with the `toolChoice` spelling
alone changed:

```
[shipped {type:"tool",name}]           stop=error  err=OpenAI API error (400): … "Invalid value: 'tool'. Supported values are: … 'function', …"  tool=NO
[nested {type:"function",function:{…}}] stop=error  err=OpenAI API error (400): … "Missing required parameter: 'tool_choice.name'."               tool=NO
[flat   {type:"function",name}]         stop=toolUse err=-  tool={"name":"__theta_bind_d8650950b39a4ce4","arguments":{"envelope":{"kind":"ok","args":{"topic":"hello"}}}}
```

Neither shipped spelling works on this api: the `"tool"` default 400s on the
`type` value and the `"function"` row's nested form 400s on the missing flat
`name`. The Responses-native flat `{type:"function",name}` — a third
spelling no current row produces — force-calls the binder tool and returns a
clean envelope. Nothing else in the triple moved. Control: the identical
dispatch against `unity-completions/gpt-4o` (api `openai-completions`, the
`"function"` row) is `stopReason:"toolUse"` with a valid envelope.

### Reach 2 — end to end through the shipped composition root

Plant a `mode: prompt` theta with two `params:` fields (never a bypass) and
`bind_model: unity-responses/gpt-4.1`, boot the shipped extension through
`tests/live/harness.ts`, drive `/hcresp topic alpha count 3`:

```
NOTES: ["theta /hcresp: argument binder unavailable (openai-responses: OpenAI API error (400): {\"message\":\"litellm.BadRequestErr…"]
USER TEXTS: []
details.event: {"kind":"transport","theta":"/hcresp","invocation_id":"4b7ed949-…","message":"OpenAI API error (400): … \"Invalid value: 'tool'. …\"","occurred_at":…}
```

The theta registered (registration asserted token-free before the drive),
the note is the *Binder model transport failure* row capped at 120 code
points, `userTexts` is empty (the body never ran), and the structured
`details.event` carries the full 400.

## Expected behaviour

- `docs/spec_topics/pi-integration-contract/binder-inference.md:14` — the
  envelope is attached as a single forced tool "through the same
  per-provider `options.toolChoice` mechanism the typed-query forced respond
  turn uses", with the per-provider behavioural presuppositions pinned at
  `docs/spec_topics/pi-integration-contract/conversation-drive.md`
  `#complete-forced-tool-presupposition`. A forced tool choice that a
  provider api rejects as a matter of request shape delivers neither.
- The delivered behaviour must not be "the whole `params:` feature returns
  `argument binder unavailable`, twice-billed, on every model of an api the
  host registry serves".

## Actual behaviour / root cause

`forcedToolChoiceForApi("openai-responses", name)` misses the six-row table
and returns the `{type:"tool",name}` default (`forced-tool-choice.ts:55–59`).
pi-ai's `openai-responses` adapter forwards it verbatim
(`openai-responses.js:202–203`: `params.tool_choice = options.toolChoice`),
the endpoint 400s, `#classifyBinderAttempt` routes the non-normal
`stopReason:"error"` through `classifyProviderResponse` to the transport
class, `runBinderCallWithCancellation` spends the single transport budget on
an identical re-issue (HC3-a), and `runBinder` emits the transport row and
returns `bound: false`.

**Why no gate catches it.** Three layers each assume another layer bounds
the reachable apis:

1. The spelling table's header points at "the typed-query provider gate"
   (`forced-tool-choice.ts:21–23`) — which the binder path never consults.
2. Load-time binder-model resolution admits any registry-listed model; the
   `strictCapable` probe is the universal-W branch under the pin.
3. The `api-coverage` bump gate enumerates a stale `apiUnionSnapshot`
   (`sdk-inventory.ts:352–358`) that predates `openai-responses`, so the
   "new pi-ai `Api` value lands here on a bump" assumption has not held:
   the installed pi-ai's `KnownApi` carries six values the snapshot lacks.

**Why no test catches it.** The offline pins
(`tests/binder-forced-tool-dispatch.test.ts`,
`tests/binder-inference-provider-mapping.test.ts`) assert the table's
existing rows and the `{type:"tool",name}` default for unlisted apis — the
exact behaviour that breaks. The live suite's binder cells all resolve
anthropic-served models (the shared preference rule prefers
`claude-sonnet-5`), so no live cell ever constructs a binder call for a
Responses-api model.

## Why it matters

1. `bind_model:` is a documented author surface and the registry the host
   ships serves `openai-responses` models today; the doc guidance even
   steers authors toward cheap structured-output models, several of which
   (`gpt-4o-mini`-class) a host may serve only through a Responses endpoint.
2. The failure is silent until paid for: registration is clean, and each
   invocation costs two provider calls to reach a deterministic
   request-shape 400 (the 0064 report's economics, unchanged).
3. The affected set is a whole api family, and the same stale-snapshot gap
   covers `azure-openai-responses`, `openai-codex-responses`,
   `google-generative-ai`, `google-vertex`, and `pi-messages` — every one an
   installed-`KnownApi` member outside all three per-api tables (untested
   live here; no such models credentialed beyond `openai-responses`).

## Fix

Constraint-pinned; the route mirrors bug 0064's settled Option 1:

- **A third spelling row — not a re-key.** `FORCED_TOOL_CHOICE_BY_API`
  needs a NEW Responses-family arm producing the flat
  `{type:"function",name}` form. Reach 1 measured that BOTH shipped
  spellings 400 on this family (the `"tool"` default on the `type` value,
  the existing `"function"` row's nested form on the missing flat `name`),
  so mapping `openai-responses` onto the existing `"function"` row does not
  fix it. The spec's pin
  clarification under `conversation-drive.md`
  `#complete-forced-tool-presupposition` (which names the table) takes the
  same-commit row.
- **The stale `apiUnionSnapshot`.** The coverage gate's premise is that the
  snapshot tracks the pinned pi-ai `KnownApi`; at the installed pin it does
  not. Refreshing it forces the temperature and seed tables to take
  explicit rows (or documented defaults) for the Responses family in the
  same commit, per the gate's own two-direction assertion.
- **Whether the binder should be gated at all.** The asymmetry with the
  respond path (`:3296–3299`) is a design decision this report does not
  make: either the binder gains the same supported-api bound (refuse at
  load or synthesize before dispatch), or the spelling table is treated as
  total over the snapshot and the gate premise repaired. Either way the
  current state — no gate and no row — is the defect.
- **Test witness — live, and it must be live; one offline pin must flip.**
  `tests/binder-inference-provider-mapping.test.ts:658` (cka-34) currently
  pins the broken outside-the-table default ("an api outside the table takes
  the normalized spelling") — that witness must flip with the fix. The
  offline pins otherwise assert the shipped default, so no offline cell can
  red on this. The witness is one
  live cell driving a non-bypass `params:` theta whose `bind_model:` names a
  registry-served `openai-responses` model, asserting the `bind_echo`
  success note and the absence of `argument binder unavailable`. That cell
  reds today at HEAD (Reach 2's exact observables) and greens under a flat
  `{type:"function",name}` row.

## Non-goals

- **The transport-class retry spending a call on an identical request.**
  Spec-pinned immediate re-issue; the deterministic 400 being retried is a
  consequence of the request-shape defect (0064 §Non-goals, unchanged).
- **The 120-code-point cap truncating the 400 body in the note.** Conformant;
  the full message is in `details.event.message` since 0397.
- **`unity-responses` litellm/Azure specifics.** The error body is
  gateway-flavoured but the rejected value (`type:"tool"`) and the accepted
  flat form are OpenAI Responses API surface, measured directly in Reach 1.
- **The registry listing models the endpoint does not serve**
  (`claude-fable-5-1` → 404) — host registry staleness, classified transport
  correctly by theta; recorded in the hunt log, not a theta defect.

## Provenance

- Spec: `docs/spec_topics/pi-integration-contract/binder-inference.md:14`
  (forced-tool attachment + per-provider `toolChoice` mechanism);
  `docs/spec_topics/pi-integration-contract/conversation-drive.md`
  `#complete-forced-tool-presupposition` (the pin clarification naming the
  spelling table); `docs/spec_topics/binder/determinism-cancellation-failure.md`
  (§Failure-class taxonomy transport row, §per-invocation-retry-budget);
  `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` (HC3-a, HC3-d);
  `docs/spec_topics/binder/binder-model-and-context.md`
  (#strict-capability-requirement — the load gate that admits the model).
- Implementation evidence at `c2c25d81`: `src/binder/forced-tool-choice.ts:21–23,
  33–41, 55–59`; `src/binder/binder-inference.ts:468, 478–480, 484–487`;
  `src/extension/production-theta-producer.ts:1316–1339, 3296–3299`;
  `src/binder/provider-error-mapping.ts:63–70`;
  `src/extension/sdk-inventory.ts:352–358`;
  `node_modules/@earendil-works/pi-ai/dist/types.d.ts:14` (`KnownApi`);
  `node_modules/@earendil-works/pi-ai/dist/api/openai-responses.js:202–203`
  (verbatim `tool_choice` passthrough).
- Live evidence at `c2c25d81`: production-triple probes against
  `unity-responses/gpt-4o` and `unity-responses/gpt-4.1` (shipped default,
  nested-function counterfactual, flat-function counterfactual), the
  `unity-completions/gpt-4o` control, and the end-to-end H8a-harness drive
  (`/hcresp`) with registration precondition, note, empty `userTexts`, and
  `details.event` recorded verbatim above. Scratch probes deleted after
  recording, per hunt protocol.
