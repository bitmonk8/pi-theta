# Bug 0009 — Prompt-mode transport errors carry the short provider id (`.provider`) where the spec pins the api-shaped `.api`

- **Status:** open.
- **Kind:** defect — spec/implementation divergence on an author-visible error
  field. Every normative statement of the `TransportError.provider` derivation
  pins an api-shaped `Model<Api>.api` value ("not a short provider-id form
  such as `"openai"`"); the live prompt-mode query seam derives it from
  `ctx.model?.provider` — the short `ProviderId` form. The bug-0007 fix pinned
  the sibling off-session seam to `String(model.api)` (verified live:
  `"provider":"anthropic-messages"`), so the runtime's two in-process query
  seams now emit *different* provider strings for the same failure class.
- **Affected:** the `LivePromptQueryModel` construction in
  `#resolvePromptQuery` (`src/extension/production-theta-producer.ts:2159`,
  `provider: String(deps.ctx.model?.provider ?? "unknown")`), which supplies
  `#provider` to all three prompt-mode `TransportError` synthesis points: the
  PIC-50 sync-throw mapping (`mapPromptModeSyncThrow`, :3303) and the PIC-51
  probes on the untyped free-phase turn (:3187) and the typed forced-respond
  turn (:3246). Latent second site: the parent-side `SubagentDriveDeps.provider`
  feed (`String(model.provider)`, :1674) — declared "stamped onto a
  reconstructed transport `Err`, when needed"
  (`src/runtime/subagent-json-driver.ts:72`) but never read
  (`driveSubagentChild` destructures only
  `{ child, thetaAbort, calleePath, emitDiagnostic }`, :90). The subagent
  child-process envelope path inherits the live-seam value: the child runs the
  same construction line and the parent reconstructs its `err` arm verbatim.
- **Observed at:** `0.18.0`, host Pi `0.82.1` (repo-local SDK pins
  `@earendil-works/pi-ai` / `pi-coding-agent` 0.80.10). Recorded as
  pre-existing and out of scope by the bug-0007 fix review.

## Summary

`TransportError.provider` is a pinned wire-contract field: an api-shaped
`Model<Api>.api` value (`"anthropic-messages"`), keyed to the same `Api` union
the provider-error-mapping table dispatches on. Four seams construct
provider-carrying transport errors. The binder (`#classifyBinderAttempt`) and
the off-session `complete()` wrapper (`classifyOffSessionReply`, the bug-0007
fix) read `String(model.api)` — conforming. The live prompt-mode seam reads
`String(deps.ctx.model?.provider ?? "unknown")`: the right model (PIC-50 pins
the user session's `ctx.model`, not the theta's resolved `model:`) and the
right `"unknown"` sentinel, but the wrong field — `Model.provider` is pi-ai's
short `ProviderId` (`"anthropic"`), a value the spec's derivation sentence
explicitly excludes and the `Api` union does not contain.

For a typical registry entry the two fields differ
(`anthropic/claude-opus-4-8` → `provider: "anthropic"`,
`api: "anthropic-messages"`; `openai/gpt-4` → `"openai"` /
`"openai-responses"`; `mistral/codestral-latest` → `"mistral"` /
`"mistral-conversations"`), so prompt-mode transport `Err`s ship the
non-conforming form for every such model today. The exceptions are the two
registry providers whose short id doubles as an `Api` value
(`azure-openai-responses`, `google-vertex` at the 0.80.10 pin), where the
wrong read is value-masked rather than derived correctly. The same provider
failure classified by the off-session seam two lines below in the same
ternary (`#resolvePromptQuery`, :2145–2161) ships `"anthropic-messages"`.

## Reproduction

Code-reading plus a token-free mechanical check; a live repro is not required
for a field-value divergence. The divergence is observed wherever theta code
matches on the field — `match r { Err(QueryError { kind: "transport",
provider, .. }) => … }` — and in the subagent envelope's `err` arm JSON. It is
**not** observable in the rendered `Err` note (the transport arm renders only
`message` — `src/runtime/err-note-render.ts:126`) or on the runtime event
channel (the `RuntimeEvent` payload carries no provider member —
`src/runtime/runtime-event-channel.ts:33–56`).

Mechanical check (registry values against the two construction expressions):

```
$ node -e "
const m = require('./node_modules/@earendil-works/pi-ai/dist/models.generated.js');
const model = m.MODELS.anthropic['claude-opus-4-8'];
console.log('live seam  :', String(model.provider ?? 'unknown'));
console.log('off-session:', String(model.api));"
live seam  : anthropic
off-session: anthropic-messages
```

The same divergence end-to-end: drive a prompt-mode theta whose `@`-query turn
fails (the bug-0007 shapes — no auth, upstream 5xx surfaced as a trailing
`stopReason: "error"`) and a `subagent fn` body query over the same dead
provider. The prompt-mode `Err` carries `provider: "anthropic"`; the
off-session `Err` carries `provider: "anthropic-messages"` (the latter proven
live during the bug-0007 fix verification).

## Expected behaviour (what the spec says)

- `docs/spec_topics/errors-and-results/queryerror-variants.md`, the
  `TransportError` schema: `provider: string, // resolved Model<Api>.api value
  (api-shaped, e.g. "anthropic-messages"); see provider derivation below`.
- Same page, the provider-derivation paragraph: "the `provider` field is an
  `api`-shaped `Model<Api>.api` value — the same `api`-shaped field the
  Provider error mapping table is keyed on (e.g. `anthropic-messages`,
  `openai-completions`), **not a short provider-id form such as `"openai"`**.
  Its value space is the externally-owned `Api` union declared in
  `@earendil-works/pi-ai`"; and for this path specifically: "prompt-mode
  driven-turn failures take the user session's selected-model **`.api`**
  (`ctx.model`), substituting the fixed sentinel `"unknown"` when `ctx.model`
  is `undefined`".
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` PIC-50:
  "The `provider` field is the `Api`-shaped `Model<Api>.api` value of the user
  session's currently-selected model — read from `ctx.model`, the model the
  driven user turn actually routes through, **not** the theta's resolved
  `model:` … When `ctx.model` is `undefined` (no user-session model selected)
  `provider` MUST be the fixed sentinel string `"unknown"`". PIC-51 pins the
  `Err` shape `{ kind: "transport", message: <errorMessage>, http_status:
  null, provider: <provider>, retryable: false }` with "the `provider` field
  is derived per PIC-50's user-session-model derivation"; PIC-51b's
  non-`"error"` terminator arm repeats "`provider: <provider per PIC-50>`".
  The spec names `.api` on every statement of the derivation — there is no
  spec-vs-spec ambiguity; the source *model* differs per seam, the *field* is
  uniformly `.api`.
- The implementation's own seam contracts agree:
  `src/runtime/prompt-transport-mapping.ts:31–33` — "The synthesised
  `provider` field is NOT derived here — it is supplied by the caller from
  V9j's provider-error-mapping surface (the resolved `Model<Api>.api` value)"
  — and the runtime's `TransportError` type doc
  (`src/runtime/query-error.ts:70`): "Resolved `Model<Api>.api` value
  (api-shaped, e.g. \"anthropic-messages\")."

## Actual behaviour / root cause

The construction site (`src/extension/production-theta-producer.ts:2157–2159`):

```ts
          // PIC-50/51: the resolved provider for the synthesised `TransportError`
          // (mirrors the subagent path's `provider: String(model.provider)`).
          provider: String(deps.ctx.model?.provider ?? "unknown"),
```

`Model.provider` is pi-ai's `ProviderId` (`node_modules/@earendil-works/pi-ai/
dist/types.d.ts:602–621` declares `api: TApi` and `provider: ProviderId` as
distinct members); the spec's field is `.api`. The value flows into
`LivePromptQueryModel.#provider` (:3153) and out through every prompt-mode
`TransportError`: `extractPromptModeQueryResult`'s PIC-51 probe
(`src/runtime/prompt-transport-mapping.ts:106`, `provider:
probeCtx.provider`) on both the untyped (:3187) and forced-respond (:3246)
turns, and `mapPromptModeSyncThrow` (:167) on the PIC-50 sync-throw arm
(:3303). The comment's cited precedent is itself wrong twice over: the
subagent argv `--provider` flag (:1622) is a *model reference* where the short
form is correct (the host CLI's provider selector — subagent.md §Model
marshalling), and the `driveSubagentChild` dep (:1674) is a dead input, not a
`QueryError` field derivation.

Seam × field, as verified on 0.18.0 (only `TransportError` carries `provider`
— `ContextOverflowError` has no provider field, so `kind: "transport"` is the
whole affected surface):

| Seam constructing `TransportError.provider` | Model source | Field read | Spec says | Agrees? |
|---|---|---|---|---|
| binder `#classifyBinderAttempt` (:796) → `classifyProviderResponse` (`provider-error-mapping.ts:331`, `provider: input.api`) | theta-resolved model | `String(model.api)` | resolved model's `.api` | yes |
| off-session `classifyOffSessionReply` (:3708, bug-0007 fix) | the model `complete()` dispatched | `String(model.api)` | resolved model's `.api` | yes (verified live) |
| unsupported-provider synthesis (`provider-error-mapping.ts:131–140`) | api-shaped parameter | caller-supplied `Api` value | resolved model's `.api` | yes (by construction) |
| **live prompt-mode `LivePromptQueryModel` (:2159 → :3187 / :3246 / :3303)** | user-session `ctx.model` (correct per PIC-50) | **`.provider`** | `ctx.model`'s `.api`, sentinel `"unknown"` | **no** |
| parent-side `SubagentDriveDeps.provider` (:1674; `subagent-json-driver.ts:72`) | theta-resolved model | **`.provider`** | resolved model's `.api` | no — latent (never consumed) |
| subagent child envelope (PIC-59) | child session model (the `--provider`/`--model` re-resolved theta model) | inherits the child's :2159 | resolved model's `.api` | no — inherited |

The child-envelope row follows from the spec's own audit
(provider-error-mapping.md §Subagent-path `QueryError` audit): "`kind:
"transport"` … in the child — the child's prompt-mode driver reads the
trailing `assistant` `stopReason: "error"` and applies this page's mapping";
the parent "performs no per-query classification". The child's `ctx.model`
*is* the theta-resolved model there, so the model source conforms and only the
field read diverges — the same single line, manifest in both modes.

No test pins the wrong derivation. `tests/prompt-transport-mapping.test.ts`
exercises the module seam with the api-shaped value supplied as *input*
(`provider: "anthropic-messages"`, asserted through at :122) — correct for a
module whose contract makes the caller responsible — and no test asserts the
provider value the :2159 construction supplies; the token-gated live probes
(`tests/hardening/session-prompt-transport.test.ts`,
`tests/hardening/session-promptloop.test.ts`) drive the live seam but pin
only the success path (no transport `Err` escapes; the field is never read). Contrast the bug-0007 fixture, which guards its seam
against exactly this mistake
(`tests/off-session-transport-classification.test.ts:119–121`: "DISTINCT
`.api` and `.provider` strings so the TransportError.provider assertion …
catches a wrong `.provider` read").

## Why it matters

- **One field, two vocabularies.** The same provider failure carries
  `provider: "anthropic"` or `provider: "anthropic-messages"` depending on
  which seam classified it — untyped prompt-mode query vs `subagent fn` body
  query vs binder failure, within one theta. A provider-keyed `match` arm or
  log correlation written against either form silently misses the other.
- **The emitted value is outside the pinned value space.** The spec fixes the
  field's value space to pi-ai's `Api` union and names the short provider-id
  form as the excluded shape; `"anthropic"` is a `ProviderId`, not an `Api`
  member.
- **The divergence became real at 0.18.0.** Before the bug-0007 fix the
  off-session path emitted no transport `Err` at all (it swallowed failures as
  `Ok("")`); now both seams emit, and they disagree.
- Bounded in degree: `kind`, `message`, `http_status`, and `retryable` are
  unaffected, and neither the rendered `Err` note nor the runtime event channel
  exposes the field. It is nonetheless a normatively pinned, author-visible
  contract field.

## Options

1. **Read `.api` at the construction site** (recommended):
   `provider: String(deps.ctx.model?.api ?? "unknown")` at
   `production-theta-producer.ts:2159`, correcting the adjacent comment to
   cite PIC-50's user-session-model derivation instead of the mislabelled
   "subagent path" precedent. Same one-line fix covers prompt mode and the
   subagent child (the child runs the identical line). Fix the latent
   `driveSubagentChild` feed (:1674) to `String(model.api)` — or delete the
   dead `SubagentDriveDeps.provider` member outright, since nothing consumes
   it. The field-read fix moves no committed test; deleting the dead member
   also touches the two drive-deps test harnesses that populate it
   (`tests/subagent-json-driver.test.ts:58`,
   `tests/subagent-json-wire.test.ts:44`). Add the missing construction-site
   pin using the bug-0007 fixture's distinct-`.api`/`.provider` model-double
   pattern so a wrong-field read cannot recur unpinned.
2. **Bless `.provider` in the spec instead.** Rejected: the derivation
   sentence is not arbitrary — the field is defined as "the same `api`-shaped
   field the Provider error mapping table is keyed on", and the classifier and
   overflow-signature tables are keyed on `Api` values
   (`provider-error-mapping.ts:229`, `OVERFLOW_SIGNATURES[input.api]`).
   Re-blessing the short form would flip two conforming seams (binder,
   off-session — the latter shipped and live-verified at 0.18.0), the
   runtime's own type documentation, and the module contract of
   `prompt-transport-mapping.ts`, to preserve one unpinned line.

## Non-goals

- The subagent argv `--provider <p>` model-reference channel (:1622) —
  `.provider` is the correct shape there (host CLI provider selector;
  subagent.md §Model marshalling).
- The `message` / `http_status` / `retryable` derivations and the PIC-51
  probe ordering — conforming and untouched.
- The binder and off-session classification seams — conforming; contrast only.
- The rendered `Err` note and runtime-event-channel payloads — neither carries
  the field; no change proposed.

## Provenance

- Spec measured against:
  `docs/spec_topics/errors-and-results/queryerror-variants.md`
  (§TransportError schema, §provider derivation),
  `docs/spec_topics/pi-integration-contract/conversation-drive.md` (PIC-50
  provider derivation, PIC-51, PIC-51b),
  `docs/spec_topics/pi-integration-contract/provider-error-mapping.md`
  (classifier table keying, §Subagent-path `QueryError` audit),
  `docs/spec_topics/pi-integration-contract/subagent.md` (§Model marshalling,
  for the `--provider` non-goal).
- Implementation: `src/extension/production-theta-producer.ts`
  (`#resolvePromptQuery` :2089, construction :2146/:2157–2159, off-session arm
  :2161, `LivePromptQueryModel` :3109/:3121/:3153, probe feeds :3187/:3246,
  sync-throw feed :3303; contrast `#classifyBinderAttempt` :796,
  `classifyOffSessionReply` :3708; subagent feeds :1622/:1674),
  `src/runtime/prompt-transport-mapping.ts` (module contract :31–33,
  synthesis :106/:167), `src/runtime/query-error.ts` (:70–71),
  `src/runtime/subagent-json-driver.ts` (dead `provider` dep :72–73,
  destructure :90), `src/binder/provider-error-mapping.ts` (:331, :131–140,
  :229), `src/runtime/err-note-render.ts` (:126),
  `src/runtime/runtime-event-channel.ts` (:33–56).
- pi-ai surface: `Model<Api>` member declarations (`dist/types.d.ts:602–621`),
  `Api` / `ProviderId` unions (:14–19), registry values read from
  `dist/models.generated.js` (`anthropic/claude-opus-4-8` →
  `provider: "anthropic"`, `api: "anthropic-messages"`).
- Tests inspected: `tests/prompt-transport-mapping.test.ts` (api-shaped value
  as module input; no construction-site coverage),
  `tests/off-session-transport-classification.test.ts` (the distinct-field
  guard, :119–121), `tests/queryerror-variants.test.ts` /
  `tests/e2e-s3-tool-error-envelope.test.ts` (no provider-derivation pins),
  `tests/hardening/session-prompt-transport.test.ts` /
  `tests/hardening/session-promptloop.test.ts` (token-gated live success-path
  probes; drive the live seam, never assert the provider field).
- Recorded as a pre-existing defect by the bug-0007 fix review (the 0007
  provenance chain: pi-config theta-migration spikes → bug 0005 → the 0005
  fix verification → bug 0007 → its fix review → this report); the 0007 fix
  live-verified `"provider":"anthropic-messages"` on the off-session seam,
  making the two-seam disagreement observable from 0.18.0.
