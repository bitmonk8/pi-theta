# Bug 0011 — The production binder `complete()` call passes no tools and no `toolChoice`: the envelope is obtained by prose instruction and text parsing, not the pinned forced-tool structured output

- **Status:** open.
- **Kind:** defect — implementation mechanism diverges from the documented
  binder call shape. The binder's own spec page
  (`pi-integration-contract/binder-inference.md`) pins the forced-tool call for
  the binder call itself: `context.tools` carries exactly one entry (the
  binder's structured-output tool, `__theta_bind_<slug>`, parameters = the
  envelope schema), the provider's tool choice is forced to it via
  `options.toolChoice`, and the envelope is extracted from the first matching
  `ToolCall`'s `arguments`. Sibling pins agree: the determinism page pins the
  "envelope-as-forced-tool attachment mode", the binder-model page's
  strict-capability gate presupposes structured output, and the
  `complete()`-forced-tool presupposition (reworded by the bug-0010 fix at
  0.20.0) names "the binder's structured-output call" as depending on forced
  `toolChoice`. The production call (`#completeBinderReply`) passes **no
  `context.systemPrompt`, no `tools`, no `toolChoice`, no seed, no
  `onResponse`** — one user message carrying a rendered prose prompt with a
  JSON-only instruction, text-parsed into the envelope. One honest
  complication bounds the directionality: the divergence is a *deliberately
  recorded* spec-vs-provider conflict (commit `d848f1b2` live-confirmed that
  the pinned tool `parameters` — a top-level `anyOf` — is not a valid
  Anthropic `input_schema`, so the forced call returned empty arguments), so
  unlike bug 0010 no zero-spec-change alignment exists: conforming requires a
  narrow spec amendment to the attachment shape, and blessing the shipped
  mechanism requires rewriting five pages. The spec was never amended in
  either direction; the conforming call constructor
  (`buildBinderCompleteCall`, `src/binder/binder-inference.ts:132`) has no
  production caller.
- **Affected:** the genuine binder pass in `ProductionThetaProducer.runBinder`
  (`src/extension/production-theta-producer.ts` — prompt build :660, attempt
  :707) → `#classifyBinderAttempt` (:826) → `#completeBinderReply` (:879,
  `complete()` triple :904–908); the prose prompt renderer
  `renderBinderTurnPrompt` (:5155, JSON-only instruction :5179) and the text
  parsers `parseBinderEnvelope` (:5210) / `parseOkEnvelopeArgs` (:5380).
  Conforming-but-unwired counterparts: `buildBinderCompleteCall`
  (`src/binder/binder-inference.ts:132` — full pinned triple: system prompt,
  fixed user-message literal, single tool, `toolChoice` :159, temperature 0,
  per-api seed :50/:164, signal, onResponse; imported only by
  `tests/binder-inference-provider-mapping.test.ts` and
  `tests/binder-system-note-determinism.test.ts`), the V11d system-prompt
  builder (`buildBinderSystemPrompt`,
  `src/binder/binder-system-prompt.ts:175` — production import is type-only
  via `compact-transcript.ts`), and the FNV-1a seed (`deriveBinderSeed`,
  `src/binder/binder-seed.ts:43` — test-only callers). Reusable bug-0010
  machinery the binder does not use: `FORCED_TOOL_CHOICE_BY_API` /
  `respondToolChoiceForApi` (`production-theta-producer.ts:4894/:4911`).
- **Observed at:** `0.20.0`, host Pi `0.82.1` (repo-local SDK pins
  `@earendil-works/pi-ai` / `pi-coding-agent` 0.80.10). Recorded as a sibling
  defect by bug 0010's Non-goals and its triage commit `f8909cdf`
  ("binder-precedent claim corrected"); this report is that record.

## Summary

The spec's binder pass issues one off-session `complete(model, context,
options)` call per attempt whose structure is provider-enforced:
`context.systemPrompt` is the rendered binder system prompt (the normative
eight-item structure of binder-bypass-and-envelope.md §System-prompt
structure), `context.messages` is the fixed single-element literal `Bind the
slash-command arguments now.`, `context.tools` is exactly the binder's
structured-output tool wrapping the per-theta envelope schema, `toolChoice` is
forced to it, `options` carry temperature 0, the FNV-1a seed under the
provider's seed field, `thetaAbort.signal`, and the `onResponse`
provider-response capture that feeds the classifier its HTTP status. The
envelope is read from the first matching `ToolCall`'s `arguments`.

The implementation sends one prose user message and parses text.
`#completeBinderReply` (:879) calls `complete(model, { messages: [{ role:
"user", content: prompt, timestamp: 0 }] }, options)` with `options` = signal
+ `temperature: 0` + registry auth — nothing else. `prompt` is
`renderBinderTurnPrompt` (:5155): theta identity, raw arguments, the inlined
params schema, the defaulted-fields line, then "Respond with ONLY a single
minified JSON object and nothing else — no prose, no markdown, no code fences"
plus the three envelope arms and the inlined envelope schema JSON (:5179–5185).
`#classifyBinderAttempt` (:826) routes the reply by
`parseBinderEnvelope(assistantText(reply))` (:863) — `parseStructuredPayload`'s
first-`{`-to-last-`}` slice, structural `kind`/`message` checks, no AJV against
the envelope schema — and re-parses the `ok` arm's `args` out of the same text
(:865, :5380). The classifier input fabricates `httpStatus: 200` (:850)
because no `onResponse` is ever registered. There is no system prompt, no
fixed-literal message, no seed, no tool, no forced choice, no
`ToolCall`-arguments extraction: every structured-output facet of the pinned
call shape is absent from production, while the conforming constructor that
implements all of them sits test-only in `src/binder/binder-inference.ts`.

## Reproduction

Code-reading plus token-free mechanical checks; a live repro is optional (the
token-gated `tests/hardening/session-binder.test.ts` drives the same free-text
mechanism against a real provider).

Mechanical check 1 — the production binder call carries no structured-output
facet:

```
$ sed -n '904,908p' src/extension/production-theta-producer.ts
    return complete(
      model,
      { messages: [{ role: "user", content: prompt, timestamp: 0 }] },
      options,
    );
```

`options` is assembled at :884–903: `signal`, `temperature`, `apiKey`/`headers`
only. Every `rg -n "toolChoice" src/extension/production-theta-producer.ts`
hit is typed-query respond machinery or its comments (the provider-gate
comment :2360, the free-phase "NO `toolChoice`" comments :4146/:4428, the
spelling table and forced dispatch :4879–:4994) — none is on the binder path.

Mechanical check 2 — the conforming constructor has no production caller:

```
$ rg -l "buildBinderCompleteCall" src/ tests/
src/binder/binder-inference.ts            # declaration site
tests/binder-system-note-determinism.test.ts
tests/binder-inference-provider-mapping.test.ts
```

Mechanical check 3 — the committed suite pins the prose mechanism as correct.
`tests/e2e-s5-binder-echo-emission.test.ts` mocks pi-ai's `complete` and
scripts replies through `envelopeReply(json)` — "An assistant reply whose text
content is the given free-text envelope JSON" (:70–71) — then drives the
production `runBinder()` to the echo/failure notes; its own header diagrams
the path "off-session `complete()` (MOCKED here) → parse the free-text
envelope → `ok`". It passes at HEAD. Under the pinned mechanism a scripted
*text* envelope with no `ToolCall` is the malformed-envelope class — every
`ok`-arm cell in that suite would fail.

## Expected behaviour (what the spec says)

All quotes from
`docs/spec_topics/pi-integration-contract/binder-inference.md` §"Binder
inference call" unless noted:

- "`context.systemPrompt` is the rendered binder system prompt (per
  [System-prompt structure])." The variable binding context "is carried by
  `context.systemPrompt` … so the message neither restates that context nor
  varies per invocation."
- "`context.messages` is a fixed single-element array carrying one
  `user`-role message whose `content` is the canonical literal string `Bind
  the slash-command arguments now.`."
- "`context.tools` carries exactly one entry — the **binder's
  structured-output tool** — whose `parameters` is the binder envelope schema
  wrapped as `Type.Unsafe<unknown>(envelopeSchema)` … `name` is
  `__theta_bind_<slug>` … `label` is the literal string `"Theta binder
  envelope"` … The provider's tool choice is forced to that single tool
  through the same per-provider `options.toolChoice` mechanism the typed-query
  forced respond turn uses … theta 1.0 attaches the envelope as a single
  forced tool, not as a provider-native structured-output / JSON-schema
  response field."
- "the fixed seed, when the resolved provider's `Api` carries a seed field, is
  placed under that field name … per [Provider seed-field mapping]."
- "`options.onResponse` is the runtime's provider-response capture callback:
  the runtime registers it on every binder `complete()` call so the
  `ProviderResponse { status, headers }` … can be joined with the resolved
  `AssistantMessage` … to supply the HTTP-status input the [Provider error
  mapping] classifier reads."
- "The structured-output result is extracted from the returned
  `AssistantMessage.content`: the first `ToolCall` whose `name` matches the
  binder's structured-output tool supplies the envelope JSON in its
  `arguments`. … an `AssistantMessage` carrying no such `ToolCall` — plain
  text only, or a `ToolCall` with a different `name` — is likewise the
  malformed-envelope condition." (This extraction rule is stated *here*, on
  the binder's page, for the binder call; the bug-0010 fix borrowed it for the
  typed respond dispatch — the borrowing ran spec→typed, not typed→binder.)
- `binder/determinism-cancellation-failure.md` §Determinism: "The request
  payload layout that carries this `temperature: 0` pin and the seed below
  into the provider call — the entry-point symbol, the `options` field
  placement, and the **envelope-as-forced-tool attachment mode** — is pinned
  by [Pi Integration Contract — Binder inference call]." The same section
  specifies the FNV-1a seed recipe with reference vectors.
- `pi-integration-contract/conversation-drive.md`
  §`complete()`-forced-tool presupposition (wording landed with the 0.20.0
  bug-0010 fix): "The forced respond turn above **and the binder's
  [structured-output call]** both depend on two behavioural properties … (1)
  calling with a forced named-tool `options.toolChoice` forces the named
  tool…"
- `binder/binder-model-and-context.md`: "The resolved model must support
  strict structured-output / strict tool-input" (the load-time
  `strictCapable` gate), with the non-normative note "Binder calls are
  structurally function-calling tasks (schema in, JSON out)".
- `binder/binder-bypass-and-envelope.md`: "The envelope schema document
  **handed to the provider** (and to AJV) carries the transitive `$defs`
  closure of the params schema" — the provider only ever sees the envelope
  schema through the tool attachment.

## Actual behaviour / root cause

Facet by facet, spec vs `#completeBinderReply` / `#classifyBinderAttempt`:

| Facet | Spec | Implementation |
|---|---|---|
| `context.systemPrompt` | rendered binder system prompt (normative 8-item structure, cka-45) | absent; everything rides the user message (:906); the V11d builder is production-unwired |
| `context.messages` | fixed literal `Bind the slash-command arguments now.` | the whole rendered prose prompt, varying per invocation (:906, :5155) |
| `context.tools` | exactly one `__theta_bind_<slug>` tool wrapping the envelope schema | none; the envelope schema is inlined as JSON text in the prompt (:5184–5185) |
| `options.toolChoice` | forced to the binder tool, per-api spelling | never set |
| Envelope extraction | first matching `ToolCall`'s `arguments`; plain text = malformed | `parseStructuredPayload` text slice of the assistant text (:863, :5210); plain text is the *expected* success shape |
| Envelope validation | matching `ToolCall` whose `arguments` fail parse *or schema validation* → malformed | structural routing only (`kind` in-set, `message` non-empty); no AJV against the envelope schema, `maxLength: 500` model budget unenforced |
| Seed | FNV-1a under the provider's seed field | omitted (WHY comment at :890–894) |
| `options.onResponse` | registered on every binder call; feeds the classifier's HTTP status | never registered; classifier input hard-codes `httpStatus: 200` (:850) |
| `temperature` / `signal` / off-session | `0` / `thetaAbort.signal` / off-session, no turn | conforming (:889/:895; the off-session/BND-3 facets are conforming) |
| Retry taxonomy / failure notes | per-class budgets, template rows | conforming since `d848f1b2` — contrast with the facets above |

Root cause is recorded in the tree and in history — the divergence was
deliberate, twice:

- **2026-07-01** (`a9ef30e6` / `3a93fd4e`, V9j-T/V9j): the conforming call
  constructor `buildBinderCompleteCall` is declared and fully implemented per
  binder-inference.md — and never given a production caller.
- **2026-07-03** (`fed12acd`, H9a Phase 1): the first live binder pass ships
  in the producer as the free-text mechanism (`renderBinderTurnPrompt` +
  `parseBinderEnvelope`), bypassing the two-day-old constructor.
- **2026-07-12** (`d848f1b2`, "wire provider-error retry taxonomy on the
  **free-text binder**"): the commit message records the decision: "NOT done
  (recorded as a spec-vs-provider conflict): the spec-pinned forced-tool
  structured-output binder call + FNV-1a seed. **Live-confirmed unrealizable
  against the available provider — the three-arm anyOf envelope is not a valid
  Anthropic tool input_schema (must be type:object), so the model force-calls
  the tool with empty arguments and every bind fails malformed.** The shipped
  free-text envelope binder is retained as the pragmatically-correct
  implementation." The in-code WHY comment survives at
  `#classifyBinderAttempt` (:821–824): "the pinned forced-tool mechanism is
  unrealizable against the available providers — a top-level `anyOf` envelope
  is not a valid tool `input_schema`, yielding empty tool args — so the binder
  stays a free-text envelope call". The spec was not amended.
- **2026-07-27** (`9db6afe9` / `f8909cdf` / `30492948`): bug 0010's draft
  called the binder call "the pattern to copy"; its triage corrected that to
  a sibling defect ("the production binder call carries no tools/toolChoice
  either"). The 0.20.0 fix then aligned the *typed-query* path, built the
  per-api `FORCED_TOOL_CHOICE_BY_API` spelling table, and re-affirmed the
  binder half of the forced-tool presupposition in conversation-drive.md —
  while the binder path itself was untouched.

The `d848f1b2` observation is real: the envelope schema is a top-level
three-arm `anyOf` (`buildBinderEnvelopeSchema`,
`src/binder/binder-envelope.ts:78–121`), and Anthropic requires `input_schema`
to be object-rooted. But it falsifies only the pinned *attachment shape* —
`parameters` = the raw `anyOf` document — not the forced-tool mechanism as
such: the same fix that closed bug 0010 live-proved forced named-tool calls
through `complete()` on the supported providers, with object-rooted
`parameters`. The blocker is one wrapper away from resolvable, and the spec
already versions the envelope schema (BNDR-1/BNDR-2) as changeable surface.

## Why it matters

Bounded honestly — the binder has its own retry taxonomy and graceful failure
arms, and the hardening suite passes live against a capable model. Degree, not
totality:

- **Envelope reliability rests on prose compliance.** The same hazard class
  bug 0010 removed for typed queries: nothing provider-side constrains the
  reply, so a model that wraps the JSON in prose, fences, or commentary
  survives only as far as `parseStructuredPayload`'s brace slice. The
  binder-model guidance actively steers authors to cheap models ("Claude
  Haiku, GPT-4o-mini, Gemini Flash are usually adequate") — the population
  most likely to need the forcing. The malformed budget is one retry
  (`MAX_BINDER_LLM_CALLS = 3` ceiling); a persistently prose-wrapping binder
  model fails **every** invocation of every parameterized theta (the binder
  gates the body), each failure costing up to two provider calls before the
  `could not parse arguments` note.
- **The determinism contract is half-dead in production.** `temperature: 0`
  ships; the FNV-1a seed (spec'd with reference vectors) is never sent, and
  the "fixed footprint" property — variability isolated into the system
  prompt, `context.messages` a constant — does not exist, because there is no
  system prompt and the single message *is* the variable prompt.
- **Envelope-schema validation is not applied where the spec puts it.**
  `parseBinderEnvelope` accepts any object with an in-set `kind` and non-empty
  `message`; the `maxLength: 500` "model budget so a runaway binder response
  is rejected as malformed" is unenforced, extra keys pass, and a
  non-object/absent `ok.args` silently becomes `{}` (:5380–5390) — reaching
  the defaults-merge as if the binder had omitted everything (the post-merge
  AJV gate then rejects required fields, converting what the spec classes as
  malformed-envelope into a `could not parse arguments`-adjacent failure
  downstream). Bounded: the post-default-merge AJV validation over the
  *merged args* is present and conforming.
- **The classifier's HTTP-status input is fabricated.** With no `onResponse`,
  every binder attempt classifies with `httpStatus: 200` (:850): the
  HTTP-status arm of the provider-error-mapping table is unreachable for the
  binder; only the stop-reason arm and the openai HTTP-200 overflow gate do
  work. Bounded: throws and error-stops still classify as transport, and
  retry-after timing is delegated to pi-ai regardless.
- **A load-time gate polices a capability production never exercises.** The
  binder-model `strictCapable` probe exists to guarantee the structured-output
  call can be forced; production never forces anything. (Under the current
  SDK pin the probe universally takes the unknown-W branch, so this is
  latent.)
- **Spec-trust cost.** The 0.20.0 spec wording asserts the binder "depends"
  on forced `toolChoice` today, and version-bump checklist items re-validate
  binder call behaviours (forced-tool fixtures, `onResponse` capture) that the
  production binder does not have. The next reader who treats
  binder-inference.md as ground truth repeats bug 0010's draft error in the
  opposite direction — that is precisely how this report's subject was
  mis-cited as a conforming precedent.

## Options

Neither direction is zero-spec-change; the `d848f1b2` finding forces an
amendment somewhere. Argued from the documents:

1. **Align the binder to the pinned forced-tool shape, amending only the
   attachment clause** (recommended). Wire `buildBinderCompleteCall` into
   `#completeBinderReply` (keep the registry auth threading, which the
   constructor lacks and the typed dispatch already models), wire the V11d
   `buildBinderSystemPrompt` and `deriveBinderSeed`, register `onResponse`,
   and extract per the binder-inference.md `ToolCall`-arguments rule — the
   0.20.0 fix already implements that exact extraction for the respond
   dispatch, so this is the second consumer of proven machinery, including
   `FORCED_TOOL_CHOICE_BY_API` / `respondToolChoiceForApi` for the per-api
   `toolChoice` spelling. Two known deltas in the constructor itself: it
   hardcodes the normalized `{ type: "tool", name }` spelling (:159), which
   the 0010 pin clarification showed yields a 400/`TypeError` on
   `openai-completions` / `mistral`-family apis — it must take the per-api
   table; and its `parameters` wrap must change with the attachment fix. The
   attachment fix: root the tool `parameters` in an object — either wrap
   (`{type:"object", properties:{envelope:<anyOf>}, required:["envelope"]}`,
   preserving BNDR-1/BNDR-2 verbatim one level down) or flatten to one object
   arm with a `kind` enum — and amend binder-inference.md's `context.tools`
   bullet plus binder-bypass-and-envelope.md's "handed to the provider"
   sentence accordingly (a spec-versioned schema change either way; BNDR-1's
   three-arm discriminator survives both variants, AJV keeps validating the
   true `anyOf` downstream). Blast radius, honestly: the binder's provider
   traffic changes shape (re-run the live hardening suite — `d848f1b2`
   falsified only the unwrapped `anyOf`, so the wrapped forced call needs its
   own live confirmation before the free-text path is deleted);
   `renderBinderTurnPrompt` / `parseBinderEnvelope` / `parseOkEnvelopeArgs`
   retire; `tests/e2e-s5-binder-echo-emission.test.ts` re-scripts its replies
   as `ToolCall`-bearing messages; envelope AJV moves to the routing step;
   the classifier gains real HTTP statuses (its `httpStatus: 200` pins in
   `tests/binder-inference-provider-mapping.test.ts` move).
2. **Align the spec to the shipped free-text mechanism.** Rewrite
   binder-inference.md (call shape, extraction rule, `onResponse`, seed
   placement), determinism-cancellation-failure.md (the
   envelope-as-forced-tool attachment mode, the FNV-1a seed and its reference
   vectors, the fixed message literal), binder-bypass-and-envelope.md (the
   System-prompt structure section — production sends no system prompt at all
   — and "handed to the provider"), binder-model-and-context.md (the
   strict-capability gate premise), conversation-drive.md (strip the binder
   from the forced-tool presupposition — reversing wording that landed with
   0.20.0), implementation-notes.md §Runtime, and the version-bump items
   covering binder call behaviours. Zero runtime change; matches what has
   shipped since `fed12acd` and the `d848f1b2` rationale. Rejected as the
   recommendation: it writes prose-hope structure into the contract for the
   component gating every parameterized slash dispatch; it discards the
   determinism seed and the classifier's HTTP-status input as specified
   surface; the repo rule is that the Reference is the authority
   (docs/bugs/README.md); and the "unrealizable" premise is narrower than the
   mechanism it was used to shelve — only the top-level-`anyOf` attachment
   was falsified, and the forcing machinery it lacked in July now exists,
   live-proven, one call site away.

If option 1 is adopted, stage it behind the existing seams: the attempt
classifier's input shape (`BinderAttemptOutcome`) and the retry driver are
mechanism-agnostic, so the dispatch swap, the envelope-AJV move, and the
`onResponse` wiring can land as separate increments.

## Non-goals

- The typed-query forced respond mechanism — fixed at 0.20.0 (bug 0010),
  including its recorded residuals (the degraded unlowerable-annotation arm,
  the unobservable load-warning channel). Not re-litigated here.
- The binder retry taxonomy, per-class budgets, failure-mode template rows,
  and stop-reason classification — conforming since `d848f1b2`; contrast
  only.
- The three-arm envelope design itself (BNDR-1/BNDR-2) and the bypass
  classification — both options preserve them; only the *attachment* of the
  schema to the provider call is in scope.
- Binder-model resolution and the `strictCapable` probe mechanics — the gate's
  premise is noted under Why it matters; its behaviour is as specified.
- The typed-query respond tool's own `parameters` wrap
  (`Type.Unsafe<unknown>(lowered)`, unwrapped) shares the object-root
  `input_schema` exposure for non-object response schemas (e.g. `@<integer>`);
  unverified live here and a candidate neighbour report, not this defect.
- The stale "V9j-T stub: returns an inert triple" doc comment on the
  fully-implemented `buildBinderCompleteCall` — cosmetic; subsumed by option
  1's wiring.

## Provenance

- Spec measured against:
  `docs/spec_topics/pi-integration-contract/binder-inference.md` (§Binder
  inference call — every bullet quoted above),
  `docs/spec_topics/binder/determinism-cancellation-failure.md`
  (§Determinism, §Failure-class taxonomy, §Per-invocation retry budget),
  `docs/spec_topics/binder/binder-bypass-and-envelope.md` (§System-prompt
  structure (normative), §Binder envelope schema, `$defs` closure sentence),
  `docs/spec_topics/binder/binder-model-and-context.md` (strict-capability
  gate, model guidance note),
  `docs/spec_topics/pi-integration-contract/conversation-drive.md`
  (§`complete()` forced-tool presupposition, §`complete()` retry-timing and
  cancellation presupposition).
- Implementation: `src/extension/production-theta-producer.ts` (`runBinder`
  :591 — genuine-binder arm prompt build :660, attempt :707;
  `#classifyBinderAttempt` :826 (WHY comment :821–824,
  classifier input :850, envelope routing :863–:867), `#completeBinderReply`
  :879–:909 (seed-omission comment :890–894, `complete()` triple :904–908),
  `FORCED_TOOL_CHOICE_BY_API` :4894, `respondToolChoiceForApi` :4911,
  `renderBinderTurnPrompt` :5155–:5187, `parseBinderEnvelope` :5210,
  `parseOkEnvelopeArgs` :5380), `src/binder/binder-inference.ts`
  (`buildBinderCompleteCall` :132, `toolChoice` :159, `BINDER_SEED_FIELD_BY_API`
  :50, `BINDER_MESSAGE_CONTENT` :74), `src/binder/binder-envelope.ts`
  (`buildBinderEnvelopeSchema` :78 — the top-level `anyOf` :84),
  `src/binder/binder-system-prompt.ts` (:175), `src/binder/binder-seed.ts`
  (:43).
- History: `a9ef30e6` / `3a93fd4e` (2026-07-01, V9j-T/V9j — conforming
  constructor built, never wired), `fed12acd` (2026-07-03, H9a Phase 1 —
  production free-text binder born), `d848f1b2` (2026-07-12 — retry taxonomy
  wired; commit message records the forced-tool call as "Live-confirmed
  unrealizable", quoted above), `9db6afe9` / `f8909cdf` (2026-07-27, bug 0010
  report + triage — the triage corrects the binder-precedent claim and
  records this sibling defect), `30492948` (0.20.0 — typed path aligned,
  forcing machinery + spec presupposition wording added, binder unchanged).
- Tests inspected: `tests/e2e-s5-binder-echo-emission.test.ts` (mocked
  `complete`, free-text `envelopeReply` :70–71 — pins the prose mechanism),
  `tests/hardening/session-binder.test.ts` (live, token-gated, 10 cases —
  same mechanism), `tests/binder-inference-provider-mapping.test.ts` and
  `tests/binder-system-note-determinism.test.ts` (exercise the conforming
  constructor and the provider-error classifier — green while production
  diverges), `tests/binder-retry-taxonomy.test.ts` (budgets;
  mechanism-agnostic).
- Recorded as out of scope by bug 0010 ("a sibling defect, not this report's
  subject") and by its triage commit `f8909cdf`; provenance chain: bug 0010
  Non-goals → its triage → this report.
