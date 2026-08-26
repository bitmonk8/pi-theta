# Bug 0291 — `classifyOffSessionReply`'s transport fold pins `retryable: false` / `http_status: null` regardless of transport-error class, so the no-HTTP-response class `provider-error-mapping.md:7` routes through `TransportError { retryable: true, http_status: null }` — and the 5xx/429 classes `:13` assigns `retryable: true` — are author-unreachable at every off-session seam, making the fold a second path that "pins `retryable: false` independent of HTTP class" where `:13` says the unsupported-provider synthesis is the one such path

- **Status:** open.
- **Sev/Diff estimate:** S2/D3 — S2 because the observable is a wrong value on
  two author-visible machine-readable fields of a loud `Err`, not silence: the
  failure surfaces, its `message` carries the provider text, but `retryable`
  is `false` for the exact classes the mapping page assigns `true` (network
  level, 5xx, 429), so author retry logic keyed on the documented field
  (`match Err(Transport(e)) if e.retryable => retry`) never retries anything,
  and `http_status` is `null` — the value the schema comment defines as "no
  HTTP response" — even when a status was captured (the openai HTTP-200
  body-envelope case). Not S1: nothing is accepted silently and no success is
  fabricated (bug 0007 closed that at 0.18.0). D3 because the posture is
  test-pinned (two committed cells assert it, one naming PIC-51 as authority)
  and lineage-pinned (bug 0182 §Fix constraint 2 froze the fold's output
  surface while fixing its input), so a fix must either thread the
  classifier's own `http_status`/`retryable` through the fold and flip those
  cells with this report as authority, or amend `provider-error-mapping.md` to
  carve the off-session surface out — an in-run adjudication, not a mechanical
  edit.
- **Kind:** defect — spec/implementation divergence on two author-visible
  fields, with the implementation side pinned by tests citing an out-of-scope
  rule. Four elements, each source-traced or measured at `bc52da38`
  (v0.287.0):
  1. *The classifier populates the fields correctly and the fold discards
     them.* `classifyProviderResponse`'s transport arm returns
     `retryable: transportRetryable(input.httpStatus)` and
     `http_status: input.httpStatus`
     (`src/binder/provider-error-mapping.ts:398–403`;
     `transportRetryable` at `:324–328`: `null` → `true`, `429` → `true`,
     5xx → `true`, else `false` — the `:13` rule verbatim). The off-session
     fold calls it with the real captured status
     (`src/extension/production-theta-producer.ts:5986–5992`, bug 0182's fix)
     and then constructs the author-visible error with the literals
     `http_status: null` / `retryable: false`
     (`:6013–6021`), keeping only `message`.
  2. *The discarded values are the spec-prescribed ones.*
     `provider-error-mapping.md:7`: "The no-HTTP-response (network-level)
     class is the case where `onResponse` did not fire before `complete()`
     resolved with `AssistantMessage.stopReason: "error"`; **it routes through
     `TransportError { retryable: true, http_status: null }` per the retryable
     rule below.**" That class is precisely what every off-session provider
     failure at the theta-1.0 pi-ai pin looks like (the anthropic adapter
     measurably never fires `onResponse` on an error response — bug 0065,
     measured live; the openai/mistral/bedrock adapters share the shape by
     static read, bug 0182 §Reproduction (f)). `:13` assigns `true` to
     network-level, 5xx and 429, `false` to the rest, and closes with: "The
     unsupported-provider typed-query case … is **the one path that pins
     `retryable: false` independent of HTTP class**". The fold is a second
     such path, unnamed by any spec sentence.
  3. *The fold's cited authority is scoped elsewhere.* The fold's comment
     pins the surface as "PIC-51 / bug 0007"
     (`production-theta-producer.ts:6001–6007`), and the committed witness
     cites "(PIC-51 / conversation-drive.md:16)"
     (`tests/off-session-transport-classification.test.ts:983–985`). PIC-51
     and PIC-51b are by their own titles **prompt-mode driven-turn** rules,
     and PIC-51b states its reason: "The HTTP-status arm of that rule MUST NOT
     be consulted on this path — **it is unreachable from the
     `ReadonlySessionManager` read surface the probe uses**"
     (`conversation-drive.md:16`). At the off-session seams that reason is
     false since 0182: the status IS captured (`onResponse` is registered on
     all three `complete()` sites) and IS consulted — for the overflow gate —
     then discarded for the transport surface.
  4. *`retryable: true` and a non-null `http_status` are consequently
     author-unreachable everywhere.* Census at this HEAD: the only
     construction site populating either field from the classifier is
     `classifyProviderResponse` itself; its transport output is consumed by
     exactly two callers (`#classifyBinderAttempt` at
     `production-theta-producer.ts:1190`, which discards the variant into the
     binder-internal outcome, and `classifyOffSessionReply` at `:5986`, which
     overwrites both fields). Every other author-visible `TransportError`
     construction hardcodes `retryable: false` / `http_status: null`
     (`production-theta-producer.ts:4664–4668`, `:5454–5458`, `:6084–6103`,
     `:6145–6158`, `:6191–6193`; `src/runtime/prompt-transport-mapping.ts:119`,
     `:176`, `:237`; `synthesizeUnsupportedProviderTransportError`,
     `src/binder/provider-error-mapping.ts:149–153`). The documented field
     pair is constant on every path an author can observe.
- **Related:**
  - **0182** (fixed 0.110.0) — the parent lineage. Its fix threaded the real
    captured status into the fold's *classifier input* (mechanism (b)(1)),
    fixing the overflow gate; its §Fix constraint 2 explicitly froze the
    fold's *output* surface ("`http_status: null`, `retryable: false` … is
    unchanged for every input") as a fix-scoping constraint. That constraint
    scoped that fix run; it is not a spec adjudication, and the spec sentences
    in element 2 remain in force and uncarved. Its §Sev line also records the
    one cell where the pin is coincidentally right: "`retryable: false` is the
    correct disposition for a definite 400 refusal".
  - **0007** (fixed 0.18.0) — the fold's origin; it introduced the pinned
    surface when no status was captured at all (pre-0182 the input was a
    fabricated 200, and publishing `null`/`false` was the honest output for a
    seam that captured nothing). After 0182 the input side is honest and the
    output side is the residue.
  - **0065** (fixed 0.100.0) — measured the adapter non-firing that makes the
    no-HTTP-response class the ordinary off-session failure shape; its binder
    observation ("a real `prompt is too long` classifies as
    `TransportError { retryable: true, http_status: null }`") shows the
    classifier's own output for this class — the value the fold discards.
- **Affected** (verified at `bc52da38`, v0.287.0):
  - `src/extension/production-theta-producer.ts:5967` —
    `classifyOffSessionReply`; the classifier call with the captured status
    (`:5986–5992`), the fold comment claiming the pin (`:6001–6007`), the
    pinned construction (`:6013–6021`: `http_status: null` at `:6017`,
    `retryable: false` at `:6019`).
  - The four seams that reach it: `offSessionComplete` (`:5930–5950`),
    `OffSessionQueryModel.#driveFreePhaseRound` (fold call at `:5597`),
    `dispatchForcedRespondTurn` (fold call at `:6199`) — the last is also the
    prompt-mode typed query's forced respond dispatch, so both modes' typed
    queries ride this fold.
  - `src/binder/provider-error-mapping.ts:324–328` (`transportRetryable`),
    `:396–404` (the transport arm whose output is discarded).
  - Committed cells pinning the shipped posture:
    `tests/off-session-transport-classification.test.ts:453`/`:459` (cell W2:
    error-stop, no capture → `http_status` null, `retryable` false — the
    spec's `retryable: true` class), `:979–1010` (cell 0182-W6: captured 500 →
    both fields still pinned; its comment concedes "the classifier's OWN
    verdict [would be] `http_status: 500` / `retryable: true`").
  - Spec: `docs/spec_topics/pi-integration-contract/provider-error-mapping.md:7`
    (the no-HTTP-response routing sentence), `:13` (the retryable population
    rule and its "one path" closing sentence);
    `docs/spec_topics/errors-and-results/queryerror-variants.md:94`, `:102`
    (`retryable … populated by transport-error class`; `http_status … null on
    network-level failure (no HTTP response)`);
    `docs/spec_topics/pi-integration-contract/conversation-drive.md:16`
    (PIC-51/PIC-51b's prompt-mode scoping and the "unreachable read surface"
    rationale that does not transfer).
- **Observed at:** v0.287.0 (`bc52da38`). Offline, deterministic,
  provider-free: the committed suite
  (`npx vitest run tests/off-session-transport-classification.test.ts`, 18
  cells green at this HEAD) is itself the measurement — cells W2 and 0182-W6
  assert the shipped values this report claims diverge; no scratch probe was
  needed for the mechanism. Source census by `rg 'retryable' src/` plus
  reading every hit.

## Summary

Since bug 0182's fix, every off-session `complete()` call registers
`onResponse` and feeds `classifyProviderResponse` the real captured HTTP
status. The classifier populates `TransportError.retryable` by
transport-error class exactly as `provider-error-mapping.md:13` prescribes
(`transportRetryable`: `null` → `true`, 429/5xx → `true`, else `false`) and
carries the captured status in `http_status`. The fold that builds the
author-visible error then throws both away:
`classifyOffSessionReply` returns
`{ kind: "transport", message, http_status: null, provider, retryable: false }`
for every non-overflow classification
(`production-theta-producer.ts:6013–6021`).

The class this breaks first is the mapping page's own canonical example. At
the theta-1.0 pi-ai pin, a provider failure at an off-session seam resolves as
`stopReason: "error"` with no `onResponse` firing (measured for
`anthropic-messages` by bug 0065; pi-ai's adapters catch every SDK throw —
including DNS failures — and resolve it as an error stop, so `complete()`
never rejects on a provider failure). That is verbatim the "no-HTTP-response
(network-level) class" of `provider-error-mapping.md:7`, which "routes through
`TransportError { retryable: true, http_status: null }` per the retryable rule
below". The author receives `retryable: false`.

The fold's comment and its committed witness both justify the pin by citing
PIC-51 — a rule whose own text scopes it to the prompt-mode driven turn and
whose stated rationale ("the HTTP-status arm … is unreachable from the
`ReadonlySessionManager` read surface") is false at the off-session seams,
where the status is captured and consulted for the overflow gate in the same
function. `:13`'s closing sentence — the unsupported-provider synthesis "is
the one path that pins `retryable: false` independent of HTTP class" — is
contradicted by the fold, which is a second such path on four seams.

Net effect: `TransportError.retryable` is `false` and `http_status` is `null`
at **every** author-visible surface in the runtime (census in Kind element 4),
so the two documented fields are constants. An author writing the retry logic
the field exists for (`if e.retryable { retry }`) silently never retries a
transient network failure, a 429, or a 503; an author reading
`http_status: null` per the schema comment ("null on network-level failure
(no HTTP response)") concludes no HTTP response existed even when the openai
HTTP-200 body-envelope arm captured a 200.

## Reproduction

Offline, provider-free, at `bc52da38`. No scratch file is needed — the shipped
suite pins the behaviour:

```
npx vitest run tests/off-session-transport-classification.test.ts
```

- Cell W2 (`:440–462`): an `anthropic-messages` off-session `@`-query whose
  scripted reply is `stopReason: "error"` with a non-overflow `errorMessage`
  and **no** `onResponse` firing — the `:7` no-HTTP-response class — yields
  the leaf `QueryError`
  `{ kind: "transport", …, http_status: null, retryable: false }`. The spec
  routing for this class is `{ retryable: true, http_status: null }`.
- Cell 0182-W6 (`:979–1010`): the same error-stop with a scripted
  `onResponse({ status: 500 })` yields a byte-identical leaf — the captured
  500 does not reach the author, where `:13` assigns 5xx `retryable: true`
  and the schema's `http_status` exists to carry it. The cell's own comment
  states the classifier's discarded verdict: "`http_status: 500` /
  `retryable: true`".

Both cells are green at this HEAD; they are correct measurements of the
shipped fold and wrong values against `provider-error-mapping.md:7`/`:13`.

## Expected behaviour

- `provider-error-mapping.md:7`: the no-HTTP-response class "routes through
  `TransportError { retryable: true, http_status: null }` per the retryable
  rule below."
- `provider-error-mapping.md:13`: "`true` for network-level failures …, HTTP
  5xx, and HTTP 429; `false` for every other captured status", populated "at
  the point it constructs the variant"; the unsupported-provider case is "the
  one path that pins `retryable: false` independent of HTTP class".
- `queryerror-variants.md:94`/`:102`: `retryable` "populated by
  transport-error class per Pi Integration Contract — Provider error
  mapping"; `http_status: number | null — null on network-level failure (no
  HTTP response)`, i.e. `null` means no HTTP response, so a captured status
  carries the number.
- `conversation-drive.md:16` (PIC-50): the forced respond turn's "provider
  failures are classified through the Provider error mapping table exactly as
  the binder's `complete()` call is" — and the binder's call feeds the
  classifier a captured status or `null` and takes the classifier's verdict.

## Actual behaviour / root cause

`classifyOffSessionReply` (`production-theta-producer.ts:5967`) applies the
classifier with the real input (`:5986–5992`) and then rebuilds the transport
error from literals (`:6013–6021`), keeping only `message`. The pin predates
the input fix: bug 0007 introduced it at 0.18.0 when the seam captured
nothing (publishing `null`/`false` was then the honest output), and bug
0182's fix constraint 2 carried it forward unchanged while making the input
honest. The comment's cited authority (PIC-51) is scoped by its own text to
the on-session prompt-mode probe, whose read surface genuinely has no status;
no spec sentence extends that pin to the `complete()`-based seams, and
`:7`/`:13` prescribe the opposite for them.

## Why it matters

- `retryable` is the variant's only machine-readable retry hint and it is a
  constant `false` on every author-visible path — the documented field cannot
  inform any decision. The classes it exists to mark retryable (network
  blips, 429 rate limits, 5xx) are exactly the ones authors would wrap in
  theta-level retry loops ("Wrapping retries at the theta level via a
  function plus `match` is the expected pattern",
  query-failure-and-repair.md).
- `http_status: null` actively misinforms: the schema comment gives `null` a
  meaning ("no HTTP response") that is false whenever a status was captured
  (openai HTTP-200 body-envelope errors today; any adapter that starts firing
  `onResponse` on 4xx/5xx after a pi-ai bump, silently).
- The divergence is invisible in operation — the `Err` is loud and its
  `message` correct — so the only way to notice is to compare the field
  against the mapping page, which is what this report does.

## Non-goals

- The on-session prompt-mode pins (PIC-50/PIC-51/PIC-51b/PIC-70) are
  spec-stated for a surface with no captured status; nothing here proposes
  changing them.
- The binder path: the binder discards the variant into its internal
  transport-class outcome per determinism-cancellation-failure.md and retries
  by fixed budget, not by `retryable`; that is spec'd and untouched.
- The overflow arms: the classifier's `ContextOverflowError` output is passed
  through verbatim by the fold and is correct since 0182.

## Fix

Not yet decided; two mechanisms, both spec-coherent, need adjudication:

1. **Thread the classifier's verdict through the fold.** Replace the pinned
   literals with `classified.http_status` / `classified.retryable` when
   `classified.kind === "transport"` (message selection unchanged). Makes
   `:7`/`:13` true of the only author-visible surface that can honour them.
   Flips `tests/off-session-transport-classification.test.ts` W2
   (`retryable` false→true), W5 and 0182-W6 (both fields), with this report
   as authority; the on-session cells are untouched. Risk: none identified —
   the binder is not on this surface, and the overflow gate is upstream.
2. **Amend the spec to carve the off-session transport surface out** (extend
   PIC-51's pin to the off-session seams and delete `:13`'s "one path"
   sentence). Honest about shipped behaviour, but it makes the retryable rule
   apply to no author-visible surface at all — the field becomes decorative
   by specification — and `:7`'s routing sentence must also be reworded.

Constraints either way: the overflow-signature and stop-reason arms must not
move; the `message` selection and PIC-51 fallback stay byte-identical; cell
(v)'s openai HTTP-200 body-envelope arm keeps its captured-200 gate.
Mechanism 1 is recommended: it is the reading under which every quoted spec
sentence is already true, and its blast radius is exactly the three committed
cells named above.

## Provenance

Error-classification bug hunt, worktree `C:/UnitySrc/pi-theta-hunt` at
`bc52da38` (v0.287.0). Surfaces read:
`src/binder/provider-error-mapping.ts`,
`src/extension/production-theta-producer.ts` (`classifyOffSessionReply` and
every `retryable` construction site), `src/runtime/prompt-transport-mapping.ts`;
spec `provider-error-mapping.md`, `conversation-drive.md`,
`queryerror-variants.md` in full. Measurement: the committed
`tests/off-session-transport-classification.test.ts` run green at this HEAD
(18/18), whose cells W2/W5/W6 pin the divergent values.
