# Bug 0182 — `classifyOffSessionReply` hard-codes `httpStatus: 200` into the classifier input, so bug 0065's widened anthropic/mistral overflow gate is unreachable at every off-session `complete()` seam: the fold delivers no `null` for the widened arm to admit, and its own fabricated 200 is a captured non-400 status that vetoes the signature match — a real `prompt is too long: 220044 tokens > 200000 maximum` reaches the author as `Err(TransportError)` with both counts dropped where the same bytes at `httpStatus: null` classify `ContextOverflowError { tokens_used: 220044, tokens_limit: 200000 }` — and the same fabrication is the standing counterexample to `provider-error-mapping.md:7`'s "the runtime registers `onResponse` on every `complete()` call", which none of the three off-session call sites does

- **Status:** open. §Fix is constraint-pinned, not settled: the surface is fixed
  (`classifyOffSessionReply` plus the three off-session `complete()` call sites
  that feed it) and the constraints are measured, but *which* mechanism removes
  the fabrication is undecided, and the two live candidates collide from
  opposite sides — capturing the real status closes the `:7` spec tension and
  matches what bug 0011's fix already did to the binder's identical fabricated
  200, but puts the `openai-completions` HTTP-400 overflow arm at risk on an
  adapter property that is UNMEASURED here (bug 0065 residual 2); folding to
  `null` is honest about the no-capture, leaves the spec tension standing, and
  makes `tests/off-session-transport-classification.test.ts` cell (v)'s
  assertion unreachable off-session. The adjudication is made in-run against the
  evidence in §Fix (b) and the measurement §Fix (d) names.
  Residual **1** (with residual **5** folded in) of the bug 0065 fix (0.100.0,
  commit `9c6e8efc`), recorded in that run's report
  (`.pi/tmp/fixes/0065-report.md` §*Residuals / notes*, items 1 and 5) and in
  that document's `## Fix (0.100.0)` §*Residuals* 1 and 5, and not filed there —
  a fix run creates no bug docs.
  Ordering: nothing blocks this report from starting, and it blocks nothing.
  [0065](./0065-anthropic-overflow-status-gate-unsatisfiable.md) is **fixed
  (0.100.0)**; its widened gate at `src/binder/provider-error-mapping.ts:276` is
  the mechanism this report's fix reaches, so a fix rebases on it and must not
  re-litigate it.
- **Sev/Diff estimate:** S2/D3 — S2 because the observable is a *wrong
  discriminator on a loud failure*, not a silent mis-value. The author does get
  an `Err`, it does carry the provider's own formatted text verbatim, and its
  `retryable: false` is the correct disposition for a definite 400 refusal (the
  fold pins that field, §Reproduction (d)) — so the machine-readable retry hint
  is not misleading here, unlike bug 0065's binder-path `retryable: true`. What
  is lost is the `Err(ContextOverflow(e))` `match` arm and the two integers the
  variant exists to carry: measured, the identical bytes yield
  `tokens_used: 220044` / `tokens_limit: 200000` one status value away
  (§Reproduction (b)). S1 was weighed and rejected: nothing is accepted that the
  spec refuses, no value is corrupted, and no success is fabricated — bug 0007
  closed that route at 0.18.0 and §Reproduction (d) confirms the failure still
  surfaces as an `Err`. S3 was weighed and rejected: `ContextOverflowError` is
  not a dead row, it fires off-session today through the `length` stop-reason
  arm (§Reproduction (e)); the input-side signature arm is what cannot.
  Reachability is weighed and it is not narrow — the fold is on four seams
  (§Affected), including the forced respond dispatch that **prompt**-mode typed
  queries also take (`production-theta-producer.ts:4285`), which is the seam a
  grown conversation is most likely to overflow. D3 because §Fix needs in-run
  adjudication between three mechanisms, because the change spans a shared path
  in a 6288-line file with pinned-byte coordination against a landed 0007-lineage
  witness cell, and because settling the openai side needs a live measurement
  that no credential in this environment could take (bug 0065 residual 2).
- **Kind:** defect — a production classification seam fabricates one of the
  classifier's three documented inputs, and the fabricated value is precisely
  the one the gate reads. Four elements, each measured or source-traced at HEAD
  `9c6e8efc` (v0.100.0).
  1. *The fold hard-codes the status.* `classifyOffSessionReply`
     (`src/extension/production-theta-producer.ts:5378`) builds its
     `classifyProviderResponse` input at `:5396–5402` with the literal
     `httpStatus: 200` (`:5398`). Its own doc-comment states the reason
     (`:5373–5376`): "the off-session QUERY path registers no `onResponse` and
     captures no real HTTP status, and 200 is what admits the openai HTTP-200
     stopReason-error overflow gate."
  2. *The fabricated 200 is a captured non-400 status, and vetoing it is the
     shipped contract.* `overflowStatusGateSatisfied`'s anthropic / mistral /
     mistral-conversations arm is
     `input.httpStatus === 400 || input.httpStatus === null`
     (`src/binder/provider-error-mapping.ts:276`, bug 0065 element 1); 200 is
     neither. `provider-error-mapping.md:7` states the rule the arm implements:
     "A **captured** status remains authoritative: a captured non-400 status
     vetoes a match under a row whose gate names HTTP 400". The classifier
     cannot distinguish a fabricated 200 from a captured one, so bug 0065's
     widened arm is unreachable through this seam by construction — not because
     the widening is wrong, but because the fold never delivers the input it
     admits.
  3. *The fold already knows the 200 is a fabrication and strips it from the
     output.* The transport fold's own comment (`:5410–5417`) reads "no HTTP
     status is captured at this seam (hence `http_status: null`, never the
     fabricated 200)", and the returned surface pins `http_status: null` /
     `retryable: false` (`:5422–5431`). So the value is honest on the way out
     and fabricated on the way in, and the gate reads the fabricated one.
  4. *The fabrication is a mirror of a binder posture that no longer exists, and
     it is the standing counterexample to `:7`.* Bug 0007's fix introduced the
     fold with the rationale "mirroring `#classifyBinderAttempt`'s classifier
     input — fixed `httpStatus: 200`" (`git show 87c044ff` — the binder itself
     fabricated `httpStatus: 200` at v0.18.0). Bug 0011's fix removed the
     binder's fabrication at v0.26.0 (`git show b027a524`) and replaced it with
     a real `onResponse` capture, whose comment now reads "when it never fires
     the classifier's HTTP-status input is the network-level `null` class —
     never a fabricated 200" (`production-theta-producer.ts:1002–1005`,
     `:1073`). **The same commit rewrote the fold's doc-comment to delete the
     now-false "mirroring `#classifyBinderAttempt`'s classifier input" clause
     and kept the literal** — the current `:5373–5376` text is that
     replacement. Meanwhile
     `provider-error-mapping.md:7` states "To drive the classifier the runtime
     registers `onResponse` on every `complete()` call"; all three off-session
     `complete()` call sites register none (`:5359–5361` — a two-argument call
     with no options object at all; `:5007–5017` — `{ signal, ...auth }`;
     `:5521–5532` — `{ toolChoice, signal, ...auth }`). That is bug 0065
     residual 5, and it is the same defect seen from the spec side.
- **Related:**
  - **0065** —
    [`0065-anthropic-overflow-status-gate-unsatisfiable.md`](./0065-anthropic-overflow-status-gate-unsatisfiable.md),
    **fixed (0.100.0)**, the finder and the parent. Its element 1 widened the
    anthropic/mistral gate to admit `httpStatus === null`
    (`provider-error-mapping.ts:276`) and its element 2 populated the counts
    (`:239–255`); this report is the part of its §Why-it-matters 1 — "Every
    `@`-query in a theta body against an Anthropic model is on this path" — that
    the landed fix does not reach. **Its §Actual behaviour is wrong about this
    fold** and this filing is the evidence, not an edit to that document: it
    says the classifier's status comes from "`captured?.status ?? null` … and
    the fixed `null` fold in the off-session path", where the off-session fold
    is `200` and has been since v0.18.0 (element 4 above). The error predates
    the 0.100.0 fix — it was already wrong when 0065 was filed at 0.52.0 — and
    is recorded in that run's report and in that document's own §*Residuals* 1.
    **This report does not reopen 0065.** Its `## Fix (0.100.0)` record, its
    12 offline cells and its live re-validation gate stay as they are, and its
    §Fix constraint (ii) — a captured non-400 status must keep vetoing — is a
    constraint *on* this fix (§Fix (c) 1), not a target of it.
  - **0007** —
    [`0007-off-session-error-stop-swallowed-as-ok-empty.md`](./0007-off-session-error-stop-swallowed-as-ok-empty.md),
    **fixed (0.18.0)**, the fold's origin. It established
    `classifyProviderResponse` as the single classification table for the
    off-session path and introduced `classifyOffSessionReply` with the literal
    this report is about. Its witness
    (`tests/off-session-transport-classification.test.ts`, 10 cells green at
    this HEAD) is the lock §Fix (c) 3 binds against: cell (v) (`:503–529`)
    needs the fabricated 200 to reach openai's HTTP-200 body-envelope arm, and
    that dependency is measured, not assumed (§Reproduction (c)).
  - **0011** —
    [`0011-binder-complete-no-forced-tool-free-text-envelope.md`](./0011-binder-complete-no-forced-tool-free-text-envelope.md),
    **fixed (0.26.0)**, commit `b027a524` — the precedent. It removed the
    binder's identical fabricated `httpStatus: 200` and threaded a real
    `onResponse` capture through `#completeBinderReply`
    (`production-theta-producer.ts:1104`, `:1113`). §Fix mechanism (i) is that
    change applied to the seam 0011 did not touch; its shipped shape
    (`:1006–1009`, `:1071–1076`) is the template.
  - **0180** —
    [`0180-invoke-return-nonfinite-number-mode-variance.md`](./0180-invoke-return-nonfinite-number-mode-variance.md),
    **open at the time of writing** (§Status line read at `9c6e8efc`; read its
    own Status rather than this line). The adjacent mode-variance residual: the
    same class of defect — one value getting opposite verdicts depending on
    which production leg carried it — on the typed-`invoke` return path. It
    shares no file with this fix and changes none of its verdicts; the two are
    independent in both directions.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift.
    `src/extension/production-theta-producer.ts` is 6288 lines at this HEAD and
    churns on most fix commits, which is why every position below is named by
    symbol beside its line number.
- **Affected** (every citation re-verified against the tree at HEAD `9c6e8efc`,
  v0.100.0, by `rg` and by reading the file; symbols named beside lines):
  - **The fold.** `classifyOffSessionReply`
    (`src/extension/production-theta-producer.ts:5378`), its rationale
    doc-comment (`:5365–5377`, the fabricated-200 sentence at `:5373–5376`), the
    normal-terminator passthrough (`:5388`, over `OFF_SESSION_NORMAL_STOP_REASONS`
    at `:5335`), the classifier call (`:5396–5402`) with `httpStatus: 200` at
    `:5398`, the `context_overflow` passthrough (`:5407–5409`), the transport
    fold's comment (`:5410–5417`) and its pinned surface (`:5418–5431`,
    `http_status: null` at `:5427`, `retryable: false` at `:5429`). Its return
    type `OffSessionCompletion` (`:5323`).
  - **The four seams that reach it.** (1) `offSessionComplete` (`:5350`), whose
    `complete(model, { messages })` (`:5359–5361`) passes **no options object**
    and so registers neither `onResponse` nor auth, calling the fold at `:5362`;
    reached from `OffSessionQueryModel.#completeFused` (`:5076`, the guarded
    call at `:5083–5087`) and from `offSessionFollowUp` (`:5627`, the call at
    `:5631`). (2) `OffSessionQueryModel.#driveFreePhaseRound` (`:4991`), whose
    `complete(...)` (`:5007–5017`) passes `{ signal, ...auth }` and calls the
    fold at `:5021`. (3) `dispatchForcedRespondTurn` (`:5478`), whose options
    (`:5521–5532`) are `{ toolChoice, signal, ...auth }`, whose `complete(...)`
    is at `:5535` and whose fold call is at `:5600`. (4) the same
    `dispatchForcedRespondTurn` reached from the **live prompt-mode** driver
    (`:4282–4291`, the direct call at `:4285`; the `#dispatchRespondOverWindow`
    arm at `:4283`), whose doc-comment states the design: "the forced respond
    turn dispatches OFF-SESSION through pi-ai `complete()`" (`:4274–4281`).
  - **The hosts that select the off-session driver.** `OffSessionQueryModel`
    (`:4709`), constructed at `:2505–2517` when `deps.userVisible` is false
    (`:2478`, `:2518`); the two in-process `subagent fn` hosts that pass
    `userVisible: false` (`:1797–1805` and `:2345–2354`).
  - **The gate the fabrication defeats.** `overflowStatusGateSatisfied`
    (`src/binder/provider-error-mapping.ts:270`), its doc-comment (`:257–269`,
    "A CAPTURED non-400 status still vetoes the match"), the anthropic/mistral
    arm (`:272–276`), the openai arm (`:277–281`), the bedrock arm (`:282–285`);
    `matchOverflowSignature` (`:296`, the gate call at `:304`);
    `OVERFLOW_SIGNATURES` (`:177–185`, anthropic at `:178–179`, openai at
    `:180`); `TOKEN_EXTRACTING_APIS` (`:192–195`); `extractOverflowTokens`
    (`:239`) with `providerMessageWindow` (`:223`) and `PROVIDER_MESSAGE_MEMBER`
    (`:208`); `transportRetryable` (`:324`); `ProviderClassifierInput` (`:337`)
    and its `httpStatus` doc-comment (`:344–349`: "`null` when `onResponse` did
    not fire before `complete()` resolved (the no-HTTP-response / network-level
    class)"); `classifyProviderResponse` (`:373`, overflow at `:377`, the
    `length` arm at `:385`, the transport arm at `:397–403`).
  - **The contrast path.** `#classifyBinderAttempt` (`:997`), its capture
    comment (`:1002–1005`, "never a fabricated 200"), the capture itself
    (`:1006–1009`), the classifier call (`:1071–1076`) with
    `httpStatus: captured?.status ?? null` at `:1073`, the message selection
    (`:1077–1080`) and the outcome (`:1081`); `#completeBinderReply` (`:1101`),
    which threads `onResponse` into the options (`:1104`, `:1113`).
  - **The path that is deliberately status-blind and is not this defect.** The
    on-session prompt-mode driven turn: `extractPromptModeQueryResult`
    (`:4177–4183`, the PIC-51 comment at `:4171–4176`). It never calls
    `classifyProviderResponse` — grep confirms exactly two production call sites,
    `:1071` and `:5396` — because PIC-51b states "The HTTP-status arm of that
    rule MUST NOT be consulted on this path"
    (`docs/spec_topics/pi-integration-contract/conversation-drive.md:16`).
  - **The committed cells a fix must not silently red.**
    `tests/off-session-transport-classification.test.ts` — 10 cells, green at
    this HEAD; cell (v) (`:503–529`) asserts `context_overflow` for an
    `openai-completions` overflow-signature `errorMessage` under
    `stopReason: "error"`, and its WHY comment (`:504–511`, rewritten by the
    0.100.0 run) states the dependency: `classifyOffSessionReply` "presents a
    fixed `httpStatus: 200`, which a captured non-400 status vetoes — hence
    openai here". `tests/binder-inference-provider-mapping.test.ts` — 58 cells,
    green; the bug-0065 block (`:932–1287`) owns the gate's offline table,
    including the captured-non-400 veto cell (`:1041`) that pins the property
    this fix must preserve.
  - **Spec.** `docs/spec_topics/pi-integration-contract/provider-error-mapping.md:5`
    (§Provider error mapping), `:7` (*Classifier input surface* — the
    `onResponse` / `ProviderResponse.status` derivation, the "registers
    `onResponse` on every `complete()` call" sentence, the no-HTTP-response
    class definition, the condition-scoped carve-out and the captured-status
    veto, all as amended by bug 0065), `:17` (the anthropic row: "HTTP 400, or
    no captured HTTP status"), `:18` (the openai row), `:19` (mistral), `:24`
    (*Overflow token-count extraction*), `:31` (*Stop-reason classification*).
    File is 86 lines with anchors at 3, 7, 9, 11, 22, 31, 38, 54, 65.
    `docs/spec_topics/query/query-failure-and-repair.md:23` (§Detection of
    `ContextOverflowError`), `:25` (QRY-10, which delegates the three-arm
    classification to `provider-error-mapping.md` rather than restating it);
    `docs/spec_topics/pi-integration-contract/conversation-drive.md:16`
    (PIC-50 / PIC-51 / PIC-51b — the prompt-mode driven-turn path, and the
    off-session `complete()` sentence: its "provider failures are classified
    through the Provider error mapping table exactly as the binder's
    `complete()` call is");
    `docs/spec_topics/errors-and-results/queryerror-variants.md:125` (the
    `ContextOverflowError` field set);
    `docs/spec_topics/binder/determinism-cancellation-failure.md:36`
    (*Context-overflow handling* — the binder folds a `ContextOverflowError`
    classification into the transport class, which is why the theta-code
    `@`-query path is the variant's only author-visible surface).
- **Observed at:** v0.100.0 (`9c6e8efc`). Offline, deterministic,
  provider-free: one scratch vitest probe driving the shipped
  `classifyProviderResponse` directly and the shipped production off-session
  driver end to end through a mocked `@earendil-works/pi-ai/compat` `complete`;
  written, run, deleted. Every value in §Reproduction is that run's output
  verbatim over a tree `git status --short` reported clean at `9c6e8efc` both
  when the probe ran and when it was swept. The live provider bytes are not
  re-measured here — they are the string bug 0065's 0.100.0 run captured from a
  real `claude-haiku-4-5` overflow and committed to
  `tests/binder-inference-provider-mapping.test.ts:942`, replayed byte-for-byte.

## Summary

Bug 0065's 0.100.0 fix widened the anthropic / mistral overflow gate to
`input.httpStatus === 400 || input.httpStatus === null`
(`provider-error-mapping.ts:276`), because the `anthropic-messages` adapter
measurably never fires `onResponse` on an HTTP 400 and a real overflow therefore
reaches the classifier with no captured status. It also amended
`provider-error-mapping.md:17` to read "HTTP 400, or no captured HTTP status".

The off-session `@`-query fold never presents that input. `classifyOffSessionReply`
(`production-theta-producer.ts:5378`) writes the literal `httpStatus: 200` into
the classifier input (`:5398`). 200 is not 400 and is not `null`, and
`provider-error-mapping.md:7` — amended by the same 0.100.0 commit — makes a
captured non-400 status authoritative precisely so the openai HTTP-200
body-envelope arm cannot leak into the other rows. The gate therefore does its
job, on a value that was never captured.

Measured on the identical bytes, one field apart:

| classifier input | verdict |
| --- | --- |
| `anthropic-messages`, `httpStatus: 200` (what the fold sends) | `transport` |
| `anthropic-messages`, `httpStatus: null` (what the seam actually has) | `context_overflow`, `220044` / `200000` |
| `anthropic-messages`, `httpStatus: 400` (what the binder sends when `onResponse` fires) | `context_overflow`, `220044` / `200000` |

Driven end to end through the production off-session driver, a `subagent fn`
body's `@`-query against an anthropic model binds

```json
{"kind":"transport","message":"400 {…prompt is too long: 220044 tokens > 200000 maximum…}","http_status":null,"provider":"anthropic-messages","retryable":false}
```

The failure is loud and carries the provider's text; the variant is wrong and
both counts are gone. An author who wrote
`match r { Err(ContextOverflow(e)) => … }` takes the transport arm.

The fold knows the 200 is a fabrication. Its own comment fourteen lines below
the literal says so — "no HTTP status is captured at this seam (hence
`http_status: null`, never the fabricated 200)" (`:5410–5417`) — and the
returned surface pins `http_status: null` (`:5427`). The value is honest on the
way out and fabricated on the way in, and the gate reads the fabricated one.

Two facts fix the shape of the remedy. First, the fabrication is load-bearing
for exactly one row: the `openai-completions` gate is
`400 || (200 && stopReason "error")` (`:277–281`), so the fabricated 200 is what
makes `tests/off-session-transport-classification.test.ts` cell (v) pass —
measured, that cell's input classifies `transport` at `httpStatus: null`
(§Reproduction (c)). Second, this same seam is the standing counterexample to
`provider-error-mapping.md:7`'s "To drive the classifier the runtime registers
`onResponse` on every `complete()` call": all three off-session `complete()`
call sites register none, and one of them passes no options object at all
(`:5359–5361`). Bug 0011's fix already made exactly this correction to the
binder at v0.26.0 — its comment at `:1002–1005` now reads "never a fabricated
200" — and the off-session fold, whose original rationale was that it was
*mirroring* the binder, was not carried along.

## Reproduction

Offline, deterministic, provider-free, at HEAD `9c6e8efc`. One scratch vitest
probe: parts (a)–(c) drive the shipped `classifyProviderResponse` directly;
parts (d)–(e) drive the shipped production off-session driver
(`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`) over
a prompt-mode theta whose `subagent fn` body issues the `@`-query, with only
`@earendil-works/pi-ai/compat`'s `complete` mocked. Written, run, deleted.

The `errorMessage` byte string is the live anthropic overflow bug 0065's
0.100.0 run captured and committed at
`tests/binder-inference-provider-mapping.test.ts:942`:

```
400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 220044 tokens > 200000 maximum"},"request_id":"req_011Ce67AeKSksfCvdLP3Q6Ha"}
```

### (a) The fold's exact input shape

`classifyProviderResponse({ api: "anthropic-messages", httpStatus: 200,
stopReason: "error", errorMessage: <the string above>, rawResponse: null })` —
the same five members `classifyOffSessionReply` constructs at `:5396–5402`:

```
[0182 p1] FOLD INPUT (httpStatus 200): {"kind":"transport","message":"400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"prompt is too long: 220044 tokens > 200000 maximum\"},\"request_id\":\"req_011Ce67AeKSksfCvdLP3Q6Ha\"}","http_status":200,"provider":"anthropic-messages","retryable":false}
```

### (b) The two contrasts, same bytes, one field different

```
[0182 p2] NULL STATUS: {"kind":"context_overflow","message":"400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"prompt is too long: 220044 tokens > 200000 maximum\"},\"request_id\":\"req_011Ce67AeKSksfCvdLP3Q6Ha\"}","tokens_used":220044,"tokens_limit":200000,"raw_response":null}
[0182 p2b] CAPTURED 400: {"kind":"context_overflow","message":"400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"prompt is too long: 220044 tokens > 200000 maximum\"},\"request_id\":\"req_011Ce67AeKSksfCvdLP3Q6Ha\"}","tokens_used":220044,"tokens_limit":200000,"raw_response":null}
```

`null` is the class the off-session seam is in — no `onResponse` is registered,
so none can fire. `400` is what the binder path receives if the adapter ever
fires on an error response. Both reach `context_overflow` with populated counts;
only the fabricated 200 does not.

### (c) The fabrication is load-bearing for openai, and for openai only

```
[0182 p3] OPENAI @200 : {"kind":"context_overflow","message":"This model's maximum context length is 128000 tokens. However, your messages resulted in 130000 tokens.","tokens_used":130000,"tokens_limit":128000,"raw_response":null}
[0182 p3] OPENAI @null: {"kind":"transport","message":"This model's maximum context length is 128000 tokens. However, your messages resulted in 130000 tokens.","http_status":null,"provider":"openai-completions","retryable":true}
[0182 p3b] mistral @200: transport
[0182 p3b] mistral @null: context_overflow
[0182 p3b] mistral-conversations @200: transport
[0182 p3b] mistral-conversations @null: context_overflow
[0182 p3b] amazon-bedrock @200: context_overflow
[0182 p3b] amazon-bedrock @null: context_overflow
[0182 p3b] bedrock-converse-stream @200: context_overflow
[0182 p3b] bedrock-converse-stream @null: context_overflow
```

The openai `errorMessage` is cell (v)'s own `OPENAI_OVERFLOW_MESSAGE`
(`tests/off-session-transport-classification.test.ts:127–129`); the mistral and
bedrock rows use each row's own signature wording. This is the complete
blast radius of a 200→`null` flip at the fold, per row: anthropic and mistral
change from `transport` to `context_overflow`; openai changes from
`context_overflow` to `transport` — which is cell (v); bedrock is unaffected
(its gate returns `true` at any status, `provider-error-mapping.ts:282–285`);
every non-overflow input is unaffected because the fold overwrites
`http_status` and `retryable` with fixed values regardless (`:5422–5431`).

### (d) End to end through the production off-session driver

A `subagent fn` body issuing `let v = @`Echo ${a}`?` against
`{ api: "anthropic-messages" }`, one scripted reply with
`stopReason: "error"`, empty content and the live overflow `errorMessage`:

```
[0182 p4] OUTCOME: success CALLS: 1
[0182 p4] AUTHOR-VISIBLE LEAF: {"kind":"transport","message":"400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"prompt is too long: 220044 tokens > 200000 maximum\"},\"request_id\":\"req_011Ce67AeKSksfCvdLP3Q6Ha\"}","http_status":null,"provider":"anthropic-messages","retryable":false}
```

The leaf is the `QueryError` inside the FN-6 `invoke_callee` wrapper the `?` in
the fn body produces. `retryable: false` and `http_status: null` are the fold's
pinned fields (`:5427`, `:5429`), not the classifier's — the classifier said
`http_status: 200` (part (a)). One provider call; nothing is retried.

### (e) Control — `ContextOverflowError` is reachable off-session, through the other arm

The same drive with `stopReason: "length"` and partial text:

```
[0182 p5] LENGTH-STOP LEAF: {"kind":"context_overflow","message":"","tokens_used":null,"tokens_limit":null,"raw_response":"partial"}
```

The variant is not dead at this seam. `classifyProviderResponse`'s stop-reason
arm (`provider-error-mapping.ts:385–393`) reads no status, so it is unaffected
by the fabrication, and `classifyOffSessionReply` passes its result through
verbatim (`:5407–5409`). What the fabrication removes is the **input-side**
signature arm — the case the four per-provider signatures exist for.

### (f) The `onResponse` census — traced in source, not driven

Three off-session `complete()` call sites, none registering `onResponse`:

| call site | third argument |
| --- | --- |
| `offSessionComplete` (`:5359–5361`) | **absent** — a two-argument call |
| `#driveFreePhaseRound` (`:5007–5017`) | `{ signal, ...auth }` |
| `dispatchForcedRespondTurn` (`:5535`, options at `:5521–5532`) | `{ toolChoice, signal, ...auth }` |

`complete`'s third parameter is where `onResponse` lives
(`node_modules/@earendil-works/pi-ai/dist/compat.d.ts:64`,
`dist/types.d.ts:76`). The binder's call passes it
(`production-theta-producer.ts:1104`, `:1113`). Statically corroborating why a
real capture would yield `null` on an anthropic 400:
`node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js:371` invokes
`onResponse` after `client.messages.create(...).asResponse()`, which throws on a
non-2xx — the same measurement bug 0065's 0.100.0 run took live
(`ONRESPONSE FIRINGS: []`). The `openai-completions` adapter has the identical
shape: `.withResponse()` at `dist/api/openai-completions.js:135–137`, then
`onResponse` at `:138`. pi-ai is `0.80.10` at this HEAD.

## Expected behaviour

- **`docs/spec_topics/pi-integration-contract/provider-error-mapping.md:17`**
  (as amended by bug 0065) — the `anthropic-messages` row: "HTTP 400, or no
  captured HTTP status per the [classifier input surface](#classifier-input-surface)
  carve-out (measured, not assumed, for this adapter), with `errorMessage`
  matching `/(prompt is too long|exceeds .* context window|maximum context
  length)/i`; `tokens_used` and `tokens_limit` extracted from `errorMessage` per
  *Overflow token-count extraction* below." The response in §Reproduction (d) is
  an `anthropic-messages` response with no captured HTTP status whose
  `errorMessage` matches that regex. Its expected verdict is
  `ContextOverflowError` with `tokens_used: 220044` / `tokens_limit: 200000`.
- **`:7`** (as amended by bug 0065), two sentences, both in force here. The
  carve-out: "any provider whose response reaches the classifier with no
  captured HTTP status — resolving with `stopReason: "error"` and no
  `onResponse` invocation — is classified as network-level by the rule above
  **unless** its `AssistantMessage.errorMessage` matches that provider's
  overflow signature … this carve-out governs the `anthropic-messages`,
  `mistral` and `amazon-bedrock` rows". And the veto: "A **captured** status
  remains authoritative: a captured non-400 status vetoes a match under a row
  whose gate names HTTP 400". The off-session response satisfies the first
  sentence's antecedent exactly — no `onResponse` invocation, `stopReason:
  "error"`, matching wording — and is denied by the second, on a status no
  invocation produced.
- **`:7`, the registration sentence** — "To drive the classifier the runtime
  registers `onResponse` on every `complete()` call (see the binder's options
  enumeration in [Binder inference call](./binder-inference.md#binder-inference-call))
  and joins the captured `{ status, headers }` with the resolved
  `AssistantMessage`, keyed per `complete()` invocation." Three off-session
  `complete()` calls register none (§Reproduction (f)). This is a MUST-shaped
  statement of what the runtime does, and it is false of this seam.
- **`ProviderClassifierInput.httpStatus`'s own doc-comment**
  (`src/binder/provider-error-mapping.ts:344–349`) — "`ProviderResponse.status`
  captured through `StreamOptions.onResponse`, or `null` when `onResponse` did
  not fire before `complete()` resolved (the no-HTTP-response / network-level
  class)". The field's declared meaning admits two values for this seam and 200
  is neither.
- **`docs/spec_topics/query/query-failure-and-repair.md:25` (QRY-10)** — "The
  runtime maps recognised provider context overflow error responses to this
  variant — concretely, payloads matching one of the per-provider signatures
  listed in [Pi Integration Contract — Provider error mapping]…". The three-arm
  classification is delegated, so QRY-10's obligation here is exactly the row
  above: a recognised payload maps to `ContextOverflowError`. The same section's
  "`tokens_used` and `tokens_limit` are populated when the provider supplies
  them in the error payload, and `null` otherwise" is what makes the dropped
  counts a defect and not the documented `null` condition — the provider
  supplied both, in the string the classifier received.
- **`docs/spec_topics/pi-integration-contract/conversation-drive.md:16`
  (PIC-50)** — the off-session `complete()` path's stated contract: its
  "provider failures are classified through the [Provider error mapping]
  table **exactly as the binder's `complete()` call is**". The binder's call
  supplies a captured status or `null`; this one supplies a literal.
- **`docs/spec_topics/binder/determinism-cancellation-failure.md:36`** — "A
  classifier output of `ContextOverflowError` is treated as transport-class for
  retry purposes" on the binder path. That is why the theta-code `@`-query
  surface is where the variant is observable at all, and why this seam carries
  the whole of the author-visible expectation.

## Actual behaviour / root cause

**1. The fold supplies a constant where the classifier's contract names a
measurement.** `classifyOffSessionReply` (`:5378`) reads two fields off the
resolved reply — `stopReason` (`:5383`) and `errorMessage` (`:5394`) — and
supplies the third, `httpStatus`, from a literal (`:5398`). The classifier has
no way to tell a fabricated status from a captured one:
`overflowStatusGateSatisfied` (`:270`) switches on `input.api` and compares
`input.httpStatus` against numbers. Nothing in `ProviderClassifierInput` carries
provenance.

**2. The gate is correct and the input is wrong.** Bug 0065's element 1 made the
anthropic arm `400 || null` (`:276`) and its §Fix constraint (ii) required that a
captured non-400 status keep vetoing, so that the openai HTTP-200 body-envelope
arm does not leak into rows whose gate names 400. `provider-error-mapping.md:7`
states that rule in prose and
`tests/binder-inference-provider-mapping.test.ts:1041` pins it. The fabricated
200 walks into that veto. Widening the anthropic arm to admit 200 would break
the property the veto exists for, so the remedy is on the input side, not the
gate side.

**3. The fabrication's stated reason is real, and it is about a different
provider.** The doc-comment (`:5373–5376`) gives two clauses: "the off-session
QUERY path registers no `onResponse` and captures no real HTTP status" — true,
and an argument for `null` — "and 200 is what admits the openai HTTP-200
stopReason-error overflow gate" — also true, and the reason `null` was not
chosen. `openai-completions`'s arm is
`400 || (200 && stopReason === "error")` (`:277–281`); at `null` it refuses
(§Reproduction (c)). So the literal is a per-provider accommodation written into
a provider-independent input, and it has been paying for openai's row at
anthropic's and mistral's expense since v0.18.0 — silently until 0.100.0, when
the anthropic and mistral rows acquired a `null` arm the seam cannot reach.

**4. The binder took the other route four minor versions later and the fold was
not carried along.** At v0.18.0 both paths fabricated 200, and the fold's
rationale said so: "mirroring `#classifyBinderAttempt`'s classifier input —
fixed `httpStatus: 200`" (`git show 87c044ff`). Bug 0011's fix (v0.26.0,
`b027a524`) removed the binder's literal and threaded a real capture; the
comment that replaced it is explicit about the alternative it rejected — "when
it never fires the classifier's HTTP-status input is the network-level `null`
class — never a fabricated 200" (`:1002–1005`). In the same diff the fold's own
doc-comment was rewritten: the two deleted lines read "mirroring
`#classifyBinderAttempt`'s classifier input — fixed `httpStatus: 200`" and the
replacement is the text at `:5373–5376` today. The justification was replaced;
the literal was not.

**5. The seam already treats the 200 as untrustworthy in the only place it can
be seen.** The transport fold's comment (`:5410–5417`) and its returned surface
(`:5422–5431`) refuse to publish it: `http_status: null`, "never the fabricated
200". So the runtime holds both positions at once — the value is a lie the
author must not see, and a truth the gate must act on.

**6. The reach is wider than the `subagent fn` body.** The fold is on four
seams (§Affected), and the fourth is the **forced respond dispatch** that
prompt-mode typed queries take: `LivePromptQueryModel` drives its free phase
on-session, then dispatches the respond turn off-session through `complete()`
(`:4274–4291`). That turn carries the whole accumulated query window plus the
QRY-15 template, which is the shape most likely to exceed a context window in
the first place; its overflow classifies `transport`.

**7. The spec sentence and the code disagree, and neither is stale.**
`provider-error-mapping.md:7` says the runtime registers `onResponse` on every
`complete()` call. Three off-session call sites do not (§Reproduction (f)); one
passes no options object at all. The sentence was written for the binder, whose
options enumeration it cross-references, and generalised. Bug 0065's review
round 1 found this and its fix left it, correctly, as out of scope. It is the
same defect as elements 1–6 read from the other side: the fold is where "no
`onResponse` registered" is turned into "status 200" instead of "no captured
status".

## Why it matters

- **`ContextOverflowError`'s only author-visible route is the one that does not
  work for its main provider.** The binder folds the variant into the transport
  class for retry purposes
  (`determinism-cancellation-failure.md:36`, implemented at `:1071–1081` where
  every classification returns `outcome.kind: "transport"`), so bug 0065's
  element 1 changed nothing an author can `match` on. The theta-code `@`-query
  path is where the variant is observable, and that path is this fold. Bug
  0065's §Why-it-matters 1 — "Every `@`-query in a theta body against an
  Anthropic model is on this path" — is discharged only for the seam whose
  output authors cannot see.
- **The counts are the point of the variant and they are dropped.**
  `queryerror-variants.md:125` gives `ContextOverflowError` two numeric fields
  and QRY-10 says they are populated when the provider supplies them. The
  provider supplied `220044` and `200000`, in the string the classifier
  received, and the author gets neither (§Reproduction (a) vs (b)).
- **The wrong arm is taken silently.** No diagnostic is emitted, no registered
  code fires, and the `Err` that arrives is well-formed and informative — an
  author testing `Err(Transport(e))` handling sees exactly what they expect. The
  only way to notice is to compare against the binder path's verdict on the same
  bytes.
- **Reach includes prompt mode, not only `subagent fn`.** The forced respond
  dispatch is off-session for both drivers (`:4285`), so a typed `@`-query in a
  prompt-mode theta reaches the fold on the turn whose conversation is largest.
- **The same fabrication is a false sentence in the spec.**
  `provider-error-mapping.md:7`'s registration claim is a MUST-shaped statement
  of runtime behaviour that three call sites contradict. A reader deriving the
  classifier's input surface from `:7` derives the wrong thing for every
  off-session query.
- **The remedy has a live precedent and an unpaid measurement.** Bug 0011
  already performed this correction on the binder; what stops a mechanical
  repeat is that openai's row has been riding the fabrication, and whether it
  survives a real capture depends on an adapter property bug 0065 residual 2
  recorded as UNMEASURED. Deciding it once here is cheaper than discovering it
  from a misclassified production overflow.

## Fix

Not settled. The surface is fixed and the constraints are measured; the
mechanism is chosen in-run from (b), against the measurement (d) names.

### (a) The surface

- `classifyOffSessionReply` (`src/extension/production-theta-producer.ts:5378`)
  — the `httpStatus` member of its `classifyProviderResponse` input (`:5398`)
  and the doc-comment that states its reason (`:5373–5376`).
- Under mechanism (i) only, the three off-session `complete()` call sites that
  feed it and the parameter that carries the captured status to the fold:
  `offSessionComplete` (`:5350`, the call at `:5359–5361`, the fold call at
  `:5362`), `#driveFreePhaseRound` (`:4991`, the call at `:5007–5017`, the fold
  call at `:5021`), `dispatchForcedRespondTurn` (`:5478`, the options at
  `:5521–5532`, the call at `:5535`, the fold call at `:5600`).
- Under mechanism (i), `provider-error-mapping.md:7`'s registration sentence, in
  the same commit — it becomes true rather than needing a carve-out.

Nothing in `src/binder/provider-error-mapping.ts` is edited. The gate, the
signatures, the token extraction and the transport arm are bug 0065's and stay
byte-identical.

### (b) The undecided part: what replaces the literal

1. **Capture the real status.** Register an `onResponse` at each of the three
   call sites, thread the captured `ProviderResponse | undefined` into
   `classifyOffSessionReply`, and pass `captured?.status ?? null` — the exact
   shape `#classifyBinderAttempt` already ships (`:1006–1009`, `:1073`).
   *For it:* it is the in-tree precedent (bug 0011 made this change to the
   binder at v0.26.0 and its comment names the fabricated 200 as the rejected
   alternative); it closes the `:7` spec tension instead of leaving it; it
   removes the fabrication rather than replacing it with a different one; and it
   keeps cell (v)'s **assertion** true — an openai HTTP-200 body-envelope
   overflow really is delivered on a 200 response, so a real capture yields 200
   and the arm still fires. Cell (v)'s **fixture** must then script the
   `onResponse` firing, which is a harness change, not an assertion change.
   *Against it:* an `openai-completions` HTTP-**400** overflow currently reaches
   `context_overflow` off-session only because the fabricated 200 satisfies the
   `(200 && "error")` half of its gate; with a real capture it would yield
   `null` — if that adapter withholds `onResponse` on a 400 the way the
   anthropic one does — and openai's gate refuses `null` (§Reproduction (c)),
   so that case would regress to `transport`. The static read says it does
   withhold (`dist/api/openai-completions.js:135–138`, §Reproduction (f)); the
   live behaviour is UNMEASURED here (bug 0065 residual 2 — no
   `openai-completions` credential resolves for an out-of-band `complete()` in
   this environment). This is the risk (d) exists to retire.
2. **Fold to `null`.** Replace the literal with `null`, the honest value for a
   seam that captures nothing, and state it in the doc-comment.
   *For it:* one-line change; anthropic and mistral immediately reach
   `context_overflow` with populated counts (§Reproduction (b)); no new
   parameter, no call-site threading, no new failure mode; the fold's output
   surface does not move at all, because it overwrites `http_status` and
   `retryable` with fixed values regardless (`:5422–5431`), so the blast radius
   is exactly the four rows in §Reproduction (c).
   *Against it:* it flips cell (v) — an `openai-completions` overflow-signature
   `errorMessage` under `stopReason: "error"` classifies `transport`, so the
   openai HTTP-200 body-envelope arm becomes unreachable at every off-session
   seam and the cell's assertion must be inverted or deleted. That cell is a
   landed 0007-lineage lock whose WHY comment the 0.100.0 run rewrote; flipping
   it needs this report as the authority, stated in the fix record. It also
   leaves `:7`'s registration sentence false, so bug 0065 residual 5 survives
   the fix and must be re-filed.
3. **Provider-conditional fold** — send `200` for `openai-completions` and
   `null` otherwise. *Rejected unless (1) and (2) both fail on evidence.* It
   duplicates the per-provider dispatch `overflowStatusGateSatisfied` already
   owns (`:270–289`), one layer up and out of sync by construction; it replaces
   one fabrication with two, so the classifier's `httpStatus` input still
   carries no meaning; and it leaves `:7`'s registration sentence false. A fix
   choosing it states why (1) and (2) were unavailable.

### (c) Constraints

1. **Bug 0065's captured-non-400 veto survives, byte-for-byte.**
   `overflowStatusGateSatisfied` (`provider-error-mapping.ts:270–289`) is not
   edited, and `tests/binder-inference-provider-mapping.test.ts:1041` — HTTP 200
   plus overflow wording at anthropic stays `transport` — stays green with no
   assertion touched. The remedy is on the classifier's input, not its table.
2. **No change to any non-overflow off-session outcome.** The fold's returned
   surface (`:5422–5431`) — `message` selection, `http_status: null`,
   `retryable: false`, the PIC-51 fallback — is unchanged for every input, and
   the fix asserts this rather than assuming it. §Reproduction (c) is the
   enumeration of what may move: the anthropic, mistral, mistral-conversations
   and openai overflow-signature rows, and nothing else.
3. **`tests/off-session-transport-classification.test.ts` is handled
   explicitly, never incidentally.** Its 10 cells are green at this HEAD. Under
   mechanism (i) cell (v)'s fixture gains a scripted `onResponse` firing and its
   assertion is untouched; under mechanism (ii) its assertion inverts and the
   fix record cites this report as the authority for moving a landed lock. Cells
   (i)–(iv-b), (vi), (vii) and the two green controls stay byte-identical under
   both.
4. **The stop-reason arm stays reachable.** §Reproduction (e)'s `length`
   terminator must still yield `context_overflow` with null counts and
   `raw_response` carrying the partial text; it reads no status, so no mechanism
   should move it, and a witness cell pins that.
5. **Scope.** `classifyOffSessionReply` and, under mechanism (i), the three
   call sites that feed it. The fix does not touch
   `src/binder/provider-error-mapping.ts`, does not touch
   `#classifyBinderAttempt`, does not touch the on-session prompt-mode probe
   (`:4177–4183`), and adds no registered code.
6. **Spec edits are same-commit and mechanism-determined.** Mechanism (i) makes
   `provider-error-mapping.md:7`'s registration sentence true and needs no
   carve-out. Mechanism (ii) or (iii) leaves it false and must either amend it
   to name the off-session exception or record bug 0065 residual 5 as
   surviving, in a re-filed report. `:17`, `:18`, `:19` and `:24` are not
   amended by any mechanism — the rows are right; the input was wrong.
7. **Bug 0065 is not reopened.** Its `## Fix (0.100.0)` record, its 12 offline
   cells, its live re-validation gate and its spec amendments stay as they are.
   Its §Actual behaviour's wrong "the fixed `null` fold in the off-session path"
   is corrected by this report's existence and evidence, not by editing that
   document.

### (d) The measurement that settles (b)

Whether the `openai-completions` adapter invokes `onResponse` before resolving
an HTTP-400 error response. If it does, mechanism (i) has no openai cost at all
and (b)(1) is unconditional. If it does not, mechanism (i) trades an anthropic
and mistral gain for an openai-400 loss, and the fix must say so and choose.
The static read (`dist/api/openai-completions.js:135–138` — `.withResponse()`
then `onResponse`, the same order as the anthropic adapter) predicts it does
not, but that is DERIVED, NOT MEASURED. The measurement is a direct pi-ai
`complete()` against an `openai-completions` model with a deliberate 400,
recording `ONRESPONSE FIRINGS` — the shape bug 0065's 0.100.0 run used for
anthropic and could not run for openai (residual 2: unity gateway →
`401: {"message":"LiteLLM Virtual Key expected…"}`; openrouter →
`401: {"message":"Missing Authentication header","code":401}`). A run that also
cannot resolve an `openai-completions` credential records that fact and chooses
on the static read, marking the openai half DERIVED.

### (e) Witness

Offline, provider-free, additive. Required cells:

- **In `tests/off-session-transport-classification.test.ts`** (the fold's own
  home): the live anthropic overflow `errorMessage` under `stopReason: "error"`
  at an `anthropic-messages` model, driven end to end, asserting the leaf
  `QueryError` is `context_overflow` with `tokens_used: 220044` /
  `tokens_limit: 200000`. This is §Reproduction (d) inverted and it reds at
  HEAD. A mistral twin, marked UNMEASURED for the same reason bug 0065's parity
  cells are.
- **The non-perturbation control**: cells (i), (ii), (iv), (iv-b) render
  byte-identical leaves before and after (constraint 2), and cell (e)'s
  `length` terminator is unchanged (constraint 4).
- **The seam census**: the same overflow reply through the free-phase dispatch
  (`:5021`) and through the forced respond dispatch (`:5600`), so the fix is
  proven at every seam rather than only at `offSessionComplete`.
- **Under mechanism (i) only**: a cell whose mocked `complete` invokes
  `options.onResponse({ status: 200, headers: {} })` and one that invokes it
  not at all, asserting the two verdicts differ — otherwise the threading is
  untested and could be dead code.
- Each new assertion proved both directions once: red with the literal
  restored, green with the mechanism in place.

### (f) Ordering

Nothing blocks this report and it blocks nothing.
[0065](./0065-anthropic-overflow-status-gate-unsatisfiable.md) is **fixed
(0.100.0)**; its widened gate is the mechanism this fix reaches and constraint 1
pins it byte-identical, so a fix rebases on it and does not wait for anything.
[0180](./0180-invoke-return-nonfinite-number-mode-variance.md) shares no file
and changes no verdict here.

## Non-goals

- **Whether pi-ai should fire `onResponse` on error responses.** Upstream, and
  bug 0065's §Non-goals already pins it. theta's classifier input must be
  correct against the adapter as it behaves; if pi-ai later fires on a 400, a
  real capture becomes 400 and every mechanism in §Fix (b) that captures still
  reaches the row.
- **The binder path.** Bug 0065 element 1 landed there and
  `#classifyBinderAttempt` already supplies a real captured status
  (`:1073`). One adjacent observation is recorded here and claimed by nothing:
  the binder discards the variant — every classification returns
  `outcome.kind: "transport"` (`:1081`) per
  `determinism-cancellation-failure.md:36` — and its message selection is
  gated on `classified.kind === "transport"` (`:1077–1080`), so a classification
  that now returns `context_overflow` takes the fixed `"provider transport
  failure"` fallback instead of the provider's text in the BND-3 note template
  `theta /<name>: argument binder unavailable (<provider>: <message>)`
  (`determinism-cancellation-failure.md:50`). Traced in source at this HEAD, not
  driven; it concerns the binder's note and not this fold, and this report
  neither owns nor fixes it.
- **Bug 0065 element 2.** `extractOverflowTokens` and its provider-message
  window (`provider-error-mapping.ts:208`, `:223`, `:239`) are correct and are
  what produce `220044` / `200000` in §Reproduction (b). Untouched by
  constraint 5.
- **The `openai-completions` HTTP-200 body-envelope arm's own gate.**
  `overflowStatusGateSatisfied`'s openai case (`:277–281`) is not edited. What
  §Fix decides is which `httpStatus` value the off-session seam presents to it,
  not what it admits.
- **The on-session prompt-mode driven turn.** `extractPromptModeQueryResult`
  (`:4177–4183`) never consults the classifier, by design: PIC-51b states "The
  HTTP-status arm of that rule MUST NOT be consulted on this path — it is
  unreachable from the `ReadonlySessionManager` read surface the probe uses"
  (`conversation-drive.md:16`). An anthropic input-side overflow on that path
  classifies `transport` for a different and specified reason. Whether PIC-51b
  should change is not this report's question.
- **Mistral measurement.** Bug 0065 residual 3 records that no `mistral` api
  provider exists in the configured install. The mistral rows move with
  anthropic here by shared-gate parity only (§Reproduction (c)), and any witness
  cell says so and claims no measurement.
- **The fold's transport surface.** `http_status: null`, `retryable: false` and
  the PIC-51 fallback message (`:5418–5431`) are pinned by bug 0007 and
  `conversation-drive.md:16`; constraint 2 keeps them byte-identical.

## Provenance

- **Parent.** `.pi/tmp/fixes/0065-report.md` §*Residuals / notes* item 1 ("THE
  BUG DOCUMENT IS WRONG about the off-session fold — a sibling must know") and
  item 5 (the `:7` registration tension), plus
  `docs/bugs/0065-anthropic-overflow-status-gate-unsatisfiable.md`
  `## Fix (0.100.0)` §*Residuals* 1 and 5 and §*Self-authorizations* 2 ("Not
  self-authorized — stopped and recorded instead"). Both items re-verified here
  rather than taken on report; the one divergence is recorded below.
- **Divergence from the parent's wording, on measurement.** The 0.100.0 report
  and this task's framing state that the off-session overflow "still classifies
  `TransportError { retryable: true }`". Measured at HEAD, the surfaced
  `retryable` is **`false`**: the classifier's raw verdict at `httpStatus: 200`
  is `retryable: false` (`transportRetryable(200)`,
  `provider-error-mapping.ts:324–328`, §Reproduction (a)) and the fold then
  overwrites the field with a fixed `false` regardless (`:5429`,
  §Reproduction (d)). The variant is wrong; the retry hint is not. Everything
  else in residual 1 — the literal, its line, its 0007 lineage, the veto
  mechanism and cell (v)'s dependency — verified exactly as recorded.
- **Implementation evidence at `9c6e8efc`**, all re-read at HEAD:
  `src/extension/production-theta-producer.ts:5323` (`OffSessionCompletion`),
  `:5335` (`OFF_SESSION_NORMAL_STOP_REASONS`), `:5350`–`:5363`
  (`offSessionComplete`, the optionless `complete()` at `:5359–5361`),
  `:5365–5377` (the fold's doc-comment), `:5378–5432`
  (`classifyOffSessionReply`: the literal at `:5398`, the overflow passthrough
  at `:5407–5409`, the "never the fabricated 200" comment at `:5410–5417`, the
  pinned surface at `:5422–5431`), `:4991–5039` (`#driveFreePhaseRound`),
  `:5478–5617` (`dispatchForcedRespondTurn`), `:5627–5635`
  (`offSessionFollowUp`), `:5076–5088` (`#completeFused`), `:4709`
  (`OffSessionQueryModel`), `:4274–4291` (the live driver's off-session forced
  respond dispatch), `:2478–2518` (driver selection on `deps.userVisible`),
  `:1797–1805` and `:2345–2354` (the two `userVisible: false` hosts),
  `:997–1087` (`#classifyBinderAttempt`), `:1101–1126`
  (`#completeBinderReply`), `:4171–4185` (the on-session prompt probe);
  `src/binder/provider-error-mapping.ts:177–185`, `:192–195`, `:208`, `:223`,
  `:239–255`, `:257–289`, `:296–316`, `:324–328`, `:337–359`, `:373–404`.
- **History**, each verified by `git show` at this HEAD:
  `git log -S 'httpStatus: 200,' -- src/extension/production-theta-producer.ts`
  returns three commits — `b027a524` (bug 0011, v0.26.0: **removed** the
  binder's literal), `87c044ff` (bug 0007, v0.18.0: **added** the fold's, inside
  `classifyOffSessionReply`, with the "mirroring `#classifyBinderAttempt`"
  rationale) and `2bc69157` (the Loom→Theta rename, which created the file at
  its current path carrying the binder's pre-existing literal). `b027a524` also
  added the binder's `onResponse` capture and `captured?.status ?? null`, and
  rewrote the fold's doc-comment to its current `:5373–5376` wording. The fold's
  **body** — the 55 lines from `function classifyOffSessionReply(` to its
  closing brace — is byte-identical to `87c044ff`'s (`diff` empty).
- **Test evidence at `9c6e8efc`:**
  `tests/off-session-transport-classification.test.ts` (10 cells green; cell (v)
  at `:503–529`, its WHY comment at `:504–511`, `OPENAI_OVERFLOW_MESSAGE` at
  `:127–129`); `tests/binder-inference-provider-mapping.test.ts` (58 cells
  green; the bug-0065 block at `:932–1287`, the live byte string at `:942`, the
  captured-non-400 veto cell at `:1041`);
  `tests/live/provider-error-revalidation-gate.test.ts` (bug 0065's live gate —
  its cell (c) measures the binder-shaped input and is unaffected by this
  report).
- **Host evidence:** `@earendil-works/pi-ai` `0.80.10` —
  `dist/compat.d.ts:64` (`complete`'s optional third `ProviderStreamOptions`),
  `dist/types.d.ts:76` (`onResponse`), `dist/api/anthropic-messages.js:371` and
  `dist/api/openai-completions.js:135–138` (both invoke `onResponse` only after
  the SDK call resolves, i.e. only on a 2xx).
- **Spec:** `docs/spec_topics/pi-integration-contract/provider-error-mapping.md`
  `:5`, `:7`, `:17`, `:18`, `:19`, `:24`, `:31` (86 lines, anchors at 3, 7, 9,
  11, 22, 31, 38, 54, 65);
  `docs/spec_topics/pi-integration-contract/conversation-drive.md:16`
  (PIC-50 / PIC-51 / PIC-51b);
  `docs/spec_topics/query/query-failure-and-repair.md:23`, `:25` (QRY-10);
  `docs/spec_topics/errors-and-results/queryerror-variants.md:125`;
  `docs/spec_topics/binder/determinism-cancellation-failure.md:36`, `:50`.
- **Probe:** one offline scratch vitest file at HEAD `9c6e8efc`, driving the
  shipped `classifyProviderResponse` and the shipped production off-session
  driver over a mocked `@earendil-works/pi-ai/compat` `complete`. All seven
  cells green; every value in §Reproduction is its stdout verbatim. Written,
  run, deleted; `git status --short` and
  `ls tests tests/live | grep -i scratch` both empty afterwards.
