# Bug 0007 — Off-session queries swallow a `stopReason: "error"` completion as `Ok("")`

- **Status:** fixed (0.18.0). Option 1 adopted — `offSessionComplete`
  classifies the resolved reply's `stopReason` through the existing
  `classifyProviderResponse` table before text extraction; failures ride the
  query loop's transport arms and terminate respond-repair with no `attempts`
  debit.
- **Kind:** defect — the off-session `complete()` query driver omits the
  documented provider-failure classification, so a failed provider call
  resolves as a *successful* empty-string query result. The spec requires the
  failure to surface as `Err(TransportError)` (or `ContextOverflowError` for
  overflow shapes); the runtime fabricates `Ok("")` with no `Err` and no
  diagnostic.
- **Affected:** `src/extension/production-theta-producer.ts`
  `offSessionComplete` (no `stopReason` probe on the resolved reply) and both
  of its consumers: `OffSessionQueryModel` — the driver for every `@`-query in
  a `subagent fn` body (both in-process hosts pass `userVisible: false`) —
  and the off-session `driveFollowUp` respond-repair follow-up drive
  (`#resolvePromptQuery`). The typed off-session path
  (`OffSessionQueryModel.forcedRespondTurn`) does not fabricate `Ok` but
  launders the transport failure into the schema-validation channel (see
  root cause). Unchanged since introduction (commit `ecd83aed`, V13e, first
  released 0.1.3).
- **Observed at:** `0.16.0`, host Pi `0.82.1` (live, during the bug-0005 fix
  verification); mechanical re-verification against the in-repo SDK pin
  (`@earendil-works/pi-ai` 0.80.10).

## Fix (0.18.0)

Option 1, adopted at the seam the root cause names: `offSessionComplete`
(`src/extension/production-theta-producer.ts`) now resolves to a **classified**
discriminated value — `{ kind: "text" }` on a normal terminator (`stop` /
`end_turn` / `toolUse` / `tool_use`; pi-ai and spec spellings both covered,
and a non-string/absent `stopReason` treated as normal since pi-ai always sets
the field) or `{ kind: "failure", error }` for every other string `stopReason`
— probed before any text extraction, for both of its consumers
(`OffSessionQueryModel` and the off-session `driveFollowUp` respond-repair
arm). The H8a undefined-model throw is untouched. Classification routes
through the existing `classifyProviderResponse` table with
`#classifyBinderAttempt`'s mirrored input (`httpStatus: 200`, the reply's
`stopReason` / `errorMessage`, partial text as `rawResponse`): an
overflow-signature or `length` classification surfaces the classifier's
`ContextOverflowError` verbatim; everything else folds to the pinned transport
surface `{ kind: "transport", message: <classifier message, or "provider
transport failure">, http_status: null, provider: String(model.api),
retryable: false }`.

`OffSessionQueryModel.nextFreePhaseTurn` / `forcedRespondTurn` surface a
failure on the loop's existing transport arms (the CANCEL-3 provider-Promise
guard wraps the classified wrapper unchanged); the arms' payload widened
minimally to `TransportError | ContextOverflowError`
(`src/runtime/query-tool-loop.ts`, plus the matching outcome arms), no
control-flow change. A typed query's provider failure therefore never reaches
`parseStructuredPayload` — the forced-respond turn terminates immediately as
`Err(transport)` / `Err(context_overflow)` instead of laundering into the
schema-validation channel. A respond-repair follow-up's provider failure
returns the new exported `FollowUpDriveFailure`
(`src/runtime/typed-query-validation.ts`), which `nextFollowUp` maps to
`runRespondRepairLoop`'s existing `non_validation` arm — repair terminates
with the proximate `QueryError` and no `attempts` debit
(query-failure-and-repair.md §Non-validation failures). The live prompt-mode
arm (`driveStreamedUserTurn`), the binder classification, and the
child-process envelope path are untouched. Fixture:
`tests/off-session-transport-classification.test.ts` (eight classification
cells plus two green controls over a mocked `@earendil-works/pi-ai/compat`
`complete()`).

## Summary

pi-ai's `complete()` free function never rejects on a provider failure: the
per-API adapter catches every throw (missing auth, network error, 4xx/5xx,
mid-stream truncation) and terminates the stream with an `error` event whose
payload is the final `AssistantMessage` carrying `stopReason: "error"` and
`errorMessage`; the event stream's final-result promise has only a resolve
path. Every sibling `complete()`/turn consumer in the runtime probes for this
— the binder, the prompt-mode live turn (PIC-51), and the child-process
subagent drive (the child runs the same classification in-process, per the
subagent-path `QueryError` audit) — and maps it to a transport-class failure.

`offSessionComplete` does not. It returns `assistantText(reply)` — the
concatenation of the reply's `text` content parts — regardless of
`stopReason`. An error-stopped reply has empty (or partial) content, so an
untyped `@`-query in a `subagent fn` body resolves `Ok("")` (or `Ok(<partial
text>)` after a mid-stream failure), the body's `?` unwraps it, and the
program proceeds on fabricated empty data. The provider's error text is
discarded; nothing is logged, no `Err` is produced.

## Reproduction

**Live (bug-0005 fix verification).** A registered theta calling a
`subagent fn` whose body issues an `@`-query was run in an environment
without off-session auth (`ANTHROPIC_OAUTH_TOKEN` / `ANTHROPIC_API_KEY`
absent — the off-session `complete()` call authenticates independently of
the host session). The query resolved to `""`, the fn returned it as its
final value, and the enclosing theta continued on the empty string. No `Err`,
no note, no diagnostic; the only symptom was downstream output built from
empty data.

**Mechanical (verified against 0.16.0).** A scratch vitest mocking ONLY
`@earendil-works/pi-ai/compat`'s `complete` (the `e2e-s5-binder-echo-emission`
pattern) to resolve an error-stopped reply, driving the production producer
(`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`)
over:

```theta
---
mode: prompt
---
subagent fn helper(a: string) {
  let v = @`Echo ${a}`?
  v
}
let out = helper("x")
out
```

with the scripted reply

```ts
{ role: "assistant", content: [], api: "anthropic-messages", …,
  stopReason: "error",
  errorMessage: "No auth available for anthropic. Set ANTHROPIC_OAUTH_TOKEN or ANTHROPIC_API_KEY." }
```

produces `outcome: "success"`, final value `""`, with `complete()` called
exactly once. The control cell (same drive, `stopReason: "stop"`, one text
part) resolves the text through the same path, confirming the exercised
driver is the off-session one.

## Expected behaviour (what the spec says)

- `docs/spec_topics/query/query-forms.md` QRY-1: an untyped query returns
  `Result<string, QueryError>`; the `Ok` value is the assistant's text
  response. A failed provider call is not a text response.
- `docs/spec_topics/query/query-failure-and-repair.md` QRY-10: "Every other
  provider failure — a non-overflow 4xx/5xx response, an HTTP-200 response
  carrying a non-overflow body-envelope error, and every network-level
  failure … maps to `TransportError`"; the three-arm classification is owned
  by the provider-error-mapping page.
- `docs/spec_topics/pi-integration-contract/provider-error-mapping.md`
  §Provider error mapping names this exact shape: "an HTTP-200 response
  resolving with `AssistantMessage.stopReason: "error"` whose `errorMessage`
  does not match the overflow signature" maps to `TransportError`;
  §Stop-reason classification maps `"length"` to `ContextOverflowError` and
  every other non-normal terminator to `TransportError` with
  `retryable: false`.
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` (PIC-50
  bullet) pins the obligation onto this call path directly: the forced
  respond turn "runs off-session through pi-ai's `complete()` free function
  … and its provider failures are classified through the Provider error
  mapping table exactly as the binder's `complete()` call is." PIC-51 — the
  prompt-mode analogue — fixes the required shape:
  `Err(QueryError { kind: "transport", message: <errorMessage>, http_status:
  null, provider: <provider>, retryable: false })`, with the fixed fallback
  `"provider transport failure"` when `errorMessage` is absent, and "MUST NOT
  extract the driven turn as a successful `Ok(string)`".
- `docs/spec_topics/query/query-failure-and-repair.md` §respond-repair: a
  follow-up's non-validation failure "propagates as the corresponding
  `QueryError` variant (`transport`, …) and terminates respond-repair
  immediately" and "does not consume an `attempts` slot".
- `docs/spec_topics/functions.md` FN-6 / `docs/spec_topics/invocation.md`
  INV-5: on failure no final value flows — the caller observes the `Err`
  envelope, never a fabricated success.

## Actual behaviour / root cause

`offSessionComplete` (`src/extension/production-theta-producer.ts:3620`):

```ts
const reply: AssistantMessage = await complete(model, {
  messages: [{ role: "user", content: prompt, timestamp: 0 }],
});
return assistantText(reply);
```

`assistantText` keeps only `type === "text"` content parts and joins them —
`""` for an error-stopped reply with empty content. Neither function reads
`reply.stopReason` or `reply.errorMessage`.

`complete()` cannot signal the failure any other way: pi-ai's
`EventStream.finalResultPromise` is constructed with a resolver only (no
reject path — `dist/utils/event-stream.js`), and the terminal `error` event
*resolves* it with the error-carrying `AssistantMessage`; the per-API adapter
converts every caught throw into that event (`dist/api/anthropic-messages.js`:
`output.stopReason = … "error"; output.errorMessage = …; stream.push({ type:
"error", … })`). So the resolved-error-stop shape is the *only* failure
surface of the off-session call, and it is exactly the surface the driver
ignores.

The swallowed value then flows out as success. Untyped:
`OffSessionQueryModel.nextFreePhaseTurn(0)` returns
`{ kind: "text", text: await this.#complete() }` unconditionally (line 3380),
which `runUntypedQueryLoop` treats as the terminating turn → `Ok("")`. The
loop *has* a transport arm — `FreePhaseTurn { kind: "transport" }`, commented
"never masked as a terminating `Ok(text)`" (`src/runtime/query-tool-loop.ts`)
— which the live driver feeds (`LivePromptQueryModel`, PIC-51 probe via
`extractPromptModeQueryResult`); the binder applies the same probe on its own
channel (`#classifyBinderAttempt`: `stopReason` `"error"` / `"length"` /
`"content_filter"` → `classifyProviderResponse`). The off-session driver
never constructs the transport arm. Typed: `forcedRespondTurn` feeds `""` to
`parseStructuredPayload`, which fails to parse, so the transport failure
enters the respond-repair loop as a schema-validation failure — each repair
follow-up is another off-session `complete()` against the same dead provider,
each debits an `attempts` slot the spec says a transport failure must not
consume, and the terminal result is `Err(ValidationError { cause:
"schema_validation", raw_response: "" })` misattributing the failure. The
same swallow applies to `stopReason: "length"` and content-filter
terminators (the stop-reason-classification arm is equally unapplied), and a
mid-stream failure that emitted partial text yields `Ok(<partial>)`.

No test pins the swallowing. The only `complete()` mock in the suite is
`tests/e2e-s5-binder-echo-emission.test.ts` (binder-only);
`tests/production-subagent-query-model.test.ts` covers the child-*process*
envelope path (asserting "never a fabricated `Ok`" *there*);
`tests/subagent-fn.test.ts`'s runtime harness fakes `resolveQuery` and never
reaches `offSessionComplete`; `tests/query-tool-loop.test.ts` pins the loop's
transport arm only against scripted drivers.

## Why it matters

- **Fabricated success.** Kin to bug 0003's silent-`{}` dispatch, but worse
  in degree: 0003's dropped args at least failed at the tool's own input
  validation, while here nothing downstream fails — `""` is a valid string,
  `?` unwraps it, and the theta completes with output built from data that
  was never produced. In a fan-out (`par for` over `subagent fn` workers)
  every worker "succeeds" empty and the aggregate is silently hollow.
- **The error text is destroyed.** The provider said exactly what was wrong
  (`"No auth available for anthropic…"`); the runtime discards it, so the
  author debugs empty output instead of reading a transport error.
- **The protection exists everywhere else.** Binder, live prompt turn, and
  child-process subagent all classify this shape; authors reasonably assume
  the `subagent fn` path — the documented fresh-context building block — has
  the same failure fidelity.
- **Typed queries burn budget on a dead provider.** `respond_repair.attempts`
  × extra `complete()` calls re-driving a failure that should terminate
  repair immediately, then a misclassified `ValidationError`.

## Options

1. **Classify the resolved reply at the off-session seam** (recommended).
   Make `offSessionComplete` (or a wrapper its two consumers share) probe the
   resolved reply before text extraction: a non-normal `stopReason` routes
   through the existing `classifyProviderResponse`
   (`src/binder/provider-error-mapping.ts`) — `"error"` →
   `TransportError { message: errorMessage ?? "provider transport failure",
   http_status: null, provider: String(model.api), retryable: false }`
   (overflow signatures and `"length"` → `ContextOverflowError` per the
   stop-reason arm); surface it through the transport arms that already exist
   and are consumed — `FreePhaseTurn { kind: "transport" }` /
   `ForcedRespondTurn { kind: "transport" }` for `OffSessionQueryModel`, and
   the proximate-failure propagation rule for the off-session respond-repair
   follow-up (terminate repair, no `attempts` debit). `provider` is the
   theta-resolved model's `.api` per the `queryerror-variants.md` provider
   derivation (off-session failures take the resolved model, not `ctx`'s
   user-session model). Fixture: the binder test's
   `vi.mock("@earendil-works/pi-ai/compat")` pattern driving a `subagent fn`
   body query, pinning the `Err(transport)` shape, the error-text carriage,
   the `"length"` → `context_overflow` cell, and the repair-termination rule.
2. Probe only `stopReason: "error"` inside `offSessionComplete` and throw a
   typed error mapped at the consumers. Smaller, but skips the classification
   table (`"length"`, content filter, overflow signatures) and leaves the
   respond-repair attempts-debit violation in place. Not recommended.

## Non-goals

- The live prompt-mode probe (PIC-51/PIC-51b), the binder classification, and
  the child-process envelope path — all correct today and untouched.
- The `OffSessionModelUnavailableError` (H8a) undefined-model arm of
  `offSessionComplete`.

## Provenance

- Spec measured against: `docs/spec_topics/query/query-forms.md` (QRY-1),
  `docs/spec_topics/query/query-failure-and-repair.md` (QRY-10, §respond-repair),
  `docs/spec_topics/pi-integration-contract/provider-error-mapping.md`
  (§Provider error mapping, §Stop-reason classification),
  `docs/spec_topics/pi-integration-contract/conversation-drive.md` (PIC-50
  bullet — off-session `complete()` classification obligation; PIC-51 shape),
  `docs/spec_topics/errors-and-results/queryerror-variants.md`
  (§TransportError, provider derivation), `docs/spec_topics/functions.md`
  (FN-6), `docs/spec_topics/invocation.md` (INV-5).
- Implementation: `src/extension/production-theta-producer.ts`
  (`offSessionComplete` :3620, `assistantText` :3607, `OffSessionQueryModel`
  :3362, `driveFollowUp` :2106, the `userVisible: false` subagent-fn hosts
  :1519/:2032, contrast `#classifyBinderAttempt` :802 and the PIC-51 probes
  :3170/:3228), `src/runtime/query-tool-loop.ts` (the unused-by-this-driver
  transport arm), `src/runtime/prompt-transport-mapping.ts`,
  `src/binder/provider-error-mapping.ts` (`classifyProviderResponse`);
  pi-ai contract read at `@earendil-works/pi-ai` `dist/compat.js`
  (`complete`), `dist/utils/event-stream.js` (resolve-only final result),
  `dist/api/anthropic-messages.js` (catch → `error` event), `dist/types.d.ts`
  (`StopReason`, `errorMessage`).
- Found live during the bug-0005 fix verification (the 0005 provenance chain:
  pi-config theta-migration spikes → bug 0005 → this verification run);
  mechanically re-verified on 0.16.0 with the mocked-`complete()` drive above
  (scratch test, not committed). `git log -S offSessionComplete` dates the
  no-probe shape to `ecd83aed` (V13e, ≤ 0.1.3) — present in every release
  since, including 0.13.0–0.16.0.
