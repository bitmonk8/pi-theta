# Bug 0481 — a model that rejects forced `tool_choice` kills every typed query (and every binder call) routed to it: the 400 is classified as a terminal transport Err after the whole free phase already ran, so the theta's work is done and then discarded

- **Status:** fixed (0.481.0) — one-shot degraded re-dispatch (toolChoice
  omitted) on the rejection signature at both forced-dispatch sites, in BOTH
  failure arms (resolved `stopReason: "error"` reply AND rejected promise —
  the `anthropic-messages` adapter's `result()` THROWS the error text, so on
  the very adapter that hosts the rejecting model the 400 arrives at the
  catch arm; discovered by the live cell, which stayed red until the catch
  arms consulted the predicate too).
- **Sev/Diff estimate:** S2/D2 — S2: every typed `@` query on such a model
  returns `Err(transport)` unless the model happens to volunteer the respond
  call in its free phase; the free phase (tool calls, edits, real work) runs
  to completion first, so the failure discards completed work and burns the
  full token cost. All twenty triage children of quality-loop wave
  qw20260917095931 failed this way (their verdict notes were appended; the
  verdicts were lost). A `bind_model:` naming such a model burns the binder
  retry budget the same way. D2: a shared rejection predicate, one degraded
  re-dispatch at each of the two forced-dispatch sites, spec pin
  clarification, offline doubles + one live cell.
- **Kind:** unhandled provider capability regression. The forced-dispatch
  contract assumed forcing is refused only at API-family granularity (the
  measured-spelling gates of bugs 0010/0417/0480). Anthropic's
  `claude-fable-5-1` introduces MODEL-level refusal within a supported api.
- **Spec basis** (at `961abd72`, v0.480.0):
  [`pi-integration-contract/conversation-drive.md` §`complete()` forced-tool behavioural presupposition](../spec_topics/pi-integration-contract/conversation-drive.md#complete-forced-tool-presupposition)
  property (1): "calling with a forced named-tool `options.toolChoice`
  forces the named tool — the choice is never left unconstrained". The
  supported-api gates bound which apis have a MEASURED spelling; nothing
  bounds which MODELS of a supported api accept the spelling.

## Summary

The typed query's forced respond turn and the binder inference call both
dispatch off-session `complete()` with `options.toolChoice` forced to the
synthesised tool (`FORCED_TOOL_CHOICE_BY_API`, anthropic spelling
`{type:"tool",name}`). `anthropic/claude-fable-5-1` rejects that request:

    400 invalid_request_error — "tool_choice: type \"tool\" and \"any\" are
    not supported for this model."

Measured 2026-09-17 with a `max_rounds: 0` probe (no free phase, single
user message, thinking disabled — pi-ai's anthropic adapter sends
`thinkingEnabled: false` when no `reasoning` option is passed): the
rejection is unconditional for the model, not the thinking×tool_choice
conflict. The same probe binds fine on `claude-fable-5` and
`claude-sonnet-5`, and on `unity-completions/kimi-k2.7-code`,
`unity-completions/gemini-3.7-flash`, `unity-responses/gpt-6-astra`
(their apis' spellings). So the capability is dropped in Anthropic's
newest model while every other roster model retains it.

On the respond path the 400 resolves through `classifyOffSessionReply` →
`classifyProviderResponse` → transport Err, which terminates the typed
loop with no repair attempt (QRY-11 §non-validation: a provider failure is
terminal). The free phase has already run at that point: in the
quality-loop wave the triage children each read the candidate, re-verified
evidence, appended their verdict note via `edit` — then the forced turn
400'd and the child returned `Err(transport)`. Twenty of twenty children
failed identically; the orchestrator mapped each to a synthetic
"questionable" verdict (its own diagnosability gap, fixed loop-side).

## Why the failure is conditional in practice

When the free-phase model VOLUNTEERS the respond tool call, early-respond
capture resolves the query and the forced dispatch never runs — which is
why smoke tests that don't steer the free phase to prose pass on
fable-5-1, and why the same wave's lens workers (whose models volunteer
more readily, or whose pins support forcing) succeeded. The forced path is
exercised exactly when the model ends its free phase in prose — the
less-compliant case, i.e. precisely when forcing was the mechanism relied
upon.

## Fix (implemented at the two forced-dispatch sites)

**Degraded re-dispatch on the rejection signature.** A shared predicate
`isForcedToolChoiceRejection` (beside `FORCED_TOOL_CHOICE_BY_API` in
`src/binder/forced-tool-choice.ts`) recognises the transport class: an
invalid-request rejection whose message names `tool_choice` as unsupported.
On a first forced dispatch failing with that signature, the site re-issues
the SAME request ONCE with `options.toolChoice` omitted (provider default
`auto`) — the context still carries exactly one tool and the trailing
template already instructs the model to call it, so the degraded dispatch
is the strongest remaining request the provider admits:

- **Typed-query respond site** (`dispatchForcedRespondTurn`): the degraded
  reply flows through the unchanged interpretation pipeline — extraction
  first, aborted precedence, stop-reason classification, ERR-17
  non-compliance (a degraded reply that answers in prose lands in the
  existing respond-repair loop, which restarts the two-phase drive). No
  second degradation: a repeat rejection or any other failure is terminal
  as before.
- **Binder site** (`#completeBinderReply` caller): the same one-shot
  degradation inside the SAME budgeted attempt (the downgrade is a
  protocol adaptation, not a transport flake — it does not consume the
  binder retry budget). The binder's existing malformed-envelope taxonomy
  covers a degraded reply that fails to call the tool.

A non-matching failure (any other 400, 401, 5xx, overflow, abort) never
degrades. The api-level gates are untouched: they bound where a MEASURED
spelling exists; this fix handles a model inside a measured api refusing
the spelling at runtime.

## Witnesses

- `tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts` —
  offline doubles over both sites: forced 400 with the signature → one
  degraded re-dispatch (no `toolChoice` in the second call's options) →
  payload binds; degraded reply non-compliant → ERR-17/repair (respond) /
  malformed taxonomy (binder); non-matching 400 → terminal, no re-dispatch;
  rejection on the degraded dispatch → terminal (one shot);
  `isForcedToolChoiceRejection` unit cells.
- `tests/live/b0481live-fable51-typed-query-degraded-live-cell.test.ts` —
  a typed query on `anthropic/claude-fable-5-1` with a prose-steered free
  phase binds its payload through the degraded dispatch. **Documented
  correct-reason red at the current pi pin (`~0.80.10`)**: Anthropic
  version-gates fable-5-1 behind a `claude-cli` version newer than the pinned
  pi-ai identifies as (`claude_code_version_too_old`, 2.1.75 < 2.1.251), so
  the model is undrivable from the pinned host and the cell fails loudly on
  that NAMED precondition before any tool_choice behaviour is observable.
  Activates on the next pi version bump. The degradation itself is fully
  witnessed offline (both arms, the live-measured signature verbatim), and
  the end-to-end measurement on the real API was performed manually on the
  operator's pi 0.85.1 (§Live measurement record).

## Live measurement record (2026-09-17, pi 0.85.1, pi-theta 0.480.0)

`max_rounds: 0` probe (`schema Out { sum: integer }`, query "What is 263
plus 514?"), per model: `claude-fable-5-1` → 400 (signature above);
`claude-fable-5`, `claude-sonnet-5`, `kimi-k2.7-code`,
`gemini-3.7-flash`, `gpt-6-astra` → payload bound. Long-window repro:
`/triage-finding` on a wave candidate — the child ran its entire body
(note appended) then 400'd identically, confirming window content is
irrelevant.
