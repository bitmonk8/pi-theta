# Bug 0182 — `classifyOffSessionReply` hard-codes `httpStatus: 200` into the classifier input, so bug 0065's widened anthropic/mistral overflow gate is unreachable at every off-session `complete()` seam: the fold delivers no `null` for the widened arm to admit, and its own fabricated 200 is a captured non-400 status that vetoes the signature match — a real `prompt is too long: 220044 tokens > 200000 maximum` reaches the author as `Err(TransportError)` with both counts dropped where the same bytes at `httpStatus: null` classify `ContextOverflowError { tokens_used: 220044, tokens_limit: 200000 }` — and the same fabrication is the standing counterexample to `provider-error-mapping.md:7`'s "the runtime registers `onResponse` on every `complete()` call", which none of the three off-session call sites does

- **Status:** fixed (0.110.0). At filing, §Fix was constraint-pinned, not
  settled: the surface was fixed
  (`classifyOffSessionReply` plus the three off-session `complete()` call sites
  that feed it) and the constraints were measured, but *which* mechanism removes
  the fabrication is undecided, and the two live candidates collide from
  opposite sides — capturing the real status closes the `:7` spec tension and
  matches what bug 0011's fix already did to the binder's identical fabricated
  200, but puts the `openai-completions` HTTP-400 overflow arm at risk on an
  adapter property that is UNMEASURED here (bug 0065 residual 2); folding to
  `null` is honest about the no-capture, leaves the spec tension standing, and
  makes `tests/off-session-transport-classification.test.ts` cell (v)'s
  assertion unreachable off-session. The adjudication was made in-run against the
  evidence in §Fix (b) and the measurement §Fix (d) names: mechanism **(b)(1)**,
  against a §Fix (d) measurement that was **taken live** rather than derived —
  see `## Fix (0.110.0)` below.
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

## Fix (0.110.0)

- **Mechanism settled — §Fix (b)(1), capture the real status.** The literal is
  gone; `classifyOffSessionReply` takes the captured `ProviderResponse |
  undefined` as a required third parameter and presents
  `httpStatus: captured?.status ?? null` — the shape `#classifyBinderAttempt`
  has shipped since bug 0011 (v0.26.0), applied to the seam that fix did not
  reach. (b)(2) (fold to `null`) was rejected on evidence, not preference: it is
  strictly worse for `openai-completions` than (b)(1), losing **both** that
  provider's overflow sub-cases (the HTTP-400 one *and* the HTTP-200
  body-envelope one) where (b)(1) loses only the first, while additionally
  inverting a landed 0007-lineage assertion and leaving `:7`'s registration
  sentence false. (b)(3) was not reached: §Fix (b)(3) admits it only if (1) and
  (2) both fail on evidence, and (1) did not.

- **The §Fix (d) measurement — MEASURED, not derived.** §Fix (d) named the one
  fact that could have rerouted the adjudication to (b)(2): whether the
  `openai-completions` adapter invokes `onResponse` before resolving an HTTP
  400. Bug 0065 residual 2 recorded it as untakeable in this environment. It was
  retaken here and it **succeeded**. First attempt, threading auth exactly as
  `#completeBinderReply` does (`ModelRegistry.getApiKeyAndHeaders` →
  `options.apiKey` / `options.headers`), reproduced 0065's residual verbatim —
  `401: {"message":"Missing Authentication header","code":401}` at openrouter and
  `401: {"message":"LiteLLM Virtual Key expected. Received=UNIT****KEY1, expected
  to start with 'sk-'.", …}` at the unity gateway. The masked key is the
  diagnosis: for both `openai-completions` providers the registry's out-of-band
  read returns the **name** of the credential's environment variable rather than
  its value (23 characters = `PERSONAL_OPENROUTER_KEY`, 18 =
  `UNITY_LITELLM_KEY1`). Threading the environment's own value instead, the
  measurement lands, in both directions and on two independent 400 stimuli:

  ```
  [0182 d 200-control] MODEL: openrouter/openai/gpt-3.5-turbo (api=openai-completions, cw=16385)
  [0182 d 200-control] ONRESPONSE FIRINGS: [200]
  [0182 d 200-control] STOPREASON: stop
  [0182 d 400-overflow] ONRESPONSE FIRINGS: []
  [0182 d 400-overflow] STOPREASON: error
  [0182 d 400-overflow] ERRORMESSAGE: 400: {"message":"This endpoint's maximum context length is 16385 tokens. However, you requested about 32786 tokens (32770 of text input, 16 in the output). …","code":400,"metadata":{"provider_name":null}}
  [0182 d 400-badparam] ONRESPONSE FIRINGS: []
  [0182 d 400-badparam] ERRORMESSAGE: 400: {"message":"Expected temperature to be at most 2, received 99","code":400,"metadata":{"provider_name":null}}
  ```

  The `temperature: 99` 400 recorded `[]` at the unity gateway too. So the
  `openai-completions` adapter **withholds `onResponse` on an HTTP 400** and
  fires it exactly once with `[200]` on a success — the 200 control is what makes
  the empty firings evidence about the adapter's error path rather than about an
  unregistered callback, and it confirms the static read at
  `dist/api/openai-completions.js` (`.withResponse()` throws on a non-2xx before
  the `onResponse` line) that §Reproduction (f) could only derive. The
  `anthropic-messages` half needs no restatement: bug 0065's live gate cell (b)
  measures it on every run of `tests/live/provider-error-revalidation-gate.test.ts`.

- **The openai-400 trade, stated explicitly.** Because the adapter withholds,
  an `openai-completions` HTTP-400 overflow off-session now presents `null` and
  openai's gate refuses `null`, so that sub-case classifies `transport` where the
  fabricated 200 used to buy it `context_overflow`. This is a
  **regression-by-honesty and the specified outcome**, not a defect: `:7` says a
  no-status `openai-completions` response "classifies as network-level even when
  its `errorMessage` carries overflow wording", and the fabrication was masking
  exactly that. It is pinned by witness cell **W5** so it can never regress
  silently in either direction. Weighed against (b)(2)'s cost — which flips cell
  (v), a landed 0007-lineage lock, and takes openai's HTTP-200 body-envelope arm
  off *every* off-session seam — the trade is one unobserved-in-the-wild sub-case
  against the live reality of anthropic overflows, and it leaves the openai
  HTTP-200 arm reachable on a *real* 200 (measured `[200]`) instead of a
  fabricated one.

- **The intended behavioural change (GOV-15).** No source-language observable
  moves: this is a classifier-input fix and registers no code, mints no
  diagnostic, and changes no parse verdict. The one author-visible flip is the
  point of the bug — an off-session `@`-query overflow against
  `anthropic-messages` / `mistral` / `mistral-conversations` binds
  `Err(ContextOverflowError { tokens_used, tokens_limit })` where it bound
  `Err(TransportError)` with both counts dropped. QRY-10 is the authority
  (`query-failure-and-repair.md:25`: the counts "are populated when the provider
  supplies them in the error payload"), and the provider supplied both.

- **What shipped:**
  - `src/extension/production-theta-producer.ts` — `classifyOffSessionReply`
    gains the required third parameter and presents `captured?.status ?? null`;
    its doc-comment's false clause ("registers no `onResponse` … and 200 is what
    admits the openai HTTP-200 … gate") is replaced by the captured-status
    contract, and the transport fold's in-body comment now states the true WHY
    for its pinned surface (PIC-51 / bug 0007, published regardless of any
    captured status) instead of the now-false "no HTTP status is captured at this
    seam". Each of the three off-session `complete()` call sites —
    `offSessionComplete` (which was a two-argument call and gains an options
    object), `OffSessionQueryModel.#driveFreePhaseRound`,
    `dispatchForcedRespondTurn` — registers its own function-local `let captured`
    plus `onResponse` closure and threads the value into its fold call.
    Per-invocation by construction; no shared slot (CLAUDE.md).
  - `docs/spec_topics/pi-integration-contract/provider-error-mapping.md` — one
    amendment, at `:7`. The registration sentence "the runtime registers
    `onResponse` on every `complete()` call" **became true** with this fix and
    needed no carve-out: all four `complete()` call sites in `src/` now register
    it (the binder's plus these three; grep-enumerated, there is no fifth). Its
    parenthetical, which pointed only at the binder's options enumeration, now
    also names the off-session query and forced-respond calls and says what their
    registration buys — that PIC-50's "exactly as the binder's `complete()` call
    is" now holds of their HTTP-status input too. `:17`, `:18`, `:19` and `:24`
    are untouched (§Fix constraint 6: the rows were right, the input was wrong).
    File is 86 lines before and after with every anchor on its original line
    (3, 7, 9, 11, 22, 31, 38, 54, 65), so no citing document drifted.
  - `tests/off-session-transport-classification.test.ts` — +8 cells (W1–W8) and
    the two edits §Fix constraint 3 authorizes: the mocked `complete` now accepts
    its options and fires a scripted `onResponse` (a `WeakMap` side table keyed on
    the reply object, so no scripted reply carries a non-`AssistantMessage`
    member), and cell (v)'s fixture gains `onResponseStatus: 200` with its WHY
    comment restated — the 200 is now the adapter's real captured status. **Cell
    (v)'s assertion is byte-untouched**, and cells (i), (ii), (iii), (iv), (iv-b),
    (vi), (vii) and both green controls are byte-identical.
  - `tests/live/off-session-overflow-classification.test.ts` — NEW. Two live
    cells driving a real off-session `@`-query end to end through the production
    driver, scored on the arm an author's own `match` takes.

- **Seam census (§Fix (e), all four seams accounted for).**
  1. `#driveFreePhaseRound` — witnessed offline (W1, W8) and live (both cells:
     an untyped `@`-query in a `subagent fn` body takes this dispatch).
  2. `dispatchForcedRespondTurn` from the off-session driver — witnessed offline
     (W2: a clean free-phase turn, then the overflow on the respond dispatch).
  3. `dispatchForcedRespondTurn` from the **live prompt-mode** driver — verified
     by construction, not driven: `LivePromptQueryModel` reaches the *same*
     function through the same call expressions, and the fold call it classifies
     through is the single one inside that function, so seam 2's witness covers
     this seam's classification by identity of code path.
  4. `offSessionComplete` — threaded and read, but **unwitnessed by
     construction**; see residual 2.

- **Constraint discharge (§Fix (c)), one line each.**
  1. `src/binder/provider-error-mapping.ts` is byte-unchanged (`git diff --stat`
     empty for it), and `tests/binder-inference-provider-mapping.test.ts` — 58
     cells including the captured-non-400 veto cell — is byte-unchanged and green.
  2. No non-overflow outcome moved: W6 drives a non-overflow error-stop with a
     captured **500** and with no firing and asserts the two leaves `toEqual`
     each other and the pinned surface — a captured 500 would make the
     classifier's own verdict `retryable: true` / `http_status: 500`, so the fold
     is proven to still overwrite both.
  3. Cell (v) was handled explicitly, as a fixture change with an untouched
     assertion; the blast radius was measured before the witness was written, by
     prototyping the mechanism and running the full suite — exactly one
     pre-existing cell red, and it was that one.
  4. The `length` arm stays reachable and status-blind: W7 drives it under a
     captured **400** and still gets `context_overflow`, null counts, and
     `raw_response` carrying the partial text; untouched cell (iii) agrees.
  5. Scope held: `#classifyBinderAttempt`, `extractPromptModeQueryResult` and
     every registered code are untouched; the diff is the fold, its three call
     sites, one spec parenthetical, and tests.
  6. The spec edit is same-commit and mechanism-determined, and is the one
     parenthetical described above.
  7. Bug 0065 is not reopened: its record, its 12 offline cells, its live gate
     (re-run green here) and its spec amendments stand. Its §Actual behaviour's
     wrong "fixed `null` fold" wording is corrected by this record's existence,
     not by editing that document.

- **Live signature RETIRED.** The off-session-overflow→transport signature — a
  real anthropic overflow reaching a theta author as `Err(TransportError)` — is
  retired at 0.110.0. It was the last open live signature in the set. It is now a
  *pinned red under revert* instead: with the literal restored the new live cell
  renders `VERDICT=TRANSPORT|END` and fails, and with the fix it renders
  `VERDICT=OVF_LIMIT_200000|END`.

- **Gates** (each run by the orchestrator, not taken on report):
  - Witness, red before: `6 failed | 12 passed (18)` in
    `tests/off-session-transport-classification.test.ts` — W1/W2/W3 on
    `transport` vs `context_overflow` with both counts dropped (byte-identical to
    §Reproduction (d)'s leaf), W4 on the two verdicts being equal, W5 on
    `context_overflow` vs `transport`, W8 on `Received: "TRANSPORT"`. W6/W7 are
    green both sides by design — they are the non-perturbation controls.
  - Witness, green after: `Tests 18 passed (18)`.
  - Full default suite: `Test Files 313 passed (313)` / `Tests 5257 passed
    (5257)` — the 0.109.0 baseline of 5249 plus these 8 cells, zero failures.
  - Typecheck: `npx tsc --noEmit -p tsconfig.json` → no output, exit 0.
  - Lint: `npm run lint` → no output, exit 0.
  - Live, the new cell: `[bug 0182 live ovfctl] USERTEXTS:
    ["VERDICT=UNEXPECTED_OK|END"]`, `[bug 0182 live ovflive] USERTEXTS:
    ["VERDICT=OVF_LIMIT_200000|END"]`, `Tests 2 passed (2)`.
  - Live, both directions: with `httpStatus: 200` temporarily restored the same
    drive rendered `["VERDICT=TRANSPORT|END"]` and the cell failed; the file was
    then restored byte-exactly (`diff` against a pre-probe copy empty, blob hash
    identical) and re-ran green. Proven twice — once by the orchestrator, once
    independently by the verifier.
  - Live, bug 0065's 3-cell re-validation gate (it LOCKS, being binder-shaped):
    `[bug 0065 live a] ONRESPONSE FIRINGS: [200]`, `[bug 0065 live b] …: []`,
    `[bug 0065 live c] …: []` with `CLASSIFIER VERDICT:
    {"kind":"context_overflow", …,"tokens_used":220039,"tokens_limit":200000, …}`,
    `Tests 3 passed (3)`.
  - Live H8a, whole half: `Test Files 5 passed (5)` / `Tests 55 passed (55)`
    (47 + 3 + 1 + 2 + the 2 new).
  - Live H9a, both files: `Tests 11 passed (11)`. No `theta/*` code is added
    anywhere by this fix, so every permitted-codes assertion ran byte-unchanged.

- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) returned one finding and one
  non-blocking residual: F1 (`house-rule`) — the transport fold's in-body comment
  "no HTTP status is captured at this seam (hence `http_status: null`, never the
  fabricated 200)" was falsified by this diff's own third parameter and left
  dangling historical narration of a removed defect; R1 (`test`) — the
  `offSessionComplete` registration has no cell that can red (residual 2 below).
  F1 was routed to `bug-fix-fixer-light` and fixed comment-only (3 comment lines,
  every changed line prefixed `  // `, file line count unchanged). The polish was
  verified by gate-diff — suite, typecheck and lint re-run green, every hunk a
  comment — so the confirmation review round was skipped by rule. Everything the
  reviewer checked it quoted: the three capture sites in full context, the
  option-spread shadowing question (`OffSessionRequestAuth` is
  `{ apiKey?, headers? }`, so no spread can shadow `onResponse`), the
  byte-unchanged binder files, the anchor line list, and a mechanical
  red-direction entailment of every new assertion.

- **Verification:** SOLID, no findings. Obligation by obligation: (1) the witness
  reds under a one-line revert with the bug's exact signature and re-greens after
  a byte-exact restore (blob hash `03d2a7e7` matching an independently computed
  backup hash — no `git checkout` was used, the tree not being at HEAD);
  (2) 313 files / 5257 tests, 0 failures; (3) every live obligation run for real
  — the new cell green, its red direction independently reproduced, 0065's gate
  3/3, H8a 55/55, H9a 11/11, with the open-signature list checked before any
  attribution and no red to attribute; (4) typecheck and lint clean; (5) the
  unwitnessed `offSessionComplete` seam read line by line and confirmed to
  register and thread correctly, with both its callers traced to the same
  unmintable-from-source gate.

- **Residuals:**
  1. **The binder's BND-3 note loses the provider's text on any classification
     that now returns `context_overflow`** — re-recorded from §Non-goals,
     source-traced, not fixed here and not owned here.
     `#classifyBinderAttempt` selects its message with
     `classified.kind === "transport" && classified.message !== ""` and otherwise
     takes the fixed `"provider transport failure"` fallback, then returns
     `outcome.kind: "transport"` for every classification per
     `determinism-cancellation-failure.md:36`. So a binder attempt whose response
     classifies `context_overflow` renders the BND-3 template
     `theta /<name>: argument binder unavailable (<provider>: <message>)` with the
     fixed fallback instead of the provider's own overflow text. This predates
     this fix and is unchanged by it — bug 0065's element 1 is what made the
     `context_overflow` classification reachable on the binder path — and §Fix
     constraint 5 forbade touching it here. The parent decides filing.
  2. **`offSessionComplete`'s `onResponse` registration has no test that can
     red.** Dropping it would leave `captured` permanently `undefined`, i.e. the
     honest `null` class rather than a fabricated value, so the failure mode is
     silent-but-safe; and both callers are gated behind the same
     unmintable-from-source condition (`#completeFused`, the degraded arm
     "reachable only via a `schema: \"\"` QueryExpr, which bug 0014's parse
     rejection makes unmintable from source", and `offSessionFollowUp`, wired to
     the same respond-less branch). `grep -rn "completeFused\|offSessionFollowUp"
     tests/` returns zero matches. An offline cell would have to fabricate an AST
     to reach it, which is why none was added.
  3. **The registry returns credential *names*, not values, for both
     `openai-completions` providers on the out-of-band read.**
     `ModelRegistry.getApiKeyAndHeaders` resolved `ok: true` with a 23-character
     "key" that is the string `PERSONAL_OPENROUTER_KEY` (and 18 characters =
     `UNITY_LITELLM_KEY1`), which the endpoints reject with 401. This is the
     mechanism behind bug 0065 residual 2's unexplained 401s, and it is why no
     shipped live cell pins the openai measurement above: a cell reading the
     operator's environment variable directly would fail loudly in every other
     install, which is worse than no cell. The measurement therefore lives in
     this record, not in a gate. Host/config-shaped; nothing in theta's own
     surface is implicated.
  4. **Mistral remains UNMEASURED**, restating bug 0065 residual 3's class: no
     `mistral` api provider exists in the configured install, so W3 rides
     shared-gate parity and says so, claiming no measurement.

- **Discharge notes appended:**
  `0065-anthropic-overflow-status-gate-unsatisfiable.md` — a coordination note
  recording that its `## Fix (0.100.0)` §Residuals **1** and **5** are discharged
  here.

- **Pinned dispositions / non-goals** (unchanged, not re-litigated): whether
  pi-ai should fire `onResponse` on error responses is upstream (bug 0065
  §Non-goals); PIC-51b's deliberate status-blindness on the on-session
  prompt-mode probe is specified behaviour, not a defect; the binder's fold of
  `ContextOverflowError` into the transport class is unchanged; the
  `openai-completions` HTTP-200 body-envelope gate itself is untouched — what
  moved is which status the seam presents to it; positional drift in citations to
  `production-theta-producer.ts` is bug 0134's adjudicated do-not-chase class and
  no citation was renumbered anywhere.

- **Decisions recorded in lieu of asking** (the `question` tool is unavailable in
  this run, so each is on the record with its bound):
  1. *Which mechanism.* Settled as (b)(1) inside §Fix's own constraint envelope,
     on the (d) measurement plus the (b)(2)-is-worse-for-openai comparison above.
     No constraint was widened.
  2. *The spec parenthetical.* §Fix constraint 6 authorizes a same-commit `:7`
     edit and states mechanism (i) needs no carve-out; the parenthetical widening
     is the smallest edit that keeps the sentence's cross-reference complete once
     three more call sites satisfy it. Bound: one parenthetical, no normative
     clause touched, file length and every anchor line unchanged.
  3. *Taking the (d) measurement with the environment's credential* after the
     registry's own value was rejected as a 401. Bound: a scratch, deleted probe;
     no shipped file reads an environment credential; the finding is residual 3.
  4. *No shipped live cell for the openai measurement*, for the reason in
     residual 3 — a gate that cannot run outside this install would violate the
     no-silent-skipping rule by construction.
  5. *Skipping the confirmation review round* after the comment-only polish,
     which that round's own gate-diff (every hunk a comment, gates green)
     authorizes.
