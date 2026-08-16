# Bug 0065 — `ContextOverflowError` is unreachable for `anthropic-messages`: the adapter never fires `onResponse` on an HTTP 400, so the `httpStatus === 400` gate on the anthropic overflow signature can never be satisfied and a real `prompt is too long` classifies as `TransportError { retryable: true, http_status: null }` — and on the counterfactual-correct path the pi-ai-formatted `errorMessage` yields five numeric runs, so `tokens_used` / `tokens_limit` are `null` anyway

- **Status:** fixed (0.100.0). Live-confirmed against a genuine provider overflow.
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

## Fix (0.100.0)

- **What shipped:**
  - `src/binder/provider-error-mapping.ts` — §Fix element 1:
    `overflowStatusGateSatisfied`'s shared `anthropic-messages` / `mistral` /
    `mistral-conversations` arm is `input.httpStatus === 400 ||
    input.httpStatus === null` (`:276`), the bedrock posture restricted to the
    no-HTTP-response class; the openai arm (`:277-281`) and the bedrock arm
    (`:282-285`) are byte-untouched, so a captured non-400 status still vetoes.
    §Fix element 2, route (a): `PROVIDER_MESSAGE_MEMBER` (`:208`) and
    `providerMessageWindow` (`:223`) narrow the scanned string to the
    *provider-message window* inside `extractOverflowTokens` (`:239`) before
    the unchanged exactly-two-runs rule (`:250`). `NUMERIC_RUN` (`:198`) and
    the `runs.length !== 2` fallback are unchanged.
  - `docs/spec_topics/pi-integration-contract/provider-error-mapping.md` — the
    three amendments §Fix names, and only those. `:7` (*Classifier input
    surface*) — the `unless` carve-out now names the CONDITION (a response
    reaching the classifier with no captured HTTP status) rather than the
    provider, scoped to the `anthropic-messages` / `mistral` / `amazon-bedrock`
    rows with an explicit `openai-completions` exclusion; the captured-status
    veto is stated; `amazon-bedrock` is the exemplar, not the scope; and the
    anthropic non-firing is recorded as MEASURED, not assumed, with the
    measurement and the item-(af) routing retained. `:17` — the anthropic row
    reads "HTTP 400, or no captured HTTP status", regex byte-identical. `:24`
    (*Overflow token-count extraction*) — the provider-message-window step,
    stated bytes-in/values-out, with the layering argument and both worked
    examples. `:18`/`:19`/`:20` untouched: the mistral row inherits the
    admission through `:7`'s condition-scoped carve-out precisely because
    mistral is UNMEASURED and must acquire no measurement claim. The file is
    86 lines before and after and every `<a id=...>` anchor sits at its
    original line (3, 7, 9, 11, 22, 31, 38, 54, 65), so no citing document
    drifted.
  - `tests/binder-inference-provider-mapping.test.ts` — +406 lines, STRICTLY
    additive (`git diff --numstat` = `406 0`): 12 new cells beside the existing
    classifier table.
  - `tests/live/provider-error-revalidation-gate.test.ts` (new) — the
    mechanical form of the *Re-validation gate* the §Fix *Test witness* names.
  - `tests/off-session-transport-classification.test.ts` — comment text only
    (`git diff --numstat` = `7 2`, every changed line a `//` comment); see
    *Self-authorizations* below.

- **Element-2 route decision — (a), settled by measurement.** The report left
  (a) vs (b) open and pinned the criteria. Measured fresh at HEAD `c09384c4`
  (v0.99.0, pi-ai `0.80.10`), because the report's evidence dates to 0.52.0:

  | probe | formatted `errorMessage` | whole-string runs | provider-message window | window runs |
  |---|---|---|---|---|
  | real anthropic overflow, `claude-haiku-4-5` | `400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 220044 tokens > 200000 maximum"},"request_id":"req_011Ce67AeKSksfCvdLP3Q6Ha"}` | 7 | `prompt is too long: 220044 tokens > 200000 maximum` | 2 → 220044 / 200000 |
  | deliberate 400 (`temperature` at `claude-sonnet-5`) | `400 {…"message":"``temperature`` is deprecated for this model."…}` | 5 | the bare message | 0 |
  | live `openai-completions` (unity gateway) | `401: {"message":"LiteLLM Virtual Key expected. Received=UNIT****KEY1, expected to start with 'sk-'.","type":"auth_error","param":"None","code":"401"}` | 3 | the bare message | 1 |
  | live `openai-completions` (openrouter) | `401: {"message":"Missing Authentication header","code":401}` | **2** | the bare message | 0 |

  The formatted SHAPE is unchanged since 0.52.0 (`<status> <JSON body>`); only
  the `request_id`'s digit runs differ, so the count is 7 here where the report
  recorded 5 — `!== 2` either way. Route (b) was rejected on three independent
  grounds: "two largest runs" contradicts `:24`'s own one-run and three-run
  `null`-fallback rules and would have moved two pre-existing cells; a
  `(\d+) tokens > (\d+)` capture does not match the section's own worked
  example (`"requested 1,234,567 tokens, limit 200,000"` has no `>`); and the
  last row above shows the unnarrowed rule already yields EXACTLY TWO runs both
  of which are the HTTP status, i.e. the shared rule can fabricate a pair from
  envelope metadata. Route (a) removes that class — the offline *fabrication
  guard* cell pins it (unnarrowed, `400: {"message":"maximum context length is
  8192 tokens","code":"context_length_exceeded"}` fabricates
  `tokens_used: 8192, tokens_limit: 400`). The `:7` layering tension the report
  flagged is answered in the amended `:24`: the window is a bounded regex
  SUBSTRING SELECTION over the string theta already receives — the same string
  the overflow signatures already regex-match — materialising no JSON value and
  unescaping nothing, so it reconstructs no parsed error body. The openai side
  of the shared rule was checked against the measured `openai-completions`
  formatted family above (same `<status> <JSON body with an innermost
  "message" member>` shape); the two openai cells are marked DERIVED, NOT
  MEASURED because no live openai-completions OVERFLOW was capturable here.

- **Live re-measurement transcript** (at HEAD `c09384c4`, before any edit):

  ```
  ONRESPONSE FIRINGS: []
  STOPREASON: error
  ERRORMESSAGE: 400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 220044 tokens > 200000 maximum"},"request_id":"req_011Ce67AeKSksfCvdLP3Q6Ha"}
  CLASSIFIER VERDICT (live inputs): {"kind":"transport","http_status":null,"provider":"anthropic-messages","retryable":true}
  ```

  Success control on the same model: `ONRESPONSE FIRINGS: [200]`,
  `STOPREASON: stop` — so `onResponse` IS registered and DOES fire; the empty
  firings belong to the adapter's error path, not to the harness. The
  deliberate `temperature` 400 at `claude-sonnet-5` likewise recorded
  `ONRESPONSE FIRINGS: []`. This is the measurement the amended `:7` records,
  and it resolves the *Provider-owned-wording presupposition* review item (af)
  for `anthropic-messages` against evidence rather than assumption. It is a
  DIRECT pi-ai call carrying `temperature` deliberately, not the binder path —
  bug 0064's binder-temperature-400 signature is retired (0.94.0) and is not
  re-introduced.

- **Gates** (each run at the tip, not taken on report):
  - witness: `npx vitest run tests/binder-inference-provider-mapping.test.ts`
    → `Test Files 1 passed (1)` / `Tests 58 passed (58)`.
  - full suite: `npm test` → `Test Files 303 passed (303)` /
    `Tests 4999 passed (4999)`.
  - typecheck: `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) → clean.
  - lint: `npm run lint` → clean.
  - live: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/provider-error-revalidation-gate.test.ts` → 3/3, cell (c)
    `CLASSIFIER VERDICT: {"kind":"context_overflow", …,
    "tokens_used":220039,"tokens_limit":200000,"raw_response":null}` on a real
    refused-before-inference overflow.
  - live regression: `tests/live/live-production-acceptance.test.ts` → 39/39,
    including the bug-0064 cell.

- **Review:** 2 rounds. Round 1 (deep) — 5 findings: the amended `:7` claimed
  the carve-out "governs every row" while the shipped openai arm refuses `null`
  (spec); the new test header narrated the pre-fix state in the present tense
  (house-rule); stale `provider-error-mapping.ts:NNN` citations shifted by the
  element-2 insertion (test); `:24` attributed to `:7` a pin it does not make
  and stated a `request_id` universal the openai family refutes (spec); the
  `PROVIDER_MESSAGE_MEMBER` `matchAll`/`lastIndex` safety comment was half-true
  (house-rule). All five fixed; the fixer correctly wrote the true post-fix
  line numbers rather than the pre-fix ones dictated to it, its own comment
  replacement having shifted everything at/after line 200 by +2. Round 2
  (fast) — CLEAN, with one non-blocking `test` residual (below).

- **Verification:** SOLID, all four obligations SATISFIED.
  - Witness reds both ways, per element, separately: neutralising element 1
    (`return input.httpStatus === 400;`) reds 4 cells plus live cell (c)
    against a real provider call; neutralising element 2 (scan `message`
    instead of the window) reds 4 cells, including the fabrication guard
    observing `tokens_used: 8192, tokens_limit: 400`. Both restorations
    byte-exact — `git hash-object` returned
    `2ec686989462f02caed754090f9591ef28f33b25` before and after each, with
    `diff` against an out-of-tree copy empty.
  - Full default suite green (303 / 4999).
  - Live end-to-end: cell (c) green on a real overflow; H8a 39/39 with no
    documented correct-reason signature observed.
  - Lint and typecheck clean.
  - `extensions/permitted-codes.json` byte-unchanged; the spec file is 86 lines
    with every anchor at its original line; scratch sweep clean.

- **`determinism-cancellation-failure.md` fold — verified unchanged at HEAD.**
  §Failure-class taxonomy still reads "*Context-overflow handling.* A
  classifier output of `ContextOverflowError` is treated as transport-class for
  retry purposes", and the file is untouched by this change (`git diff --stat`
  empty). §Non-goals' "the binder's surface is unchanged by this bug" therefore
  still holds: the binder's retry budget sees the same class before and after,
  and only the theta-code `@`-query surface changes.

- **0065 live-signature retirement condition.** A real anthropic overflow now
  classifies `context_overflow` with populated counts. The mechanical witness
  is `tests/live/provider-error-revalidation-gate.test.ts` cell (c): a genuine
  `prompt is too long` at `claude-haiku-4-5` yields
  `{"kind":"context_overflow","tokens_used":<measured>,"tokens_limit":200000}`.
  Cell (b) keeps the version-coupled premise measured
  (`ONRESPONSE FIRINGS: []` on a cheap deliberate 400) and cell (a) keeps that
  measurement falsifiable (`[200]` on success).

- **Self-authorizations** (recorded verbatim; the interactive question channel
  was unavailable in this run):
  1. *Question that would have been asked:* "The WHY comment in
     `tests/off-session-transport-classification.test.ts` cell (v) asserts in
     prose that 'anthropic's gate is 400-only and unobservable at this seam'.
     Element 1 makes the first clause false. May the comment be corrected in
     the same commit?" *Evidence settling it (three independent sources):*
     (i) `src/binder/provider-error-mapping.ts:276` — the arm is no longer
     400-only, so the sentence is factually false post-commit;
     (ii) `src/extension/production-theta-producer.ts:5378-5401` —
     `classifyOffSessionReply` presents a fixed `httpStatus: 200`, so the
     SECOND clause stays true but for a reason the comment does not state;
     (iii) `CLAUDE.md` — comments say WHY, and a WHY that is false is worse
     than none. *Bound:* comment text only, in one cell of one file; zero
     assertion, input, matcher or control-flow changes; the file's test count
     and every `expect` byte-identical. *STOP valve:* had the correction
     required touching an executable line, or had the file redded, the run
     would have stopped and reported. *Outcome:* `git diff --numstat` = `7 2`,
     every changed line a `//` comment; the file runs `10 passed (10)`.
  2. *Not self-authorized — stopped and recorded instead:* the off-session
     fold's fabricated `httpStatus: 200` (residual 1). It touches behaviour and
     would red a protected cell, so it is reported, not fixed.

- **Residuals:**
  1. **The off-session `@`-query fold is NOT reached by this fix, and this
     report is wrong about why.** §Actual behaviour states the classifier's
     status comes from "`captured?.status ?? null` … and the fixed `null` fold
     in the off-session path". At HEAD the off-session fold is not `null`:
     `classifyOffSessionReply` hard-codes `httpStatus: 200`
     (`src/extension/production-theta-producer.ts:5398`, rationale at
     `:5371-5377`), and has since bug 0007's fix
     (`git log -S 'httpStatus: 200,'` → `87c044ff … v0.18.0`) — the report was
     already wrong on this point when filed at 0.52.0. Consequence: an
     anthropic overflow arriving through the off-session `@`-query fold still
     classifies `transport`, because a captured non-400 status vetoes — exactly
     what §Fix constraint (ii) requires. This is correctly out of scope:
     `classifyOffSessionReply` is not one of the two functions §Fix names, and
     flipping its 200 to `null` would red
     `tests/off-session-transport-classification.test.ts` cell (v), which needs
     the 200 to reach openai's HTTP-200 body-envelope arm. §Why it matters 1's
     "Every `@`-query in a theta body against an Anthropic model is on this
     path" is therefore only partly discharged: the binder path
     (`#classifyBinderAttempt`, real captured status at
     `production-theta-producer.ts:1073`) is fixed; the off-session query fold
     needs its own report. Independently confirmed by review round 1 and by the
     verifier.
  2. **`openai-completions` is now the only token-extracting row that vetoes on
     no-captured-status.** Its arm stays `400 || (200 && stopReason "error")`
     per §Non-goals. Whether the openai adapter withholds `onResponse` on a 400
     is UNMEASURED here: no `openai-completions` credential resolves for an
     out-of-band `complete()` in this environment (unity gateway →
     `401: {"message":"LiteLLM Virtual Key expected…"}`; openrouter →
     `401: {"message":"Missing Authentication header","code":401}`).
  3. **Mistral is UNMEASURED.** No `mistral` api provider exists in the
     configured install (anthropic + openrouter + unity gateways only, all
     `anthropic-messages` / `openai-completions` / `openai-responses`), so
     §Non-goals' "the fix should measure them" could not be discharged. The
     mistral arms widen by shared-gate parity only; the two parity cells and
     the amended spec say so explicitly and claim no measurement.
  4. **Mistral's captured-non-400 veto has no dedicated cell** (review round 2,
     non-blocking). Only anthropic is exercised at `httpStatus: 200` with
     overflow wording. The property is guaranteed by construction — all three
     arms fall through to the single `return` at
     `src/binder/provider-error-mapping.ts:276` — so this is coverage symmetry,
     not a behavioural gap.
  5. **Latent tension, pre-existing and unchanged by this diff** (review round
     1): `:7` states the runtime "registers `onResponse` on every `complete()`
     call", while the off-session fold registers none and fabricates a 200.
     Belongs with residual 1.

- **Discharge notes appended:** none. No sibling bug document is affected. The
  RESUME live-signature retirement is the parent's edit; bug 0064's document
  was not touched (its census facts were inputs here, not a surface).

- **Pinned dispositions / non-goals** (unchanged, not re-litigated): whether
  pi-ai should fire `onResponse` on error responses is upstream; the
  `openai-completions` HTTP-200 body-envelope arm is untouched; the binder's
  fold of `ContextOverflowError` into the transport class is unchanged and
  verified above; `raw_response: null` on a probe that supplies no
  `rawResponse` is by construction.
