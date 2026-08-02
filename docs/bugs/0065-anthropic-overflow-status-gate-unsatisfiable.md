# Bug 0065 — `ContextOverflowError` is unreachable for `anthropic-messages`: the adapter never fires `onResponse` on an HTTP 400, so the `httpStatus === 400` gate on the anthropic overflow signature can never be satisfied and a real `prompt is too long` classifies as `TransportError { retryable: true, http_status: null }` — and on the counterfactual-correct path the pi-ai-formatted `errorMessage` yields five numeric runs, so `tokens_used` / `tokens_limit` are `null` anyway

- **Status:** open. Live-confirmed against a genuine provider overflow.
- **Kind:** defect, two elements. Spec and implementation together fail to
  deliver documented behaviour, and the implementation faithfully implements
  a spec rule whose stated precondition does not hold for the provider it
  names.
  1. *The status gate is unsatisfiable.*
     `docs/spec_topics/pi-integration-contract/provider-error-mapping.md:17`
     pins the anthropic overflow signature as "**HTTP 400** with
     `errorMessage` matching
     `/(prompt is too long|exceeds .* context window|maximum context length)/i`",
     and `:7` (*Classifier input surface*) pins the HTTP-status class as
     read from `ProviderResponse.status` delivered through
     `StreamOptions.onResponse`, with the explicit rule that "The
     no-HTTP-response (network-level) class is the case where `onResponse`
     did not fire before `complete()` resolved with
     `AssistantMessage.stopReason: "error"`". Live, the `anthropic-messages`
     adapter does **not** fire `onResponse` on an HTTP-400 error response, so
     every anthropic 400 — overflow included — arrives at the classifier as
     `httpStatus: null`. `overflowStatusGateSatisfied`
     (`src/binder/provider-error-mapping.ts:231–250`) then refuses the match
     and the response falls to the transport arm.
  2. *Token extraction cannot yield two runs.* The same `:24`
     (*Overflow token-count extraction*) rule scans the message for numeric
     runs and populates the two fields only on **exactly two**. The string it
     scans is the pi-ai-**formatted** `errorMessage`, not the provider's
     `error.message`: pi-ai prefixes the HTTP status and appends the whole
     JSON body including `request_id`. A live anthropic overflow yields five
     runs (`400`, `220041`, `200000`, `011`, `8`), so even with the status
     gate satisfied both fields are `null`.
- **Related:**
  [0007](./0007-off-session-error-stop-swallowed-as-ok-empty.md) — fixed
  (0.18.0). Established `classifyProviderResponse` as the single
  classification table and pinned `http_status: null` on the off-session
  fold; this report is about what that table can and cannot conclude from
  the inputs it actually receives.
  [0009](./0009-live-prompt-queryerror-provider-field-derivation.md) — fixed
  (0.19.0). Same family: an author-visible `QueryError` field whose
  derivation diverges from the pinned rule, discoverable only live.
  [0012](./0012-untyped-off-session-mid-abort-transport-not-cancelled.md) —
  fixed (0.25.0). Same shape: the correct terminal variant is specified and
  the runtime reaches a different one.
  [0064](./0064-binder-temperature-400-newest-anthropic-models.md) — found
  against the same live artifact (an anthropic-messages HTTP 400 at
  `claude-sonnet-5`); orthogonal root cause — there the client sends a
  field the model refuses, here the classifier cannot see a valid 400's
  status. Fixing one does not fix the other.
- **Affected** (citations verified at HEAD `d06daae3`, 0.52.0):
  - `src/binder/provider-error-mapping.ts:231–250` —
    `overflowStatusGateSatisfied`. `case "anthropic-messages": … return
    input.httpStatus === 400;` (`:233–237`). Contrast the bedrock arm
    (`:243–247`, `return true`), which the spec carved out precisely because
    that adapter is SDK-only and fires no `onResponse`; anthropic needs the
    same carve-out on the same evidence and does not have it.
  - `src/binder/provider-error-mapping.ts:257–277` —
    `matchOverflowSignature`: signature matches, then the gate refuses, then
    `null`.
  - `src/binder/provider-error-mapping.ts:334–369` —
    `classifyProviderResponse`: step 1 (overflow) declines, step 2
    (`stopReason === "length"`) does not apply (the stop reason is
    `"error"`), step 3 constructs the `TransportError`.
  - `src/binder/provider-error-mapping.ts:285–289` — `transportRetryable`:
    `httpStatus === null` ⇒ `true`. So the definite 400 refusal is marked
    **retryable**, the opposite of the disposition
    `provider-error-mapping.md`'s *`TransportError.retryable` population*
    rule assigns to a non-429 4xx.
  - `src/binder/provider-error-mapping.ts:207–223` —
    `extractOverflowTokens`: `if (runs.length !== 2) return {null, null}`.
    Applied to the pi-ai-formatted string, never two.
  - Consumers that inherit the misclassification:
    `src/extension/production-theta-producer.ts:1003–1013`
    (`#classifyBinderAttempt`, the binder's failure routing) and `:5084–5110`
    (`classifyOffSessionReply`, the off-session query fold introduced by bug
    0007's fix), plus the prompt-mode PIC-51 probes. Every `@`-query in a
    theta body against an Anthropic model is on this path.
- **Observed at:** `0.52.0`, HEAD `d06daae3`, live, model
  `claude-haiku-4-5`, api `anthropic-messages`, real 200k-context overflow.

## Summary

theta's context-overflow classification for Anthropic is gated on an HTTP
status the Anthropic adapter never delivers to it. A genuine
`prompt is too long: 220041 tokens > 200000 maximum` therefore surfaces to
theta code as

```json
{"kind":"transport","http_status":null,"provider":"anthropic-messages","retryable":true, …}
```

instead of `ContextOverflowError`. An author who wrote
`match r { Err(ContextOverflow(e)) => … }` around an `@`-query never takes
that arm against the default provider; they take the transport arm, whose
`retryable: true` invites a retry of a request that cannot succeed.

`docs/spec_topics/query/query-failure-and-repair.md` §Detection of
`ContextOverflowError` and the `QueryError` variant table both present
`ContextOverflowError` as a first-class, author-observable outcome with
`tokens_used` / `tokens_limit`. For `anthropic-messages` at HEAD it is
reachable only through the `stopReason: "length"` output-boundary arm
(`provider-error-mapping.ts:346–355`) — never through an input-side
overflow, which is the case the four per-provider signatures exist for.

## Reproduction

Live, at HEAD `d06daae3`, one `complete()` call against
`claude-haiku-4-5` with a deliberately over-length prompt (`"word "` ×
220 000 ≈ 220 041 tokens against a 200 000 window). The request is refused
before inference, so no output tokens are billed.

Recorded verbatim:

```
ONRESPONSE FIRINGS: []
STOPREASON: error
ERRORMESSAGE: 400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 220041 tokens > 200000 maximum"},"request_id":"req_011CdddveFqhUcGFE8gAYtQa"}
```

`onResponse` was registered on the call and never fired. Feeding the
runtime's own classifier the inputs it would receive on this path:

```
CLASSIFIER VERDICT (live inputs):
  {"kind":"transport",
   "message":"400 {\"type\":\"error\",…\"prompt is too long: 220041 tokens > 200000 maximum\"…}",
   "http_status":null,"provider":"anthropic-messages","retryable":true}
```

The same inputs with the one field the gate wants:

```
CLASSIFIER VERDICT (httpStatus=400):
  {"kind":"context_overflow",
   "message":"400 {…}",
   "tokens_used":null,"tokens_limit":null,"raw_response":null}
```

Both directions are witnessed: the signature regex matches (the
counterfactual reaches `context_overflow`), and the gate is the sole reason
the live path does not.

The counterfactual also exhibits element 2: `tokens_used` and
`tokens_limit` are `null` even though the provider's message states both
numbers. The scanned string is the formatted one, whose numeric runs are
`400`, `220041`, `200000`, `011` (from `req_011Cddd…`) and `8` (from
`…GFE8gAYtQa`) — five, so the `!== 2` fallback fires.

### The same non-firing on an unrelated anthropic 400

A separate probe issuing a `temperature`-carrying call against
`claude-sonnet-5` (rejected `400 … \`temperature\` is deprecated for this
model.`) likewise recorded no `onResponse` firing, while the immediately
following successful call on the same model recorded
`ONRESPONSE STATUS: 200`. The non-firing is a property of the adapter's
error path, not of the overflow case.

## Expected behaviour

`docs/spec_topics/pi-integration-contract/provider-error-mapping.md:5`:

> The runtime maps recognised provider error responses to `QueryError`
> variants per the overflow-signature list below.

`:17`:

> `anthropic-messages` — HTTP 400 with `errorMessage` matching
> `/(prompt is too long|exceeds .* context window|maximum context length)/i`;
> `tokens_used` and `tokens_limit` extracted from `errorMessage` per
> *Overflow token-count extraction* below.

`:7` already contains the machinery for the case where the status is
unavailable — but scoped to one provider:

> an SDK-only provider (`amazon-bedrock` in particular) that resolves with
> `stopReason: "error"` without an `onResponse` invocation is classified as
> network-level by the rule above **unless** its
> `AssistantMessage.errorMessage` matches that provider's overflow signature
> in the list below, in which case the overflow-signature match takes
> precedence

The expected verdict for §Reproduction's response is
`ContextOverflowError` with `message` carrying the provider text and,
per `:24`, `tokens_used: 220041` / `tokens_limit: 200000`.

## Actual behaviour / root cause

**Element 1.** `matchOverflowSignature`
(`src/binder/provider-error-mapping.ts:257–277`) tests the signature first
(match), then calls `overflowStatusGateSatisfied` (`:265` → `:231`), whose
anthropic arm is `input.httpStatus === 400`. The classifier's `httpStatus`
comes from the caller's captured `ProviderResponse` — `captured?.status ??
null` at `src/extension/production-theta-producer.ts:1005`, and the fixed
`null` fold in the off-session path. Live, `captured` is `undefined` for
every anthropic error response, so the gate reads `null === 400` ⇒ `false`.
The overflow returns `null` and step 3 constructs a `TransportError`.

`transportRetryable(null)` (`:285–287`) returns `true`, so the surfaced
error additionally claims the failure is transient. The spec's retryable
rule assigns `true` to network-level failures precisely because they *are*
transient; a 400 refusal misfiled as network-level inherits the wrong
advice.

The spec's own text shows the authors were aware of the class — they wrote
the `unless` carve-out — but scoped it to `amazon-bedrock` on a
presupposition about the anthropic adapter that live behaviour contradicts.
The presupposition is itself flagged for editorial review at `:7` ("Whether
a given provider's pi-ai adapter invokes `onResponse` before resolving is a
behavioural property of `@earendil-works/pi-ai` outside its typed surface").
This report is the resolution of that review item for `anthropic-messages`,
against evidence.

**Element 2.** `extractOverflowTokens`
(`src/binder/provider-error-mapping.ts:207–223`) implements `:24` exactly.
`:24` is written against "the provider's `error.message` text", but `:7`
pins what the runtime actually receives: "the provider error-body wording …
reaches theta only as the `AssistantMessage.errorMessage` string produced by
pi-ai's per-provider error formatter". Those two sentences are not
reconcilable for anthropic: the formatted string carries the HTTP status,
the JSON envelope and the `request_id`, so the numeric-run count is
message-shape-dependent and, for the observed format, never 2. The rule's
worked example (`"requested 1,234,567 tokens, limit 200,000"` → two runs) is
a bare provider message, not a formatted one.

## Why it matters

1. `ContextOverflowError` is an author-visible variant of the `QueryError`
   union with a documented detection story and two documented numeric
   fields. Against the provider theta's own binder-model guidance steers
   authors toward, the input-side half of that story never fires. Author
   `match` arms silently take the wrong branch.
2. `retryable: true` on a definite 400 refusal is actively misleading — the
   one machine-readable hint theta gives a caller about whether to re-issue.
3. The respond-repair / overflow-handling behaviour downstream of the
   classification (`query-failure-and-repair.md`) is keyed on the variant;
   an overflow that classifies transport takes the transport path.
4. Element 2 means that even after element 1 is fixed, the two fields the
   rule exists to populate stay `null` — the fix must address both or it
   delivers a `ContextOverflowError` with no counts.

## Fix

Option 1 (recommended), both elements, at the two functions named.

**Element 1 — widen the status gate to "unavailable status does not veto a
signature match".** `overflowStatusGateSatisfied`'s anthropic (and mistral)
arms become `input.httpStatus === 400 || input.httpStatus === null`, i.e.
the same posture the bedrock arm already has, restricted to the
no-HTTP-response class rather than "any status". Constraints: the spec text
at `:17` and the `unless` clause at `:7` must both be amended so the
carve-out names the *condition* (no captured status) rather than the
*provider*; the amendment must keep a captured non-400 status vetoing the
match (a 200 with overflow wording is the openai-only arm and must not
leak); and the *Provider-owned-wording presupposition* review item (af) at
`:7` should record that the anthropic adapter's non-firing was measured, not
assumed.

**Element 2 — scan the provider message, not the formatted envelope.**
Either (a) extract the innermost `"message"` value from the formatted string
before scanning, or (b) restate `:24` in terms of the formatted string and
change the selection rule from "exactly two runs" to a shape that survives
the prefix/suffix (e.g. the two largest runs, or a `(\d+) tokens > (\d+)`
capture). Constraints: `:24` explicitly justifies the two-run rule as
producing identical values across conforming implementations, so any change
must stay deterministic and must be stated as bytes-in/values-out; option
(b) changes the rule for openai too and must be checked against that
adapter's formatted shape; option (a) introduces a parse of a provider-owned
JSON envelope, which `:7` states pi-ai does not expose and theta should not
reconstruct — that tension is the decision.

**Test witness.** Element 1 is offline-testable once the input is pinned:
a classifier cell with `api: "anthropic-messages"`, `httpStatus: null`,
`stopReason: "error"` and the live `errorMessage` byte string from
§Reproduction, asserting `kind: "context_overflow"`. It reds at HEAD.
Element 2 is the same cell asserting `tokens_used: 220041` /
`tokens_limit: 200000`. The live half — that the adapter fires no
`onResponse` on a 400 — belongs in the pi-version-bump fixture corpus
(`provider-error-mapping.md` *Re-validation gate*), because it is exactly
the version-coupled behavioural property that section says must be
re-measured on each bump; a live cell asserting `ONRESPONSE FIRINGS: []` on
a cheap deliberate 400 is the mechanical form of that gate.

## Non-goals

- **Whether pi-ai should fire `onResponse` on error responses.** An upstream
  question. theta's classifier must be correct against the adapter as it
  behaves; if pi-ai later fires, the widened gate still matches on the
  captured 400.
- **The `openai-completions` HTTP-200 body-envelope arm.** It has its own
  `stopReason === "error"` condition (`:238–242`) and is not affected.
- **`mistral` / `amazon-bedrock` rows.** The mistral arms share the anthropic
  gate and presumably share the defect, but no live mistral credential was
  available in this environment, so the report does not claim them; the fix
  should measure them.
- **The binder's treatment of an overflow.**
  `determinism-cancellation-failure.md` §Failure-class taxonomy folds
  `ContextOverflowError` into the transport class for retry purposes, so the
  binder's surface is unchanged by this bug. The impact is on theta-code
  `@`-queries.
- **`raw_response: null` on the counterfactual verdict.** The caller supplies
  `rawResponse`; the probe passed none.

## Provenance

- Spec: `docs/spec_topics/pi-integration-contract/provider-error-mapping.md:5`
  (§Provider error mapping — the closed "everything else is
  `TransportError`" rule), `:7` (*Classifier input surface* — the
  `onResponse` / `ProviderResponse.status` derivation, the network-level
  class definition, the bedrock `unless` carve-out, and the editorial-review
  routing), `:9` (*Provider-owned-wording presupposition*), `:11`
  (*`TransportError.retryable` population*), `:17` (the anthropic overflow
  signature and its HTTP-400 gate), `:18`–`:20` (the openai / mistral /
  bedrock rows), `:24` (*Overflow token-count extraction*), `:30`
  (*Stop-reason classification*);
  `docs/spec_topics/query/query-failure-and-repair.md` §Detection of
  `ContextOverflowError`;
  `docs/spec_topics/errors-and-results/queryerror-variants.md`
  (the `ContextOverflowError` / `TransportError` field sets).
  User-facing reference: `docs/reference/errors-and-results.md`.
- Implementation evidence at `d06daae3`:
  `src/binder/provider-error-mapping.ts:177–184` (`OVERFLOW_SIGNATURES`, the
  anthropic entry at `:178–179`), `:192–196` (`TOKEN_EXTRACTING_APIS`),
  `:198` (`NUMERIC_RUN`), `:207–223` (`extractOverflowTokens`, the `!== 2`
  fallback at `:217`), `:231–250` (`overflowStatusGateSatisfied`, the
  anthropic/mistral arm at `:233–237`, the bedrock arm at `:243–247`),
  `:257–277` (`matchOverflowSignature`), `:285–289` (`transportRetryable`),
  `:298–332` (`ProviderClassifierInput`, `httpStatus`'s documented `null`
  meaning at `:305–310`), `:334–369` (`classifyProviderResponse`);
  `src/extension/production-theta-producer.ts:936–941` (the per-attempt
  `onResponse` capture), `:1003–1013` (the binder's classifier call, with
  `captured?.status ?? null` at `:1005`), `:5084–5110`
  (`classifyOffSessionReply`, the bug-0007 fold).
- Test evidence at `d06daae3`:
  `tests/binder-inference-provider-mapping.test.ts` — the classifier's
  offline table, whose overflow cells supply `httpStatus: 400` directly and
  therefore never exercise the live input shape.
- Live evidence: scratch probe at HEAD `d06daae3`, model
  `claude-haiku-4-5`, a real 220 041-token prompt against the 200 000
  window; `onResponse` firings, `stopReason`, `errorMessage` and both
  classifier verdicts recorded verbatim in §Reproduction. Probe deleted
  after recording, per hunt protocol.
