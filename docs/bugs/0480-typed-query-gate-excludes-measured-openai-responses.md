# Bug 0480 — the typed-query provider gate still refuses `openai-responses` although bug 0417 live-measured the api's forced-tool spelling and admitted it to the binder gate: a typed `@` query on a `unity-responses/*` model warns `typed-query-unsupported-provider` at load and returns `Err(transport: "openai-responses does not support forced tool-use")` at runtime, while the binder drives the same adapter successfully

- **Status:** fixed (0.480.0) — `openai-responses` admitted to
  `TYPED_QUERY_SUPPORTED_PROVIDER_APIS` (six → seven) on the measurement
  law, with the forced respond turn live-measured through the adapter.
- **Sev/Diff estimate:** S3/D1 — S3: no wrong answer, a loud refusal; but
  every Responses-api model (the whole `unity-responses` registry, including
  the reasoning models whose Responses-only features are the reason to
  choose that route) was unusable for typed queries — and therefore for
  every `.pi/theta/workers/*.theta` worker, all of which end in a typed
  query. D1: one constant, one spec set count, one live cell, one offline
  pin.
- **Kind:** stale allowlist. The gate is a *measurement-bounded* set: pi-ai
  forwards `options.toolChoice` verbatim and each api family needs its own
  spelling of "force this named tool". Bug 0010 minted the set from the six
  apis with a measured spelling; bug 0417 measured the Responses family's
  FLAT `{type:"function",name}` spelling on the **binder** call and admitted
  `openai-responses` to `BINDER_SUPPORTED_APIS` — its report scoped the
  respond-path set out ("deliberately outside it for typed queries",
  0417 §Root cause) rather than finding a failure there. The two gates
  disagreed on an api whose spelling was known.
- **Spec basis** (at `1fdad2ba`, v0.479.0 — pre-amendment wording):
  [`pi-integration-contract/conversation-drive.md` §Provider compatibility for typed queries](../spec_topics/pi-integration-contract/conversation-drive.md)
  line 33 pinned "the six `api`-shaped values …" and, in the same
  paragraph, listed "OpenAI Responses" under future widening; the bug-0417
  pin clarification on line 35 recorded the flat spelling and the
  binder-only admission.

## Summary

`src/binder/provider-error-mapping.ts` `TYPED_QUERY_SUPPORTED_PROVIDER_APIS`
(the single source of truth for the load-time warning
`checkThetaTypedQueryProviderSupport` and the runtime gate in
`#buildRespondTurnContext`) lacked `openai-responses`, while
`src/binder/forced-tool-choice.ts` carried the api's measured spelling row
(`"responses-function"`) and `BINDER_SUPPORTED_APIS` admitted it.

## Reproduction

`.pi/theta/workers/fix-cluster.theta` pinned to `unity-responses/gpt-6-astra`
(api `openai-responses`): the load pass warns
`theta/load/typed-query-unsupported-provider`; the worker's typed
`let r: FixReport = @\`…\`` returns `Err(transport …)` before any provider
turn. The same model through `unity-completions` (api `openai-completions`)
binds. The binder path (`bind_model: unity-responses/gpt-4.1`) already
worked — `tests/live/b0417live-responses-binder-toolchoice-live-cell.test.ts`.

## Expected behaviour

An api with a live-measured forced-tool spelling is admitted to both gates.

## Fix (0.480.0)

- `TYPED_QUERY_SUPPORTED_PROVIDER_APIS` gains `openai-responses` (seven
  members). `openai-codex-responses` stays outside both gates: its row is a
  code-read, not a measurement.
- Spec: `conversation-drive.md` §Provider compatibility (seven, with the
  bug-0480 pin clarification), the seam note, `version-bump-step2.md` (four
  references), `code-registry-load.md` (the warning's row),
  `future-considerations/surface-extensions.md` (the Responses family is no
  longer a future item).

### Witnesses

- `tests/live/b0480live-responses-typed-query-live-cell.test.ts` — **the
  measurement**: a `mode: prompt` theta with `model: unity-responses/gpt-6-astra`
  runs a typed `@` query whose free-phase turn is steered to plain prose, and
  then renders the bound value into a second, untyped turn's user text
  (`B0480-BOUND value=777`) — the deterministic outbound-render channel; no
  fail-closed note. The PATH is pinned: the settled transcript carries no
  on-session `__theta_respond_*` call, so the binding came from the
  off-session forced `complete()` dispatch — the one place the flat toolChoice
  reaches the wire on the respond path (without the prose steer the model
  volunteered the on-session tool in 3/3 runs, which binds but measures
  nothing; with it, 0/3). Offline attribution guard first (membership + no
  load warning), so a neutralised fix reds token-free. Green 4/4 on
  2026-09-17 against pi 0.85.1 / LiteLLM.
- `tests/typed-query-provider-gate.test.ts` — offline pin: `openai-responses`
  inside, `openai-codex-responses` outside, no load warning. Red at the fork
  (constant probe-reverted: 1 failed / 18 passed).

## Related

- Bug 0010 (the set's origin), bug 0417 (the flat spelling; binder-only
  admission), bug 0479 (frontmatter `model:` drives every turn — without it a
  worker's `unity-responses/*` pin would never have reached the gate).
