# Bug 0010 — Typed-query forced respond turn is a user-visible `sendUserMessage` turn with a JSON-in-text instruction, not the specified off-session `complete()` with forced tool choice

- **Status:** fixed (0.20.0).
- **Kind:** defect — implementation mechanism diverges from the documented
  conversation-drive contract. Four spec pages pin one mechanism for the typed
  query's forced respond turn: dispatched **off-session** through pi-ai's
  `complete()` free function, carrying the synthesised `__theta_respond_<slug>`
  tool with `options.toolChoice = { type: "tool", name }` forced, attaching
  **no turn** to the driven session. The live prompt-mode implementation drives
  it as a **user-visible `pi.sendUserMessage` turn** — fused with the free
  phase into one streamed turn whose text inlines the lowered schema behind a
  prose JSON-only instruction — and obtains the payload by `JSON.parse` of the
  trailing-turn assistant text. No production code path sets `toolChoice` at
  all — the one setter in `src/` is a test-only binder call constructor
  (`buildBinderCompleteCall`, `src/binder/binder-inference.ts:159`, no
  production caller); no respond tool is ever registered or passed. The directionality
  is not ambiguous: the spec side is a deliberately-resolved blocker-level
  design decision (spec-review finding T34, resolved 2026-06-05), and the
  commit that introduced the implementation mechanism recorded in its own notes
  that the streamed-JSON expectation "directly contradicts SLSH-2".
- **Affected:** `LivePromptQueryModel.forcedRespondTurn`
  (`src/extension/production-theta-producer.ts:3226`, drive at :3237 →
  `#driveUserVisibleTurn` :3266 → `pi.sendUserMessage` :3301, text-parse at
  :3250–3253); the typed-query construction in `#resolvePromptQuery` (:2088):
  `queryText = renderTypedAwareQueryText(...)` (:2132, template body
  :3597–3612), `governor: typed ? undefined` (:2154), `maxRounds: typed ? 0`
  (:2173); the prompt-mode respond-repair drive `driveStreamedUserTurn`
  (:3787, `sendUserMessage` :3812). Same-mechanism sibling: the off-session
  driver `OffSessionQueryModel.forcedRespondTurn` (:3407) resolves through
  `offSessionComplete` (:3676), whose `complete(model, { messages: [...] })`
  call (:3685) passes **no `tools` and no `toolChoice`** either. The subagent
  child inherits the live path (the child runs the same driver against its own
  session). Built-but-unwired counterparts of the specified mechanism:
  the respond-tool registration naming (`src/runtime/tool-registration.ts:306–313`;
  the producer imports only `deriveToolLabel`, :219), the typed-query provider
  gate (`checkTypedQueryProviderSupport` /
  `synthesizeUnsupportedProviderTransportError`,
  `src/binder/provider-error-mapping.ts:101/:133` — no production callers),
  the QRY-12 follow-up renderer's `__theta_respond_<slug>` tool reference
  (`src/runtime/query-followup-render.ts:88`), which names a tool that is never
  registered in any session, and the PIC-17 active-set install-vector machinery
  (`withActiveSetGating` / `CallableSetInstall`,
  `src/runtime/conversation-drive.ts` — the `[...thetaCallableSetNames,
  respondToolName?]` step-2 vector), exercised only by
  `tests/conversation-drive.test.ts`; the live drive installs the callable set
  inline without a respond-tool slot (:3292–3293).
- **Observed at:** `0.19.0`, host Pi `0.82.1` (repo-local SDK pins
  `@earendil-works/pi-ai` / `pi-coding-agent` 0.80.10). Recorded verbatim as
  pre-existing and out of scope by the bug-0009 fix review (round 2).

## Fix (0.20.0)

Option 1, staged behind the unchanged `QueryModelDriver` seam. Facet by facet
against the table below:

- **Dispatch channel / session surface.** `LivePromptQueryModel.forcedRespondTurn`
  now dispatches off-session through pi-ai `complete()`
  (`dispatchForcedRespondTurn`, `src/extension/production-theta-producer.ts`):
  the conversation is rebuilt from the PIC-53 read surface
  (`buildSessionContext(ctx.sessionManager.getEntries(), getLeafId())`,
  windowed to the query's own turns), the QRY-15 template is the trailing
  `context.messages` entry, and nothing attaches to the driven session — zero
  `sendUserMessage` calls for the respond turn, no transcript card. The fused
  `maxRounds: typed ? 0` collapse and the `governor: typed ? undefined`
  exemption are gone.
- **Tool contract.** The synthesised `__theta_respond_<slug>` tool is
  registered through the PIC-44 cache (byte-equality verify, `_<n>`
  disambiguation) and installed in the session active set for every driven
  typed turn (`withActiveSetGating`, install vector
  `[...thetaCallableSetNames, respondToolName]`); an early on-session respond
  call resolves the query one-shot (invalid payloads feed back `isError`
  results). The forced dispatch passes the tool as the single `context.tools`
  entry; its "execute AJV-validates" contract is realised caller-side — the
  reply's first matching `ToolCall`'s `arguments` are extracted per
  binder-inference.md (success extraction precedes `stopReason`
  classification) and AJV-validated; the wrong-tool / plain-text arms produce
  ERR-17's exact literals.
- **Tool-choice forcing.** `options.toolChoice` is supplied from
  `FORCED_TOOL_CHOICE_BY_API` — a fixed per-api spelling table keyed by the
  resolved respond model's `.api` — because the pinned pi-ai adapters consume
  provider-native spellings rather than mapping a uniform `{ type: "tool",
  name }` (spec Pin clarification landed at conversation-drive.md
  §`complete()`-forced-tool presupposition; §Runtime of
  implementation-notes.md and version-bump-step2.md items (u)/(aa)/(ab)/(af)
  reworded to match).
- **Two-phase structure / CIO-4.** The free phase drives on-session via
  `sendUserMessage` under the real `tool_loop.max_rounds` budget with the
  governor armed; exhaustion falls to the forced respond terminator
  (`runTypedQueryLoop`, `src/runtime/query-tool-loop.ts`). `max_rounds: 0`
  fuses the rendered prompt and QRY-15 template into the single forced
  message.
- **Respond model + options.** The forced dispatch takes the theta-resolved
  `model:` (invocation-pinned session model when frontmatter omits it), and
  threads `options.signal` plus registry auth (`getApiKeyAndHeaders`, probed
  as an optional capability).
- **Respond-repair.** Each attempt restarts the whole two-phase loop
  (QRY-14 ¶3): the QRY-12 follow-up — whose respond-tool reference now
  threads the registered (possibly disambiguated) tool name — opens a
  restarted governed free phase, terminated by a fresh off-session forced
  dispatch; transport and cancelled failures terminate repair with no
  attempts debit.
- **Provider gate.** `checkTypedQueryProviderSupport` /
  `synthesizeUnsupportedProviderTransportError` are wired at load
  (`checkThetaTypedQueryProviderSupport`,
  `src/extension/production-composition.ts`) and at dispatch (zero provider
  calls outside the pinned six-member api set; the set and its rationale are
  spec-pinned at conversation-drive.md §Provider compatibility).
- **Off-session sibling.** `OffSessionQueryModel` (`subagent fn` bodies) runs
  the same two-phase shape over a held conversation: a `complete()` tool loop
  services free-phase `ToolCall`s over the inherited callable set
  (`lowerModelDrivenToolCall`, previously unwired), early respond calls are
  serviced in-loop, the forced dispatch appends QRY-15 to the held history,
  and repair follow-ups rejoin it; respond exchanges never do. Untyped
  off-session queries gain the same tool loop without a respond tool. The
  subagent child inherits the live path unchanged.
- **Cancellation discipline.** An abort anywhere — free phase, respond
  dispatch, repair boundary, repair dispatch — surfaces the CANCEL terminal
  outcome with no post-abort provider dispatch (`runTypedQueryLoop` guards,
  the `dispatchForcedRespondTurn` pre-gate, and the signal-aware
  `mapForcedTurnToRepairOutcome`); a reply-side `"aborted"` stop under a live
  signal remains transport. Failure classification is otherwise the
  0007/0009-aligned path, unchanged.

Regression surface: `tests/typed-two-phase-live.test.ts`,
`tests/off-session-two-phase.test.ts`, `tests/typed-repair-two-phase.test.ts`,
`tests/typed-query-provider-gate.test.ts`,
`tests/query-tool-loop-noncompliance.test.ts`,
`tests/query-followup-render-initial.test.ts`, plus re-pinned cells in
`tests/prompt-provider-field-derivation.test.ts`,
`tests/off-session-transport-classification.test.ts`, and
`tests/binder-inference-provider-mapping.test.ts` (overflow alias keys). The
token-gated acceptance/live typed cases were reconciled to the fixed
mechanism: fixtures echo the AJV-validated value behind committed sentinels
(`ACC TYPED NAMED RESULT` / `ACC TYPED INLINE RESULT` /
`LIVE TYPED RESULT`) and the suites anchor extraction to the sentinel — the
streamed-raw-JSON observation channel the pre-0010 mechanism provided is
dead, exactly as the H8a note predicted.

### Residuals

The residual record below is normative for the fix. Knowingly-kept
divergences survive the option-1 restoration, recorded here so they are
visible rather than silent:

- **Degraded unlowerable-annotation arm keeps the entire pre-0010 fused
  mechanism.** `lowerQueryResponseSchema` returns `undefined` only for an
  empty or whitespace-only annotation (`@<>` / `@<  >`) — an author-error
  form the parser accepts with no diagnostic; every non-empty annotation
  lowers (unresolved names lower permissively since bug 0004). On that arm
  both drivers deliberately keep the fused single-turn mechanism so typed
  behaviour stays total: the live path drives one user-visible JSON-in-text
  turn (`maxRounds: 0` collapse, ungoverned native loop), the off-session path
  one fused `complete()`; no respond tool is registered or forced, the
  provider gate does not apply, and — because no lowered schema exists — no
  schema-validation collaborator is built, so the text-parsed payload binds
  **unvalidated** (the CIO-3 depth walk still runs in the loop; AJV does not).
  Pinned by the degraded-arm regression cells in
  `tests/typed-two-phase-live.test.ts` and
  `tests/off-session-two-phase.test.ts`; WHY comments sit at the two
  `forcedRespondTurn` degraded arms and the `maxRounds` collapse in
  `src/extension/production-theta-producer.ts`. A load-time diagnostic for the
  empty-annotation form would need a new registered code and is deliberately
  not taken here (scope).
- **The load-time `theta/load/typed-query-unsupported-provider` warning is
  emitted but unobservable in production.** The gate wiring
  (`checkThetaTypedQueryProviderSupport`,
  `src/extension/production-composition.ts`) emits the warning into the shared
  load `emitDiagnostic` stream, but BOTH production load-emit sinks
  (`makeLoadEmit` and `composeExtensionInstance`'s `emitLoadNote`) early-return
  on `severity !== "error"`, so the warning — like every load-phase warning
  today — is dropped. This is a pre-existing routing gap for ALL load
  warnings, not specific to this gate; rewiring the load-warning channel is
  out of this fix's scope. The wiring itself is seam-tested
  (`tests/typed-query-provider-gate.test.ts`) and the warning becomes
  user-visible the moment the shared sink routes warnings.

Fix round 2 note — overflow-signature alias keys (reviewer note n1). The
`OVERFLOW_SIGNATURES` / `overflowStatusGateSatisfied` tables in
`src/binder/provider-error-mapping.ts` gained the two KnownApi alias keys
(`mistral-conversations` sharing `mistral`'s row, `bedrock-converse-stream`
sharing `amazon-bedrock`'s), so a body-overflow observed under the pin's
KnownApi spelling classifies as `ContextOverflowError` rather than generic
transport. Evidence the rows are api-identical at the theta-1.0 pi-ai pin: the
documented providers are thin wrappers over the SAME adapter modules
(`dist/providers/mistral.js` registers `mistralConversationsApi()`;
`dist/providers/amazon-bedrock.js` registers `bedrockConverseStreamApi()`), so
the classifier-input `errorMessage` is produced by one formatter per pair
(`formatMistralError` in `dist/api/mistral-conversations.js`,
`formatBedrockError` in `dist/api/bedrock-converse-stream.js`) regardless of
which api spelling the resolved model handle carries. The spec's
`provider-error-mapping.md` §Overflow signatures list stays keyed on the four
documented provider names; the alias keys are the implementation-side
projection of the six-member supported set pinned at conversation-drive.md
§Provider compatibility for typed queries.

One pre-existing neighbour is out of scope and recorded for a future report:
UNTYPED off-session queries retain the transport-not-cancelled mid-abort
classification that this fix corrected for typed loops.

## Summary

The spec's typed query is a two-phase tool-loop conversation: a free phase
driven through `pi.sendUserMessage` (bounded by `tool_loop.max_rounds`, CIO-4),
then one forced respond turn dispatched off-session through pi-ai's
`complete()` — the binder's channel — with the synthesised one-shot respond
tool as the single `context.tools` entry and the provider's tool choice forced
to it; the tool's `execute` AJV-validates the payload. The forced respond turn
attaches no turn to the driven session and renders no transcript card
(SLSH-2); `pi.sendUserMessage` is used only for the free phase because it
exposes no `options.toolChoice`.

The implementation collapses both phases into one turn and drives that turn
on-session. `#resolvePromptQuery` hard-codes `maxRounds: typed ? 0`, so
`runTypedQueryLoop` (`src/runtime/query-tool-loop.ts:422`) dispatches
`forcedRespondTurn()` (:499) as the typed query's only turn.
`LivePromptQueryModel.forcedRespondTurn` then issues one **user-visible**
streamed turn whose text is the rendered prompt plus
`"\n\nRespond with ONLY a single minified JSON object matching this JSON
schema, and nothing else — no prose, no markdown, no code fences: <lowered>"`,
waits for idle, and `JSON.parse`s the trailing-turn assistant text
(`parseStructuredPayload`, `src/runtime/typed-query-validation.ts:49` — the
slice from first `{` to last `}`). AJV runs downstream in the loop, not in a
tool `execute`. `rg toolChoice src/` returns hits only in `src/binder/`
(`binder-inference.ts:159` — inside `buildBinderCompleteCall`, a call-triple
constructor invoked only by tests; the production binder call passes no
`toolChoice` either, see Non-goals). Respond-repair follow-ups
drive further user-visible turns, each rendered from the QRY-12 template that
instructs the model to call `__theta_respond_<slug>` — a tool that does not
exist in the session.

Every facet of the specified mechanism is affected: dispatch channel, session
visibility, tool contract, tool-choice forcing, two-phase structure, CIO-4
bounding of the typed free phase, the QRY-15 instruction wording, and the
provider-compatibility gate (unwired). Failure *classification* is the one
facet that no longer diverges materially: bugs 0007/0009 aligned the
stop-reason classification and the `provider` field derivation on both seams.

## Reproduction

Code-reading plus token-free mechanical checks; a live repro is optional (it
costs provider tokens and shows the same thing the pins show).

Mechanical check 1 — no forced tool choice exists outside the binder:

```
$ rg -c "toolChoice" src/
src/binder/provider-error-mapping.ts:1
src/binder/binder-inference.ts:3
```

Mechanical check 2 — the committed suite pins the divergent mechanism as
correct. `tests/prompt-provider-field-derivation.test.ts` cell (i-b) drives a
schema-typed theta against a session double and asserts
`session.sendUserMessageCalls === 1` with the message *"exactly one
user-visible turn resolves the typed query — the forced-respond terminator"*
(:440–442); it passes at 0.19.0. Under the specified mechanism the forced
respond turn issues **zero** `sendUserMessage` calls.

Live observation (optional): invoke any typed theta (e.g.
`tests/acceptance/fixtures/acc-typed-inline.theta`) in an interactive prompt
session — the transcript shows the driven user turn carrying the inlined
lowered schema and the assistant's raw minified JSON as the streamed reply.
The token-gated acceptance tests depend on exactly this:
`tests/acceptance/noninteractive-acceptance.test.ts:155` obtains the typed
value via `parseEmittedJson(result.stdout)` — the JSON is only on stdout
because the turn streams it into the driven session.

## Expected behaviour (what the spec says)

- `docs/spec_topics/pi-integration-contract/conversation-drive.md`, typed-query
  bullet: "The runtime MUST surface the validated payload exactly once and MUST
  NOT add user-visible turns to the conversation beyond the natural free-phase
  turns; the forced respond turn is dispatched off-session through pi-ai's
  `complete()` free function (see below), so it attaches no turn to the driven
  session and is not rendered in the transcript". And: "The forced respond turn
  is the only typed-query provider call routed through pi-ai's `complete()`
  free function, following the same `#binder-inference-call` pattern …;
  `complete()` is the channel that carries the forced tool choice via its
  `options.toolChoice` option …, which the session driver `pi.sendUserMessage`
  does not expose. The free phase continues to drive through
  `pi.sendUserMessage`."
- Same page, PIC-50: "the forced respond turn does **not** use
  `pi.sendUserMessage` — it runs off-session through pi-ai's `complete()` free
  function …, and its provider failures are classified through the Provider
  error mapping table exactly as the binder's `complete()` call is."
- `docs/spec_topics/slash-invocation.md` SLSH-2: "The forced respond turn that
  obtains the schema-conformant response via the synthesised one-shot tool is
  dispatched off-session through pi-ai's `complete()` free function …; it
  attaches no turn to the user session and therefore does not render a
  transcript card."
- `docs/spec_topics/query/query-tool-loop.md` QRY-14 step 2: the runtime
  "forces the provider's tool choice to the respond tool for that turn. The
  respond tool's `execute` AJV-validates the call payload against the lowered
  response schema and resolves the query's promise with the validated value";
  QRY-15 pins the instruction wording ("Return your final answer using the
  `` `__theta_respond_<slug>` `` tool, conforming to this schema:" + single
  U+000A + `<schema-json>`); QRY-16/CIO-4 bound the free phase by
  `tool_loop.max_rounds`.
- `docs/spec_topics/implementation-notes.md` §Runtime: the runtime dispatches
  the forced respond turn "passing the synthesised respond tool as the single
  `context.tools` entry and a follow-up user message that inlines the lowered
  response schema as the trailing `context.messages` entry, and forcing tool
  choice to the respond tool *for that turn only*".
- `docs/spec_topics/pi-integration-contract/subagent.md`: "The typed-query
  forced-respond turn runs off-session in the **child** through pi-ai's
  `complete()` free function" — the mechanism follows the interpreter into the
  child.
- Provider compatibility (conversation-drive.md): a typed query on a provider
  outside the named-tool-forcing set warns at load
  (`theta/load/typed-query-unsupported-provider`) and returns
  `Err(TransportError)` at runtime.

The pages are mutually consistent; there is no spec-vs-spec conflict to
resolve. QRY-14's "issues a follow-up user message" is the `complete()`
`context.messages` entry, not a session turn (conversation-drive.md and
SLSH-2 state the off-session dispatch explicitly).

## Actual behaviour / root cause

`LivePromptQueryModel.forcedRespondTurn`
(`src/extension/production-theta-producer.ts:3226`), doc comment verbatim: "A
schema-typed query's forced-respond terminator drives one user-visible turn
that streams the structured JSON as its assistant text, then parses that text
as the candidate structured payload." The body drives
`#driveUserVisibleTurn(false)` → `this.#pi.sendUserMessage(this.#queryText)`
(:3301), probes the trailing session message for transport failure
(PIC-50/51), then `parseStructuredPayload(extractTrailingTurnText(...))`
(:3250–3253). Facet by facet:

| Facet | Spec | Implementation (live prompt path) |
|---|---|---|
| Dispatch channel | off-session pi-ai `complete()` | `pi.sendUserMessage` on the user session (:3301) |
| Session surface | no turn attached, no transcript card | user-visible turn; schema, instruction, and raw JSON stream into the transcript |
| Tool contract | synthesised `__theta_respond_<slug>` as single `context.tools` entry; `execute` AJV-validates | no respond tool registered or passed; AJV runs downstream on parsed text |
| Tool-choice forcing | `options.toolChoice = { type: "tool", name }` | none (`toolChoice` exists only in `src/binder/`) |
| Two-phase structure | free phase bounded by `max_rounds`, then respond turn | fused: `maxRounds: typed ? 0` (:2173) — the respond turn is the only turn; pi's native loop tools inside it |
| CIO-4 bound on typed free phase | free-phase rounds counted and capped | `governor: typed ? undefined` (:2154) — comment: "NOT bounded by `tool_loop.max_rounds` — driven UNBOUNDED" (:3235–3236) |
| Instruction wording | QRY-15 template naming the respond tool, single U+000A separator | "Respond with ONLY a single minified JSON object …" with `\n\n` (:3608–3611) |
| Respond-repair follow-ups | restart the two-phase loop; respond turn off-session | each follow-up is another user-visible streamed turn (:2114–2124 → :3787); the QRY-12 template names `__theta_respond_<slug>`, which is not registered |
| Provider gate | load warning + runtime `Err` outside the supported set | `checkTypedQueryProviderSupport` / `synthesizeUnsupportedProviderTransportError` have no production callers; typed queries dispatch on any provider |
| Failure classification | Provider error mapping table over the `complete()` reply | PIC-50/51 trailing-message probe — **aligned in output** since bugs 0007/0009 |

The off-session sibling (`OffSessionQueryModel.forcedRespondTurn`, :3407 —
`subagent fn` body queries) diverges on the tool facets too:
`offSessionComplete` (:3676) calls `complete(model, { messages: [{ role:
"user", content: prompt, timestamp: 0 }] })` (:3685) — off-session, but no
tools, no `toolChoice`, same JSON-in-text parse. On that path the typed
query's free phase does not exist at all (no tools can be called), so
QRY-14's "available to the model during query-time tool loops" guarantee is
dead for `subagent fn` typed queries.

History — the divergence was born, not drifted:

- **2026-06-05** (`7f759475`): spec-review **blocker** T34 ("Typed-query
  forced-respond tool choice has no specified delivery channel" — "No
  specified channel carries the forced tool choice into the provider call for
  typed queries") is resolved by pinning exactly the mechanism quoted above:
  respond turn through `complete()` + `options.toolChoice`; free phase through
  `sendUserMessage`, which exposes no tool-choice option.
- **2026-07-02** (`3a8732da`, H8a live composition): the first live typed
  drive ships the fused `sendUserMessage` JSON-in-text mechanism to satisfy an
  acceptance test that `JSON.parse`d streamed assistant tokens. The same
  commit's `notes.md` (since removed from the tree) records the conflict
  explicitly: the typed-query acceptance expectation is "unsatisfiable as
  written against the spec", because making it green "would require inventing
  a 'structured payload streams to the transcript as JSON' contract that
  directly contradicts SLSH-2 — a spec change, not a local clarification." The
  spec was never changed and the mechanism was never reconciled.
- Subsequent work built around the divergent mechanism: RFC 0006 (`4866d4d2`)
  carried it into the subagent child, STAGE B added the governor with the
  typed exemption, and bugs 0007 (`87c044ff`) / 0009 (`2f587117`) aligned the
  classification fields on both seams while leaving the drive mechanism as-is.
  The bug-0009 fix's round-2 reviewer recorded the mechanism divergence as
  pre-existing and out of scope; this report is that record.

## Why it matters

- **Transcript noise the spec forbids.** Every typed query renders its inlined
  lowered schema and JSON-only instruction as a user turn and the model's raw
  minified JSON as the assistant reply, in the user's own session. Each
  respond-repair attempt adds another such pair. SLSH-2's contract is that
  none of this is rendered; author-intended values surface via the
  success-side null-policy instead.
- **Session-context growth.** Those turns permanently join the user session's
  history; subsequent turns (and the binder's `bind_context: session`
  transcript) pay for them. Under the specified mechanism the respond traffic
  never touches the session.
- **No provider-enforced structure.** Structured output rests on prose
  compliance, not a forced tool call. A weak model that wraps JSON in prose or
  fences burns `respond_repair.attempts`; the repair template then actively
  misdirects it toward a nonexistent `__theta_respond_<slug>` tool (a model
  that obeys and emits that `tool_use` gets an unavailable-tool error round).
  ERR-17's wrong-tool branch is unreachable as specified.
- **Typed queries are unbounded where CIO-4 bounds them.** The fused turn is
  treated as the exempt terminator, so pi's native tool loop inside a typed
  query runs with no `tool_loop.max_rounds` enforcement (untyped turns are
  governed; typed are not).
- **The documented provider gate does not exist at runtime.** Typed queries
  dispatch on any provider; the documented load warning and unsupported-provider
  `Err(TransportError)` never fire. More permissive than documented, and the
  gate's premise (named-tool forcing) is unimplemented.
- Bounded in degree: for capable models on simple schemas the mechanism works
  — the acceptance suite validates real typed responses — and the fused turn
  costs one provider round-trip where the specified shape costs at least two
  (free phase + respond). Failure classification is aligned since 0007/0009.
  The defect is the mechanism and its session-visible side effects, not a
  wrong value on the happy path.

## Options

1. **Align the implementation to the spec** (recommended; milestone-scale, not
   a patch). Restore the two-phase shape in `#resolvePromptQuery` (drop
   `maxRounds: typed ? 0`; arm the governor for typed free-phase turns), keep
   the free phase on `sendUserMessage`, and dispatch the forced respond turn
   off-session: rebuild the conversation from the session read surface (the
   binder's `buildSessionContext` pattern), append the QRY-15 template as the
   trailing user message, pass the synthesised respond tool as the single
   `context.tools` entry with `toolChoice` forced (the shape
   `buildBinderCompleteCall` builds, `binder-inference.ts:159` — itself
   built-but-unwired: no production caller), AJV-validate its returned
   `ToolCall.arguments` in the tool's `execute` (pi-ai's `complete()` does not
   run `execute`; the caller extracts the forced call from
   `AssistantMessage.content` per binder-inference.md's extraction rule). Give
   `OffSessionQueryModel` the same `complete()` shape, wire the provider gate,
   and route respond-repair follow-ups through the restarted two-phase loop.
   The unit machinery exists (tool-registration respond naming, QRY-12/QRY-15
   renderers, gate emitters, repair loop); the gap is the drive. Blast radius,
   honestly: `renderTypedAwareQueryText` retires; the respond call's model
   selection (theta-resolved `model:` per the provider-compatibility section
   vs the free phase's `ctx.model`) must be decided per spec; simple typed
   queries gain one provider round-trip; user-visible behaviour changes (the
   raw-JSON turn disappears — anything reading it from the transcript breaks);
   test pins move: `tests/prompt-provider-field-derivation.test.ts` (i-b)
   re-pins to the off-session seam, the H9a-T typed acceptance tests stop
   parsing streamed stdout JSON (the reconciliation the H8a note already
   demanded), the governor suite gains typed arming. The scripted-driver
   suites (`query-tool-loop`, `e2e-s3`, `production-typed-query-validation`,
   `typed-query-schema-integration`, `query-respond-repair`) survive — the
   `QueryModelDriver` seam shape is unchanged.
2. **Align the spec to the implementation.** Rewrite the typed-query bullet
   and PIC-50's forced-respond sentence in conversation-drive.md, SLSH-2,
   subagent.md, implementation-notes.md §Runtime, QRY-14/QRY-15, QRY-12's tool
   reference, QRY-9/ERR-17's non-compliance arms, the provider-compatibility
   section (gate premise gone — delete or re-justify), and the
   `complete()`-forced-tool presupposition (binder keeps half). Zero runtime
   change; matches what has shipped since 0.9.0. Rejected as the
   recommendation: it reverses a resolved blocker-level design decision (T34)
   by blessing the exact channel gap that finding fixed — `sendUserMessage`
   exposes no `toolChoice`, so "forced" becomes prose hope; it writes the
   transcript noise, session-context growth, unbounded typed native loop, and
   dead provider gate into the contract; and the repo's rule is that the
   Reference is the authority for intended behaviour (docs/bugs/README.md),
   with the introducing commit's own notes acknowledging the contradiction. A
   hybrid (keep the fused on-session turn, add tool forcing) is structurally
   unavailable — the session driver carries no tool-choice option, which is
   the entire content of T34.

If option 1 is adopted, stage it: the classification seams are already
aligned (0007/0009), so the drive rewiring, the gate wiring, and the
repair-loop restart can land as separate increments behind the unchanged
`QueryModelDriver` seam.

## Non-goals

- The binder's `complete()` call — out of scope here, but **not** a live
  conforming precedent: the production attempt (`#classifyBinderAttempt` →
  `#completeBinderReply`, `production-theta-producer.ts:791/:869`) passes no
  `tools` and no `toolChoice` and text-parses its envelope from the reply,
  diverging from binder-inference.md's forced-tool call shape on the same
  facets (a sibling defect, not this report's subject). The conforming call
  shape exists only as the test-only constructor `buildBinderCompleteCall`
  (`binder-inference.ts:132/:159`); that constructor, plus binder-inference.md's
  `ToolCall`-extraction rule, is the pattern to copy.
- The 0007/0009 classification and `provider`-field derivations — fixed;
  unchanged by either option.
- Untyped-query mechanics (PIC-50/51/51b/53, SLSH-2 streaming, the governor on
  untyped turns) — conforming; contrast only.
- The `maxRounds: typed ? 0` collapse and the unwired provider gate as
  separate reports — they are facets of this mechanism divergence, subsumed
  here.
- ERR-17 issue-literal conformance details and the QRY-15 byte-exactness of a
  future template renderer — follow whichever mechanism direction is chosen.
- Typed-query provider-set widening (JSON-mode fallback) — future
  considerations, out of theta 1.0 scope either way.

## Provenance

- Spec measured against:
  `docs/spec_topics/pi-integration-contract/conversation-drive.md` (typed-query
  bullet, PIC-50 forced-respond sentence, §Provider compatibility,
  §`complete()` forced-tool presupposition),
  `docs/spec_topics/slash-invocation.md` (SLSH-2),
  `docs/spec_topics/query/query-tool-loop.md` (QRY-13…QRY-16, QRY-15
  template), `docs/spec_topics/query/query-failure-and-repair.md` (QRY-9,
  QRY-11/QRY-12), `docs/spec_topics/implementation-notes.md` (§Runtime),
  `docs/spec_topics/pi-integration-contract/subagent.md` (child forced-respond
  sentence).
- Implementation: `src/extension/production-theta-producer.ts`
  (`#resolvePromptQuery` :2088, queryText :2132, model ternary :2145–2161,
  governor :2154, maxRounds :2173, `LivePromptQueryModel` :3109,
  `forcedRespondTurn` :3226–3253, `#driveUserVisibleTurn` :3266,
  `sendUserMessage` :3301, `OffSessionQueryModel` :3374/:3407,
  `renderTypedAwareQueryText` :3597–3612, `offSessionComplete` :3676/:3685,
  `driveStreamedUserTurn` :3787/:3812, userVisible :1269),
  `src/runtime/query-tool-loop.ts` (:422, :499),
  `src/runtime/typed-query-validation.ts` (:49, repair driver :170–205),
  `src/runtime/query-followup-render.ts` (:88),
  `src/runtime/tool-registration.ts` (:306–313),
  `src/binder/binder-inference.ts` (:159 — the only `toolChoice` in `src/`,
  inside the test-only `buildBinderCompleteCall` (:132); the production binder
  call at `production-theta-producer.ts:869` passes no `toolChoice`),
  `src/binder/provider-error-mapping.ts` (:52, :101, :133 — no production
  callers for the gate pair).
- History: `7f759475` (2026-06-05, resolves spec-review blocker T34 — quoted),
  `3a8732da` (2026-07-02, H8a live composition introduces the mechanism; its
  `notes.md` needs-attention entry quoted; file since removed), `4866d4d2`
  (RFC 0006 child inherits the driver), `87c044ff` / `2f587117` (0007/0009
  align classification fields on the divergent mechanism).
- Tests inspected: `tests/prompt-provider-field-derivation.test.ts` (cell
  (i-b) :427–460 pins `sendUserMessageCalls === 1` on the typed path — moves
  under option 1), `tests/acceptance/noninteractive-acceptance.test.ts`
  (:155/:191 `parseEmittedJson(result.stdout)` — pins the streamed-JSON
  behaviour, token-gated), `tests/prompt-tool-loop-governor.test.ts` (untyped
  bound only; no typed pins), scripted-driver suites
  (`tests/query-tool-loop.test.ts`, `tests/e2e-s3-typed-query-conformance.test.ts`,
  `tests/production-typed-query-validation.test.ts`,
  `tests/typed-query-schema-integration.test.ts`,
  `tests/query-respond-repair.test.ts` — mechanism-agnostic behind
  `QueryModelDriver`).
- Recorded verbatim as pre-existing and out of scope by the bug-0009 fix
  review, round 2 (provenance chain: bug 0007 → its fix review → bug 0009 →
  its fix review → this report).
