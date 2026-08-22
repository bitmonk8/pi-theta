# Bug 0198 — The binder's BND-3 unavailability note renders the fixed fallback `provider transport failure` instead of the provider's own text whenever the attempt classifies `context_overflow`: `#classifyBinderAttempt` selects the note's `<message>` with `classified.kind === "transport" && classified.message !== ""` (`production-theta-producer.ts:1096–1099`) and then returns `outcome.kind: "transport"` for every classification per `determinism-cancellation-failure.md:36`, so the anthropic overflow bug 0065's element 1 made classify `context_overflow` reaches the operator as `theta /code-review: argument binder unavailable (anthropic-messages: provider transport failure)` where the provider supplied `prompt is too long: 220044 tokens > 200000 maximum` — and nothing specifies what that slot carries: `:42` pins `<provider>` and `<ajv-summary>` and is silent on `<message>`, so a wrong observable and a spec gap are the same defect here

- **Status:** fixed (0.192.0). §Fix was constraint-pinned, not settled: three
  mechanisms were
  enumerated with their measured end states, and the run adjudicated between
  them (mechanism (1), see `## Fix (0.192.0)`) against two facts this report measures — the 120-code-point system-note
  cap, which the provider's 168-code-point formatted overflow string does not
  fit (§Reproduction (h)), and the spec silence at
  `docs/spec_topics/binder/determinism-cancellation-failure.md:42`, which pins
  every placeholder in the failure-mode table except this one. Ordering: nothing
  blocks this report from starting and it blocks nothing.
  [0065](./0065-anthropic-overflow-status-gate-unsatisfiable.md) is **fixed
  (0.100.0)** and [0182](./0182-off-session-fold-fabricated-200-vetoes-overflow-match.md)
  is **fixed (0.110.0)**; both stay as they are. 0065's widened gate
  (`src/binder/provider-error-mapping.ts:276`) is what routes a real overflow
  into the arm this report is about and a fix rebases on it byte-identical;
  0182 moved only the off-session fold and changed nothing on the binder path.
  A fix flips one committed cell —
  `tests/binder-forced-tool-dispatch.test.ts:887–918`, which asserts the
  fallback note for exactly this input — and this report is the authority for
  moving it.
- **Sev/Diff estimate:** S2/D3 — S2 because the observable is *wrong failure
  text on a loud failure*, not a silent mis-value. The failure surfaces: one
  note is emitted, `bound` is `false`, the theta body never runs, and the retry
  disposition is the specified one (two provider calls, one transport-class
  retry, measured in every failure row of §Reproduction). What is lost is the
  only author-facing account of *why* the binder failed: the operator reads
  `provider transport failure` on a request the provider refused with
  `prompt is too long: 220044 tokens > 200000 maximum`, which names a different
  cause (a transport fault, retry later) than the real one (the binder prompt
  plus session context exceeds the model's window, and no retry can succeed).
  S1 was weighed and rejected: no value is corrupted, no input the spec refuses
  is accepted, nothing is fabricated as success, and the note's `<provider>` and
  the row selection are both correct. S3 was weighed and rejected: this is a
  behaviour defect, not a verification gap — the committed cell at
  `tests/binder-forced-tool-dispatch.test.ts:887` fires and is green; what is
  wrong is the value it expects, which a fix flips (§Fix constraint 5), not its
  ability to red. S4 was weighed and rejected: the spec silence is
  real (§Expected behaviour) but the shipped text is wrong under every reading
  of `:36`, so prose alone does not close it. D3 because §Fix needs in-run
  adjudication between three mechanisms whose end states differ measurably
  (§Fix (b)), because two of the three move a landed 0011-lineage witness cell,
  and because whichever lands must write the sentence `:42` never wrote. The
  code change itself is small — the four-line selection at `:1096–1099` in one
  file — which is why D2 was weighed; it is rejected because the mechanism is
  not determined by the constraints and the third mechanism changes no code at
  all.
- **Kind:** defect — three elements, each measured or source-traced at HEAD
  `a1cce24e`, v0.110.0 (`package.json:3`).
  1. *The message selection admits one classification and the seam produces
     two.* `#classifyBinderAttempt`
     (`src/extension/production-theta-producer.ts:1016`) calls the shared
     classifier at `:1090–1095` and then picks the note's text at `:1096–1099`
     with `classified.kind === "transport" && classified.message !== ""`,
     falling back to the literal `"provider transport failure"` (`:1099`).
     `classifyProviderResponse` (`src/binder/provider-error-mapping.ts:373`)
     returns exactly two kinds: `context_overflow` (the signature arm at
     `:377–378`, the `length` stop-reason arm at `:385–393`) and `transport`
     (`:397–403`). The gate therefore rejects the message of every overflow
     classification, both arms — measured, `{"overflowNull":false,
     "overflow400":false,"plain500":true}` (§Reproduction (b)).
  2. *The rejected message is the provider's own text, verbatim.*
     `matchOverflowSignature` sets `message` to the classifier-input
     `errorMessage` unchanged (`provider-error-mapping.ts:311`), exactly as the
     transport arm does (`:399`); the `length` arm uses `errorMessage ?? ""`
     (`:388`). Measured: `classified.message === errorMessage` is `true` on the
     overflow arm (§Reproduction (a)). So the gate is not protecting the note
     from an absent or unusable string — it discards a string of the same
     provenance and shape as the one it admits.
  3. *The note is rendered anyway, because the outcome is transport-class
     regardless.* `:1100` returns `{ kind: "transport", provider, message }` for
     every classification, implementing
     `determinism-cancellation-failure.md:36` ("A classifier output of
     `ContextOverflowError` is treated as transport-class for retry purposes …
     surfaces as the *Binder model transport failure* row"). The retry driver
     (`src/binder/retry-taxonomy.ts:256`, the transport-budget arm at
     `:271–274`) spends the one transport retry, and the terminal outcome is
     handed to `#emitBinderFailureNote`
     (`production-theta-producer.ts:900–902`, render at `:1217`), which
     interpolates the row at `retry-taxonomy.ts:122`. The row is the right row;
     the slot is filled with the wrong string.
- **Related:**
  - [0065](./0065-anthropic-overflow-status-gate-unsatisfiable.md) — **fixed
    (0.100.0)**, commit `9c6e8efc`, and the reason this is reachable on the
    binder path. Before it, the anthropic/mistral overflow gate was
    `input.httpStatus === 400` (`git show 9c6e8efc^:src/binder/provider-error-mapping.ts`,
    line 237), and the `anthropic-messages` adapter fires no `onResponse` on a
    400 — measured live and pinned at
    `tests/live/provider-error-revalidation-gate.test.ts:271` cell (b), whose
    assertion is `firings … .toEqual([])` (`:314–329`). A real binder-path
    overflow therefore arrived with `httpStatus: null`, missed the 400-only
    gate, classified `transport`, and its message carried the provider's text
    into the note. Element 1 widened the arm to
    `input.httpStatus === 400 || input.httpStatus === null` (`:276`) — the
    correct verdict — and the same response now classifies `context_overflow`,
    where the selection gate at `:1097` no longer matches. Measured both
    directions in §Reproduction (c) and (f). **This report does not reopen
    0065.** Its gate, its twelve offline cells, its live re-validation gate and
    its spec amendments stay as they are; §Fix constraint 1 pins them.
  - [0182](./0182-off-session-fold-fabricated-200-vetoes-overflow-match.md) —
    **fixed (0.110.0)**, commit `a1a3ba6b`, the re-record and the source trace.
    Its `## Fix (0.110.0)` §*Residuals* item 1 and
    `.pi/tmp/fixes/0182-report.md` §*Residuals / notes* item 1 state this defect
    in the terms verified here and leave filing to the parent; its §Non-goals
    ("The binder path") records the same observation as adjacent and claimed by
    nothing. 0182's own fix changed only `classifyOffSessionReply` and the three
    off-session `complete()` call sites, so this report's subject is unchanged by
    it — the selection at `:1096–1099` predates the repo-wide rename
    `2bc69157` (`git log -S '"provider transport failure"' --
    src/extension/production-theta-producer.ts`). The two defects are the same
    classification meeting two different consumers: 0182's was the author-visible
    `QueryError` on the off-session `@`-query path, this one is the
    operator-visible note on the binder path.
  - [0011](./0011-binder-complete-no-forced-tool-free-text-envelope.md) —
    **fixed (0.26.0)**, commit `b027a524`, the binder capture lineage and the
    owner of the cell a fix moves. It replaced the binder's fabricated
    `httpStatus: 200` with a real `onResponse` capture (`:1021–1028`, `:1092`)
    and installed `tests/binder-forced-tool-dispatch.test.ts:887–918` to witness
    that the captured status reaches the classifier. That cell's expected value
    is `TRANSPORT_FALLBACK_NOTE` (`:531–532`) and its header entry (`:63–65`)
    states the reasoning of the time: at v0.26.0 a *captured* 400 was the only
    way to reach the overflow signature, and the fallback note was the
    post-fix end state. The cell is green at this HEAD and pins the defect
    (§Reproduction (d)).
  - [0007](./0007-off-session-error-stop-swallowed-as-ok-empty.md) — **fixed
    (0.18.0)**, commit `87c044ff`, the origin of the same selection condition on
    the off-session path (`production-theta-producer.ts:5528–5531`, whose
    fallback is the named `PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE`,
    `src/runtime/prompt-transport-mapping.ts:52`). **That copy has the same shape
    and no exposure**: `classifyOffSessionReply` returns on
    `classified.kind === "context_overflow"` at `:5517–5519` before reaching it,
    so its `kind` test is redundant there rather than wrong, and the string it
    selects is never an overflow's. Named so a fix does not edit one copy and
    leave the reader to wonder about the other; constraint 6 leaves it alone.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for positional drift.
    `src/extension/production-theta-producer.ts` is **6452** lines at this HEAD
    (0182's fix grew it by 30 and disclosed the shift), so every position below
    is named by symbol beside its line number and every line was resolved at
    `a1cce24e` rather than copied from 0065's, 0182's or 0011's document.
- **Affected** (every citation re-verified against the tree at HEAD `a1cce24e`,
  v0.110.0, by `rg` and by reading the file; symbols named beside lines.
  `git status --short` was empty when the measurement began and after the probe
  was swept, so every cited byte is the committed byte):
  - **The selection.** `#classifyBinderAttempt`
    (`src/extension/production-theta-producer.ts:1016`), its doc-comment
    (`:992–1015`, whose routing item 3 at `:1009–1012` states the fold —
    "ContextOverflow folds into transport per the taxonomy"), the provider
    derivation (`:1020`), the `onResponse` capture (`:1021–1028`) and its
    comment ("never a fabricated 200", `:1021–1024`), the reply call (`:1031`),
    the throw arms (`:1032–1038`), the failure-routing comment (`:1075–1080`),
    the two field reads (`:1081–1082`), the routing guard (`:1085–1089`), the
    classifier call (`:1090–1095`) with `httpStatus: captured?.status ?? null`
    (`:1092`), **the message selection (`:1096–1099`) with the fallback literal
    at `:1099`**, and the outcome return (`:1100`).
  - **The path from that string to the operator.** The attempt closure
    (`:876–882`), the terminal-outcome route (`:900–902`),
    `#emitBinderFailureNote` (`:1213`) and its render call (`:1217`);
    `runBinderWithRetries` (`src/binder/retry-taxonomy.ts:256`, the
    transport-budget arm `:271–274`, the terminal return `:281`),
    `runBinderCallWithCancellation` (`src/binder/binder-cancellation.ts:89`,
    which passes the outcome through and reads no field of it);
    `renderBinderSystemNote` (`retry-taxonomy.ts:88`), its transport case
    (`:117–123`, the comment `:118–120`, the template literal `:122`) and the
    `BinderFailureSurface` transport arm (`:70`, in the union at `:67–73`);
    `BinderAttemptOutcome` (`:212–218`, the transport arm `:217`);
    `capSystemNote` (`src/binder/system-note.ts:99`) and
    `SYSTEM_NOTE_CODEPOINT_CAP = 120` (`:38`). The outcome reaches no other
    sink: `grep -n "\.outcome\b"` over the producer returns `:881` and `:900`
    for this path, and no diagnostic or runtime event is emitted for a binder
    transport-class failure.
  - **The classifier that produces both kinds.** `classifyProviderResponse`
    (`src/binder/provider-error-mapping.ts:373`), the overflow precedence
    (`:377–378`), the `length` stop-reason arm (`:385–393`, `message` at
    `:388`), the transport arm (`:397–403`, `message` at `:399`);
    `matchOverflowSignature` (`:296`, **`message` at `:311`**, the gate call at
    `:304`); `overflowStatusGateSatisfied` (`:270`, the anthropic/mistral arm
    `:272–276`); `OVERFLOW_SIGNATURES` (`:177–185`, anthropic at `:178–179`);
    `transportRetryable` (`:324`); `ProviderClassifierInput` (`:337`).
  - **The stop-reason set that admits the second arm.**
    `OFF_SESSION_NORMAL_STOP_REASONS` (`production-theta-producer.ts:5431–5436`)
    — `stop`, `end_turn`, `toolUse`, `tool_use`. `length` is absent, so a
    `length`-terminated binder reply with no matching ToolCall reaches the
    classifier through the guard at `:1086` and takes the `length` overflow arm
    (§Reproduction (g)).
  - **The committed cells a fix must handle explicitly.**
    `tests/binder-forced-tool-dispatch.test.ts` (1044 lines): the constant
    `TRANSPORT_FALLBACK_NOTE` (`:531–532`), the cell that asserts it
    (`:887–918`, the scripted `onResponse({ status: 400 })` at `:892–896`, the
    `errorMessage: "prompt is too long for this model"` at `:901`, the
    assertion at `:911–914`, the two-call retry assertion at `:916`) and the
    header entry that states its reasoning (`:63–65`).
    `tests/binder-retry-taxonomy.test.ts:166–179` — the unit render of the same
    row with `message: "503 upstream unavailable"`, which pins that the template
    interpolates provider text unchanged and is unaffected by every mechanism in
    §Fix (b). `tests/binder-inference-provider-mapping.test.ts` (1287 lines):
    the bug-0065 block (`:932`), the live overflow byte string (`:941–942`) this
    report replays, and the captured-non-400 veto cell (`:1041`).
    `tests/live/provider-error-revalidation-gate.test.ts:271` cell (b) — the
    live premise that the binder's anthropic path delivers `httpStatus: null`.
    `tests/live/live-production-acceptance.test.ts:5808`, `:5877` assert this
    note is **never** emitted on a successful bind and are untouched by any
    mechanism.
  - **Spec.** `docs/spec_topics/binder/determinism-cancellation-failure.md`
    (60 lines, anchors `#failure-class-taxonomy` at `:29` and
    `#failure-mode-templates-normative` at `:40`): `:31` (the taxonomy's
    classifier delegation), `:33` (the transport-class row), **`:36`** (*Context-
    overflow handling* — the transport-class fold and the intentional absence of
    a `ContextOverflowError` row), **`:42`** (the templates preamble: which
    placeholders are pinned, that the surrounding template is fixed and wording
    changes are spec-versioned breaking changes), **`:50`** (the
    `theta /<name>: argument binder unavailable (<provider>: <message>)` row),
    `:56` (one retry per class).
    The fixed fallback string is specified — for other surfaces, and only as an
    absent-text fallback:
    `docs/spec_topics/errors-and-results/queryerror-variants.md:106`,
    `docs/spec_topics/pi-integration-contract/conversation-drive.md:16`
    (PIC-51 / PIC-51b), and
    `docs/spec_topics/pi-integration-contract/provider-error-mapping.md:45`
    (the subagent envelope row); implemented at
    `src/runtime/prompt-transport-mapping.ts:52`.
- **Observed at:** v0.110.0 (`a1cce24e`). Offline, deterministic, provider-free:
  one scratch vitest probe driving the shipped production binder end to end
  (`createProductionProducerDeps` → `deps.runBinder` over a parsed two-param
  prompt-mode theta, capturing `pi.sendMessage`) with only
  `@earendil-works/pi-ai/compat`'s `complete` mocked, plus direct calls to the
  shipped `classifyProviderResponse` and `renderBinderSystemNote`. Harness shape
  copied from `tests/binder-forced-tool-dispatch.test.ts`. Written, run,
  deleted; every value below is that run's output verbatim. The live provider
  bytes are not re-measured here — they are the string bug 0065's 0.100.0 run
  captured from a real `claude-haiku-4-5` overflow and committed at
  `tests/binder-inference-provider-mapping.test.ts:941–942`, replayed
  byte-for-byte.

## Summary

The binder renders one note for every failure of its `complete()` call. For the
transport row that note is
`theta /<name>: argument binder unavailable (<provider>: <message>)`
(`determinism-cancellation-failure.md:50`), and `#classifyBinderAttempt` fills
`<message>` from the classifier only when the classification is `transport`:

```ts
const message =
  classified.kind === "transport" && classified.message !== ""
    ? classified.message
    : "provider transport failure";
return { outcome: { kind: "transport", provider, message } };
```

(`production-theta-producer.ts:1096–1100`.) The next line makes every
classification transport-class, per `:36`. So the two conditions the gate
distinguishes are not the two conditions the seam produces: an overflow
classification is rendered through the transport row with the fallback text,
because the gate tests the classifier's `kind` and the row selection does not.

Before bug 0065's fix no production response reached the mismatch on the default
provider — only a captured 400, which that adapter measurably never delivers and
which `tests/binder-forced-tool-dispatch.test.ts:887–918` scripts by hand. The
anthropic overflow gate was `httpStatus === 400`, the
`anthropic-messages` adapter fires no `onResponse` on a 400
(`tests/live/provider-error-revalidation-gate.test.ts:271`, measured
`firings: []`), so a real overflow arrived at `httpStatus: null`, classified
`transport`, and its message carried the provider's own text into the note.
0065's element 1 widened the arm to `400 || null` — the right verdict — and the
same response now classifies `context_overflow`. Measured end to end on the
committed live bytes, one classifier field apart:

| classifier verdict on the same reply | note `<message>` |
| --- | --- |
| `context_overflow` (`httpStatus: null` — what the adapter delivers) | `provider transport failure` |
| `context_overflow` (`httpStatus: 400`) | `provider transport failure` |
| `transport` (`httpStatus: 200`, gate-refused — the pre-0065 verdict) | `400 {"type":"error","error":{"type":"invalid_reque…` |

The provider stated the cause and both numbers in the string the classifier
received — `prompt is too long: 220044 tokens > 200000 maximum` — and the
operator gets a phrase that names a different failure class. The retry
disposition is unaffected: two provider calls, one transport-class retry,
`bound: false`, in every row measured.

Two facts fix the shape of the remedy. First, `classified.message` on the
overflow arm **is** the provider's text (`provider-error-mapping.ts:311`,
measured identical to the input `errorMessage`), so no new data has to be
plumbed — the string the gate discards is already in scope, next to the two
extracted counts. Second, the note is capped at 120 code points
(`system-note.ts:38`, `:99`) and the provider's formatted string is 168, so
admitting it unchanged yields a note truncated inside the JSON envelope prefix,
before the counts (§Reproduction (h)) — the same shape the transport rows
already render today. The provider-message window the token extraction already
computes (`provider-error-mapping.ts:223`) fits: 120 code points exactly, both
counts visible.

Nothing in the spec decides between those. `:42` enumerates the placeholders it
pins — `<provider>` and `<ajv-summary>` — and classes `<message>` only as
"runtime- or classifier-/validator-derived content". No sentence names the fixed
fallback for this row, and no sentence says what `<message>` carries when the
underlying classification is an overflow. The fixed string *is* specified for
three other surfaces (`queryerror-variants.md:106`, PIC-51 at
`conversation-drive.md:16`, `provider-error-mapping.md:45`), and in each it
fires only when the provider supplied no text. Here it fires when the provider
supplied text.

## Reproduction

Offline, deterministic, provider-free, at HEAD `a1cce24e`. One scratch vitest
probe; parts (a), (b) and (h) call the shipped `classifyProviderResponse` /
`renderBinderSystemNote` directly, parts (c)–(g) drive the shipped production
binder end to end (`createProductionProducerDeps` → `deps.runBinder`) over a
parsed two-required-param prompt-mode theta named `code-review`, with only
`@earendil-works/pi-ai/compat`'s `complete` mocked and `pi.sendMessage`
captured. Written, run, deleted.

The `errorMessage` byte string is the live anthropic overflow committed at
`tests/binder-inference-provider-mapping.test.ts:941–942`:

```
400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 220044 tokens > 200000 maximum"},"request_id":"req_011Ce67AeKSksfCvdLP3Q6Ha"}
```

The non-overflow control is the same pi-ai-formatted shape at a 5xx:

```
500 {"type":"error","error":{"type":"api_error","message":"Internal server error"},"request_id":"req_011Ce67AeKSksfCvdLP3Q6Hb"}
```

### (a) What the classifier hands the selection

```
[0198 p1] NULL-STATUS OVERFLOW : {"kind":"context_overflow","message":"400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"prompt is too long: 220044 tokens > 200000 maximum\"},\"request_id\":\"req_011Ce67AeKSksfCvdLP3Q6Ha\"}","tokens_used":220044,"tokens_limit":200000,"raw_response":null}
[0198 p1] CAPTURED-400 OVERFLOW: {"kind":"context_overflow","message":"400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"prompt is too long: 220044 tokens > 200000 maximum\"},\"request_id\":\"req_011Ce67AeKSksfCvdLP3Q6Ha\"}","tokens_used":220044,"tokens_limit":200000,"raw_response":null}
[0198 p1] CAPTURED-500 PLAIN   : {"kind":"transport","message":"500 {\"type\":\"error\",\"error\":{\"type\":\"api_error\",\"message\":\"Internal server error\"},\"request_id\":\"req_011Ce67AeKSksfCvdLP3Q6Hb\"}","http_status":500,"provider":"anthropic-messages","retryable":true}
[0198 p1] overflow message === input errorMessage ? true
```

The overflow classification's `message` is the input `errorMessage` unchanged —
the same provenance as the transport arm's.

### (b) The selection gate, per row

```
[0198 p1] gate `kind===transport && message!==""` per row: {"overflowNull":false,"overflow400":false,"plain500":true}
```

### (c) The note at HEAD — the shape the live adapter delivers

The scripted reply resolves with `stopReason: "error"`, empty content and the
live overflow `errorMessage`, and **does not** invoke `options.onResponse`,
mirroring the `anthropic-messages` adapter's measured behaviour on a 400
(`tests/live/provider-error-revalidation-gate.test.ts:271` cell (b),
`firings: []`):

```
[0198 p2] NOTE COUNT: 1
[0198 p2] NOTE: theta /code-review: argument binder unavailable (anthropic-messages: provider transport failure)
[0198 p2] cp: 96
[0198 p2] CALLS: 2 BOUND: false
[0198 p2] note carries provider text ? false
```

One note, two provider calls (the one transport-class retry of `:56`), no bind.
The note is 96 code points — the cap is not involved.

### (d) The same with a captured 400 — the shape the committed cell scripts

```
[0198 p3] NOTES: ["theta /code-review: argument binder unavailable (anthropic-messages: provider transport failure)"]
[0198 p3] CALLS: 2
```

Identical. Once the signature matches, the status the gate admitted it under
does not change the note; this is the input
`tests/binder-forced-tool-dispatch.test.ts:887–918` asserts against, and that
cell is green.

### (e) Controls — a non-overflow failure carries the provider's text

```
[0198 p4] NOTE: theta /code-review: argument binder unavailable (anthropic-messages: 500 {"type":"error","error":{"type":"api_error","m…
[0198 p4] cp: 120 carries provider text ? true
[0198 p4] CALLS: 2 BOUND: false
[0198 p5] NOTE: theta /code-review: argument binder unavailable (anthropic-messages: 500 {"type":"error","error":{"type":"api_error","m… | cp: 120
```

(p4) captured 500, (p5) the same bytes with no capture at all. Both classify
`transport`, both render the provider's string, both are truncated at the
120-code-point cap. The discriminator is the classification, not the status and
not the presence of a capture.

### (f) The same overflow bytes at a gate-refused status — the pre-0065 verdict

```
[0198 p7] NOTE: theta /code-review: argument binder unavailable (anthropic-messages: 400 {"type":"error","error":{"type":"invalid_reque… | cp: 120
[0198 p7] classification at 200: transport | CALLS: 2
```

`httpStatus: 200` is refused by the anthropic arm both before and after 0065
(`provider-error-mapping.ts:276`), so this row reproduces on the shipped
classifier the verdict a null-status overflow received at v0.99.0 and earlier:
the transport arm, whose `message` is the `errorMessage` at any status (`:399`)
— only `http_status` and `retryable` differ between the two inputs, and neither
reaches the note. The note carries the provider's text. Nothing about the note
changed at 0.100.0; what changed is which arm this reply lands in.

### (g) The other overflow arm — a `length` terminator

`length` is not in `OFF_SESSION_NORMAL_STOP_REASONS` (`:5431–5436`), so a
`length`-terminated reply with no matching ToolCall reaches the classifier and
takes the stop-reason overflow arm:

```
[0198 p8] errorMessage="" → ["theta /code-review: argument binder unavailable (anthropic-messages: provider transport failure)"] CALLS: 2
[0198 p8] classification: {"kind":"context_overflow","message":"","tokens_used":null,"tokens_limit":null,"raw_response":null}
[0198 p8] errorMessage="output truncated at the context boundary" → ["theta /code-review: argument binder unavailable (anthropic-messages: provider transport failure)"] CALLS: 2
[0198 p8] classification: {"kind":"context_overflow","message":"output truncated at the context boundary","tokens_used":null,"tokens_limit":null,"raw_response":null}
```

The first row is the fallback doing its job — the classification carries no
text. The second is the defect again, on the arm that reads no HTTP status at
all.

### (h) The render arithmetic and the cap

```
[0198 p6] CAP: 120
[0198 p6] raw errorMessage codepoints: 168
[0198 p6] FULL-TEXT NOTE ( 120 cp): theta /code-review: argument binder unavailable (anthropic-messages: 400 {"type":"error","error":{"type":"invalid_reque…
[0198 p6] WINDOW-ONLY NOTE ( 120 cp): theta /code-review: argument binder unavailable (anthropic-messages: prompt is too long: 220044 tokens > 200000 maximum)
```

Both strings are `renderBinderSystemNote("code-review", { kind: "transport",
provider: "anthropic-messages", message })` on the shipped renderer. The
formatted envelope does not fit: `capSystemNote` truncates it inside
`{"type":"invalid_reque…`, before either count. The provider-message window —
the substring `providerMessageWindow` (`provider-error-mapping.ts:223`) already
computes for the token extraction — fits at exactly 120 code points with both
counts and the closing parenthesis. That fit is boundary-tight and a function of
the theta name: the fixed template overhead is 59 code points, so `code-review`
(11) lands on 120 and a name one code point longer truncates the closing
parenthesis.

## Expected behaviour

- **`docs/spec_topics/binder/determinism-cancellation-failure.md:36`** — "A
  classifier output of `ContextOverflowError` is treated as transport-class for
  retry purposes. The binder system prompt is fixed across attempts, so a
  context-overflow failure is either flake-equivalent (the retry succeeds) or
  structural (the second attempt fails identically and surfaces as the *Binder
  model transport failure* row of the failure-mode templates table). There is no
  `ContextOverflowError`-specific row in that table; that absence is intentional
  under this rule." Both consequences hold as shipped: one retry (§Reproduction
  (c), two calls) and the transport row. The sentence is about the retry
  disposition and the row identity. It says nothing about the row's `<message>`
  and cannot be read as licensing the loss of the provider's text — "no
  `ContextOverflowError`-specific row" removes a row, not the content of the row
  that is used.
- **`:50`** — the row itself:
  `theta /<name>: argument binder unavailable (<provider>: <message>)`. It
  declares the slot and does not fill it.
- **`:42`** — the templates preamble, which is where every other placeholder is
  fixed: "`<name>`, the transport-failure row's `<provider>` and `<message>`,
  the custom-type-unsafe row's `<value>`, and `<ajv-summary>` carry runtime- or
  classifier-/validator-derived content (`<provider>` and `<ajv-summary>` are
  pinned below)". It then pins those two. **`<message>` is named and left
  unpinned — this is the spec gap.** Two further clauses of the same sentence
  bound any remedy: "Renderers MUST emit the surrounding template text verbatim;
  only the `<…>` placeholders are interpolated", and "Wording changes are
  spec-versioned breaking changes". So the fix surface inside the note is
  exactly the string that lands in `<message>`; the parenthetical, the prefix
  and the separator are fixed, and no new placeholder may be added without a
  spec-versioned template change.
  The same sentence pins `<provider>` as "the `provider` field of the
  classifier-produced `TransportError`, rendered verbatim" — a field that does
  not exist on an overflow classification. The value renders correctly only
  because the binder supplies it independently from `dispatch.model.api`
  (`:1020`). The preamble was written assuming a `TransportError` always
  underlies this row, which is the same assumption the selection gate encodes.
- **The fixed fallback's specified meaning, on the three surfaces that do
  specify it.** `queryerror-variants.md:106` — prompt mode "sources `message`
  from the `errorMessage` field of the driven turn's trailing `assistant`
  message … falling back to the fixed string `"provider transport failure"` when
  that field is **absent**". `conversation-drive.md:16` (PIC-51) — "`errorMessage`
  is optional on `AssistantMessage`, so when it is **absent** `message` MUST be
  the fixed string `"provider transport failure"`", and PIC-51b repeats the
  construction. `provider-error-mapping.md:45` — the subagent envelope row,
  `{ message: <errorMessage | "provider transport failure">, … }`. In all three
  the fallback is the no-text case. The binder note's use of it is not that
  case: the text exists, was classified, and is discarded on `kind`.
- **Consequence.** No sentence is violated by the shipped note, and no sentence
  sanctions it. This is a wrong observable paired with a spec silence: the fix
  chooses the `<message>` content and writes the sentence `:42` never wrote.

## Actual behaviour / root cause

**1. The gate discriminates on the wrong field.** `:1096–1099` asks whether the
*classification* is transport-class. What it needs to know is whether a
provider-supplied string exists — the `classified.message !== ""` half of the
same expression already asks exactly that, and answers `true` on the overflow
arm (§Reproduction (a)). The `kind` half is what rejects it.

**2. The two conditions the gate conflates.** The classifier returns
`context_overflow` in two cases: the signature arm
(`provider-error-mapping.ts:377–378`), whose `message` is the provider's
formatted string, and the `length` stop-reason arm (`:385–393`), whose `message`
is `errorMessage ?? ""` and is usually empty. The fallback is right for the
second-with-no-text and wrong for the first. One `kind` test cannot separate
them; the emptiness test already there can.

**3. The fold at `:1100` is correct and is what makes the note render.** Every
classification returns `outcome.kind: "transport"`, so `runBinderWithRetries`
spends the transport budget (`retry-taxonomy.ts:271–274`) and
`#emitBinderFailureNote` renders the transport row. Nothing downstream can
recover the discarded string: `BinderAttemptOutcome`'s transport arm carries
`provider` and `message` only (`retry-taxonomy.ts:217`), the counts are dropped
at `:1100`, and the note is the sole sink (`production-theta-producer.ts:900–902`,
`:1217`).

**4. The defect was latent until the classification became more precise.** The
selection predates the corpus rename `2bc69157`; 0065's element 1
(`9c6e8efc`, v0.100.0) is what first routes a real anthropic overflow into the
non-matching arm (§Reproduction (f) is the prior verdict, (c) the current one).
The information loss is a side effect of a correct fix landing against an
unstated assumption in a consumer two files away.

**5. The reach grows with the binder's own context.** The binder call carries
the rendered binder system prompt, the user arguments, and — for a
`bind_context: session` prompt-mode theta — a compact transcript of up to 20
turns / 8000 estimated tokens (`#buildBinderSessionContext`,
`production-theta-producer.ts:1166`). A grown session context is what pushes
that call past the window, and on `anthropic-messages` such a refusal classifies
through the signature arm (§Reproduction (a)), not through `length`.

**6. A committed cell asserts the current end state, for a reason that expired.**
`tests/binder-forced-tool-dispatch.test.ts:887–918` was installed by bug 0011's
fix to witness that a captured status reaches the classifier, and at v0.26.0 a
captured 400 was the only route to the signature arm. Its expectation
(`TRANSPORT_FALLBACK_NOTE`, `:531–532`) records the fallback as the intended
post-fix note, and its header entry (`:63–65`) states that reading explicitly.
The cell is green and its subject — the status threading — is not this report's;
its expected note is.

## Why it matters

- **The note is the only account the operator gets.** The binder's reply is
  runtime-internal (BND-3): no transcript card, no diagnostic code, no runtime
  event, and the theta does not start. `provider transport failure` names a
  transient network-class fault for a refusal that will repeat on every
  invocation until the theta's prompt or `bind_context` changes, and the
  operator's next action follows from the text.
- **The provider stated the cause and both numbers, in the string that was
  discarded.** `prompt is too long: 220044 tokens > 200000 maximum` identifies
  the failure and quantifies the gap. The counts are extracted and available at
  the selection site (`tokens_used: 220044`, `tokens_limit: 200000`,
  §Reproduction (a)) and are dropped one line later.
- **A more precise classification made the author-facing surface less
  informative.** Bug 0065's element 1 is correct and this is its cost at a
  consumer it did not touch. The cost recurs for every provider on the widened
  arm: `mistral` and `mistral-conversations` share it (`:272–276`), so an
  overflow they classify loses its text by the same construction (no measurement
  is claimed for them — §Non-goals).
- **The text names a transient fault for a deterministic refusal.** The transport row
  and the retry are specified for overflow (`:36`) and are not the defect; but
  the row plus the fixed phrase leaves nothing in the operator-visible output
  distinguishing "the provider was unreachable" from "the request cannot fit".
  §Reproduction (e) shows a genuine 5xx rendering with its own text, so the two
  cases are distinguishable today only in the direction that does not need it.
- **The spec cannot settle it as written.** `:42` pins every placeholder in the
  table except this one, so a reader deriving the note's content has nothing to
  derive it from, and two implementations could disagree while both conforming.

## Fix

Not settled. The surface is fixed and the constraints are measured; the
mechanism is chosen in-run from (b).

### (a) The surface

- `#classifyBinderAttempt`'s message selection
  (`src/extension/production-theta-producer.ts:1096–1099`) — the `kind` test at
  `:1097` and the fallback literal at `:1099`.
- The spec sentence that must state the rule afterwards:
  `docs/spec_topics/binder/determinism-cancellation-failure.md:42` (the
  templates preamble, where `<provider>` and `<ajv-summary>` are pinned), in the
  same commit.
- `tests/binder-forced-tool-dispatch.test.ts:531–532` and `:887–918` under
  mechanisms (1) and (2) — the constant and the cell's expected note.

Not edited under any mechanism: `src/binder/provider-error-mapping.ts` (the
gate, the signatures, the token extraction and both classifier arms are bug
0065's and stay byte-identical), `retry-taxonomy.ts`'s template and retry driver
(`:122`, `:256–283`), `capSystemNote` and the 120-code-point cap
(`system-note.ts:38`, `:99`), `:1100`'s transport-class fold, and the
off-session copy of the selection expression (`:5528–5531`).

### (b) The undecided part: what fills `<message>` on an overflow classification

The `<message>` slot is the whole constraint surface: `:42` fixes the
surrounding template and makes wording changes spec-versioned, so no mechanism
may add a placeholder, change the parenthetical, or add a second note.

1. **Widen the selection to any non-empty classifier message.** Drop the `kind`
   test and keep the emptiness test — `classified.message !== ""` — so both
   overflow arms and the transport arm render the classifier's string and the
   fallback survives for the no-text cases.
   *For it:* the smallest change (one condition), it makes the fallback mean
   what it means on the three surfaces that specify it (absent text), and it
   needs no new string construction. It fixes both overflow arms at once
   (§Reproduction (g)).
   *Against it:* measured, the rendered note is
   `…(anthropic-messages: 400 {"type":"error","error":{"type":"invalid_reque…`
   (§Reproduction (h)) — the 168-code-point formatted envelope truncated inside
   its JSON prefix, before both counts. The operator gains the provider's status
   line and loses the counts to the cap. This is the same quality the transport
   rows already ship (§Reproduction (e)), so it is a consistency argument, not a
   legibility one.
2. **Render the provider-message window.** Select `classified.message` as in (1)
   but narrow it through the same `providerMessageWindow` substring selection
   the token extraction already uses (`provider-error-mapping.ts:223`), so the
   note carries `prompt is too long: 220044 tokens > 200000 maximum`.
   *For it:* measured, this is the only variant in which the counts reach the
   operator — 120 code points exactly, both counts, closing parenthesis intact
   (§Reproduction (h)). The narrowing function is shipped, is a substring
   selection rather than a parse, and its output is already trusted for the
   numbers in `ContextOverflowError`.
   *Against it:* it needs a decision the spec does not contain — whether the
   window applies to the transport rows too (consistency) or only to the
   overflow arms (a second per-kind branch in the same expression the defect
   came from). The fit is boundary-tight and theta-name-dependent
   (§Reproduction (h): 59 code points of fixed overhead), so a longer name still
   truncates. Exporting `providerMessageWindow` widens
   `provider-error-mapping.ts`'s surface, which constraint 1 otherwise keeps
   closed — a fix choosing this states whether it exports the function or moves
   the narrowing to the note layer.
3. **Amend the spec to pin the fallback for this row and leave the code.** Write
   into `:42` that the transport row's `<message>` is the classifier's
   `TransportError.message` and the fixed string `"provider transport failure"`
   for every other classification the row carries.
   *For it:* no code change, no cell flip, and it closes the silence — the
   defect becomes documented behaviour and `tests/binder-forced-tool-dispatch.test.ts:887–918`
   keeps its assertion with a correct reason.
   *Against it:* it ratifies the loss. It documents that the binder's only
   author-facing failure text drops the provider's own account of a refusal a
   grown binder prompt produces, while the same string renders on the same row
   for a 5xx, and it makes 0065's widening a net loss for the note on every
   provider that shares the widened arm. A fix choosing it states why (1) and
   (2) were unavailable.

### (c) Constraints

1. **Bug 0065's classifier stays byte-identical.**
   `src/binder/provider-error-mapping.ts` is not edited for behaviour — the
   gate (`:270–289`), the signatures (`:177–185`), the extraction (`:239–255`)
   and both classifier arms (`:377–393`, `:397–403`) are 0065's, and
   `tests/binder-inference-provider-mapping.test.ts`'s bug-0065 block (`:932`),
   including the captured-non-400 veto cell (`:1041`), stays green with no
   assertion touched. Mechanism (2)'s only admissible touch is an export.
2. **The retry disposition and the row selection do not move.**
   `determinism-cancellation-failure.md:36` is not amended and `:1100`'s fold is
   not edited: an overflow classification stays transport-class, spends the one
   transport-class retry, and surfaces on the *Binder model transport failure*
   row. Every failure row in §Reproduction measures `CALLS: 2`, and the fix
   asserts that count unchanged rather than assuming it.
3. **The template is fixed.** `:42` — "Renderers MUST emit the surrounding
   template text verbatim" and "Wording changes are spec-versioned breaking
   changes". No mechanism adds a placeholder, changes the parenthetical, emits a
   second note, or bypasses `capSystemNote`.
   `tests/binder-retry-taxonomy.test.ts:166–179` stays byte-identical under all
   three.
4. **The no-text fallback stays reachable and correct.** §Reproduction (g)'s
   first row — a `length` terminator with no `errorMessage` — must still render
   `provider transport failure`, as must a `transport` classification with an
   empty message, and a witness cell pins both. The fallback is not deleted; its
   trigger is narrowed to the condition the other three surfaces give it.
5. **The 0011-lineage cell is moved deliberately, with its reason rewritten.**
   Under (1) or (2), `tests/binder-forced-tool-dispatch.test.ts:887–918` changes
   its expected note and its header entry (`:63–65`) is corrected in the same
   commit, citing this report; its subject — that the captured status reaches
   the classifier — is preserved, so the cell keeps scripting
   `onResponse({ status: 400 })` and keeps asserting two calls. The constant
   `TRANSPORT_FALLBACK_NOTE` (`:531–532`) stays in the file if any remaining
   cell needs it, and is removed if none does. No other cell of that file is
   touched.
6. **Scope.** One expression in `#classifyBinderAttempt`, one spec sentence, one
   cell (plus one new witness cell per §Fix (d)). The fix does not touch the
   off-session fold or its copy of the selection expression (`:5528–5531`), does
   not touch `#emitBinderFailureNote`, adds no registered diagnostic code, and
   emits no runtime event.
7. **Bugs 0065, 0182 and 0011 are not reopened.** Their `## Fix` records, cells
   and spec amendments stand. 0065's widened gate is the input this fix consumes;
   0182's fold is not on this path; 0011's capture threading is preserved by
   constraint 5.

### (d) Witness

Offline, provider-free, additive except for the one cell constraint 5 moves.
Required cells, in `tests/binder-forced-tool-dispatch.test.ts` (the note's own
home, where the end-to-end drive already exists):

- The live anthropic overflow `errorMessage` under `stopReason: "error"` with
  **no** `onResponse` firing — the adapter's measured shape — asserting the note
  byte-exactly under the chosen mechanism. This is §Reproduction (c) inverted
  and it reds at HEAD.
- The `length`-terminator pair (constraint 4): with no `errorMessage` the note is
  the fallback; with one present it is that text under mechanisms (1) and (2),
  the fallback under (3).
- The non-perturbation controls: §Reproduction (e)'s 5xx rows render
  byte-identically before and after, and the `needs_info` / `ambiguous` /
  `malformed` / `ajv_args` / `cancelled` rows are untouched.
- The retry-count assertion on every row above (`CALLS: 2`), so constraint 2 is
  witnessed and not assumed.
- Under mechanism (2) only: a cell pinning the narrowing on a message with no
  `"message":` member, so the whole-string fall-through
  (`provider-error-mapping.ts:228`) is exercised rather than inferred.
- Each new assertion proved both directions once: red with the `kind` test
  restored, green with the mechanism in place.

### (e) Ordering

Nothing blocks this report and it blocks nothing.
[0065](./0065-anthropic-overflow-status-gate-unsatisfiable.md) (**fixed
0.100.0**) supplies the classification this fix consumes and constraint 1 pins
it byte-identical; [0182](./0182-off-session-fold-fabricated-200-vetoes-overflow-match.md)
(**fixed 0.110.0**) shares no line with this fix;
[0011](./0011-binder-complete-no-forced-tool-free-text-envelope.md) (**fixed
0.26.0**) owns the cell constraint 5 moves and is not otherwise involved. A fix
rebases on all three and waits for none.

## Non-goals

- **The retry taxonomy.** `determinism-cancellation-failure.md:36` specifies
  that an overflow classification is transport-class for retry purposes and that
  no `ContextOverflowError` row exists in the table. Both stand; constraint 2
  pins them. This report is about the text in the row that is used.
- **Un-folding the variant on the binder path.** Whether the binder should
  surface `ContextOverflowError` as its own class — with the counts as
  structured fields rather than as text — is a spec question `:36` answers in
  the negative today, and it is not asked here. The counts enter this report
  only as evidence about `<message>` (§Reproduction (a), (h)).
- **The off-session fold.** Bug 0182 fixed
  `classifyOffSessionReply`'s classifier input at 0.110.0 and its
  `context_overflow` passthrough is what makes the author-visible
  `Err(ContextOverflow(e))` reachable there. The same selection condition
  further down the same file (`:5528–5531`) sits downstream of that passthrough
  (`:5517–5519`), so no overflow classification reaches it; it is not this
  report's subject and constraint 6 leaves it alone.
- **The 120-code-point cap.** `SYSTEM_NOTE_CODEPOINT_CAP`
  (`src/binder/system-note.ts:38`) and the scalar-aligned truncation (`:99`) are
  the V11e line discipline and are not edited. The cap enters §Fix only as the
  measured budget that distinguishes mechanisms (1) and (2).
- **Whether pi-ai fires `onResponse` on error responses.** Upstream; bug 0065's
  §Non-goals pins it. This defect is status-independent once the signature
  matches (§Reproduction (c) vs (d)), so no adapter change closes it.
- **`mistral` parity as a measurement.** The `mistral` and
  `mistral-conversations` rows share the widened arm and therefore the defect,
  by construction (`provider-error-mapping.ts:272–276`). No `mistral` api
  provider exists in this install (bug 0065 residual 3), so nothing here is
  measured for them and nothing claims to be.

## Provenance

- **Parent.** Bug 0182's fix run, v0.110.0, commit `a1a3ba6b`:
  `docs/bugs/0182-off-session-fold-fabricated-200-vetoes-overflow-match.md`
  `## Fix (0.110.0)` §*Residuals* item **1** ("The binder's BND-3 note loses the
  provider's text on any classification that now returns `context_overflow`" —
  "re-recorded from §Non-goals, source-traced, not fixed here and not owned
  here … The parent decides filing") and `.pi/tmp/fixes/0182-report.md`
  §*Residuals / notes* item **1** ("THE BND-3 RE-RECORD"). That run's §Fix
  constraint 5 forbade touching it, so it was traced in source and left. The
  same observation is recorded in that document's §Non-goals ("The binder path"),
  as adjacent and claimed by nothing.
- **Grandparent.** Bug 0065's fix run, v0.100.0, commit `9c6e8efc`, whose
  element 1 made the `context_overflow` classification reachable on the binder
  path. Its gate row in `.pi/tmp/fix-open-bugs/RESUME.md` records the item as
  *recorded-not-filed*: "BND-3 note loses provider text on binder-path overflow
  (inside 0182's blast radius — parent adjudication)". That run's own report
  lists "the binder's overflow fold" under §*Not re-filed (known classes, per
  the brief)* and its §*Residuals* name the off-session fold and the
  `provider-error-mapping.md:7` tension rather than this note, so the RESUME row
  is where the note itself is recorded.
- **This filing.** Parent-adjudicated. Every value in §Reproduction was measured
  fresh at HEAD `a1cce24e` by one scratch probe (written, run, deleted; tree
  clean before and after), and every citation was re-resolved at that HEAD
  rather than carried from 0065's, 0182's or 0011's document. The pre-0065 gate
  quoted in §Related was read from `git show 9c6e8efc^`.

## Fix (0.192.0)

**Mechanism (1) of §Fix (b), adjudicated in-run.** The BND-3 note's `<message>`
is the classifier's own message whenever it is non-empty — both overflow arms
and the transport arm — and the fixed string `"provider transport failure"`
only when no text exists, which is the meaning that string carries on the three
surfaces that do specify it (`queryerror-variants.md:106`,
`conversation-drive.md:16` PIC-51, `provider-error-mapping.md:45`).

Mechanism (2) (narrow through `providerMessageWindow`) was rejected on two
independent grounds. §Fix (d) requires §Reproduction (e)'s 5xx rows to render
byte-identically, so the window could not be applied uniformly and would need a
second per-kind branch in the very expression the defect came from, plus an
export widening `provider-error-mapping.ts` that §Fix constraint 1 keeps closed.
And the **0177 field-rendering law**, landed in this tree at 0.186.0
(`docs/bugs/0177-err-note-render-string-coercion-on-record-error-fields.md`
`## Fix (0.186.0)`), rule 1: a string `QueryError` field "renders verbatim — no
quoting, no truncation, no escaping". Narrowing a string field before embedding
it contradicts that law. That evidence post-dates this report's measurement HEAD
(v0.110.0) and is recorded here as the deciding input. Mechanism (3) (amend the
spec, ratify the loss) was rejected because (1) is available; §Fix (b) requires a
run choosing (3) to state why (1) and (2) were unavailable, and neither was.

- What shipped:
  - `src/extension/production-theta-producer.ts` — `#classifyBinderAttempt`'s
    message selection (§Fix (a); at this HEAD `:1158–1161`, not the report's
    `:1096–1099` — the file is 6667 lines here, the bug-0134 do-not-chase class)
    drops the `classified.kind === "transport"` half of the gate and keeps the
    emptiness half; the retained field renders through `summariseErrorField`
    (`src/runtime/err-field-summary.ts`) per the 0177 law — a runtime no-op for
    the statically-string `message` (rule 1), and the law's required routing
    rather than a second stringifier. The outcome return, `:36`'s
    transport-class fold and the one transport-class retry are unchanged
    (§Fix constraint 2, asserted on every failure row).
  - `docs/spec_topics/binder/determinism-cancellation-failure.md` — the
    failure-mode-templates preamble (`:42`) now pins the transport row's
    `<message>`, the one placeholder it left unpinned: for a filling derived
    from the provider-error classifier it is that error's `message` field
    rendered verbatim when non-empty — for every classification reaching the row
    along that path, including a `ContextOverflowError` folded in per
    `#failure-class-taxonomy` — and the fixed string when that field is empty or
    absent. A second, expressly descriptive clause records what the
    non-classifier filling (a rejected provider call) carries at this revision
    and states that an abort surfaces the cancelled row instead, so the pin
    claims nothing false of the arm §Fix constraint 6 leaves alone. No template
    row, placeholder, prefix, separator or parenthetical changed; `:36`, `:50`
    and `:53` are byte-identical.
  - `tests/binder-forced-tool-dispatch.test.ts` — six new witness cells
    (title-token `CELL-F2`) and the ONE pre-authorized committed-cell flip
    (§Fix constraint 5): the 0011-lineage cell keeps its subject (the
    `onResponse`-captured 400 reaches the classifier, two calls, `bound: false`)
    and changes only its expected note; its banner and the file's header entry
    are rewritten to the current reason. `TRANSPORT_FALLBACK_NOTE` stays — two
    of the new cells assert it as the no-text fallback. No other cell touched.
  - `tests/proto-named-binder-write-sites.test.ts` — three comment-only
    citation corrections (`production-theta-producer.ts:1002` → `:1003`) forced
    by this change's one-line import shift. Bounded, self-authorized, recorded
    under *Residuals* item 2.
- Gates:
  - Witness: neutralising the selection back to the old expression reds exactly
    three cells (the flipped 0011 cell and the two new provider-text cells),
    each on `Received: "…provider transport failure)"` against the expected
    provider text; restoring gives `Tests 24 passed (24)`. Restoration proved
    exact by `git hash-object` → `f28d378f0a6c528657056bbbd5aabf6cdff7c2f0`
    before and after the neutralisation cycle.
  - Full default suite: `npm test` → `Test Files 377 passed (377)`,
    `Tests 7766 passed (7766)`.
  - `npm run typecheck` → clean. `npm run lint` → clean.
  - Live (under the shared live lock): H9a
    `tests/live/live-production-acceptance.test.ts -t "drives a real binder pass"`
    → 1 passed (a real bind still emits the echo note and never
    `argument binder unavailable`); H8a
    `tests/live/err-note-render-record-error-field-live-cell.test.ts` → 1 passed
    (the `summariseErrorField` routing this fix newly depends on, driven through
    a real provider and a real RFC-0006 child, asserted on the
    `theta-system-note` channel off the settled `SessionManager`).
  - Untouched-by-hash: `src/binder/provider-error-mapping.ts`,
    `src/binder/retry-taxonomy.ts`, `src/binder/system-note.ts`,
    `src/runtime/err-field-summary.ts` — each `git hash-object` equals
    `git rev-parse HEAD:<path>` (§Fix constraints 1, 3, 7). The off-session copy
    of the selection expression is unchanged (§Fix constraint 6).
- Review: 3 rounds. Round 1 (deep) — one `spec` finding: the new pin overreached
  onto the rejected-`complete()` arm, whose message is
  `coerceUnderlyingString(thrown)` and can be empty. Round 2 (deep) — one `spec`
  finding: the replacement clause's abort sub-case was false of the row, since
  `runBinderCallWithCancellation` intercepts the sticky signal before and after
  every attempt and surfaces the cancelled row. Round 3 (fast) — clean, no
  escalation. Both fixer rounds changed spec prose only; no assertion, no
  executable line.
- Verification: SOLID. Witness reds and greens on demand with the hashes above;
  default suite green; live binder surface exercised for real on both the H9a
  binder cell and an H8a cell of the newly-depended-on summariser; lint and
  typecheck clean.
- Residuals:
  1. **No live test exercises the overflow note text itself.** Forcing a real
     provider `ContextOverflowError` needs a genuine >200 000-token prompt,
     which is not token-bounded under the AGENTS.md live conventions; the
     verifier was explicitly not authorized to build it. The path is covered
     offline with proven red/green discrimination on the committed live
     anthropic overflow bytes (`binder-inference-provider-mapping.test.ts:941–942`),
     and the live runs above cover the surface's success direction and the
     summariser. Named, not hidden.
  2. **Three comment-only citation corrections outside the fix's own file**
     (`tests/proto-named-binder-write-sites.test.ts`, `:1002` → `:1003`). The
     question that would have gone to the operator: may a fix repair citations
     its own one-line import shift invalidated, given 0134's do-not-chase
     policy? Self-authorized as citation/comment-only on three sources: 0134 is
     the adjudicated class for *pre-existing* positional drift, not for drift
     this change creates; the charter's correction-round clause names
     "shifted line numbers that other documents cite … sibling witnesses" as a
     citation-only remedy; and the diff touches three comment lines, zero
     assertions and zero executable lines, with the cited content re-read at
     `:1003` and the file's nine cells green. Bound: that one file, those three
     lines. Stop valve: any further file going red, or any hunk touching an
     executable line, stops the run. Every other citation into the shifted file
     was left alone as the 0134 class.
  3. **Pre-existing stale citations found and left.** The implementer's audit
     found `tests/live/provider-error-revalidation-gate.test.ts` and
     `tests/off-session-transport-classification.test.ts` carry citations into
     `production-theta-producer.ts` that were already wrong at HEAD, before this
     change. Reported, not chased (0134).
  4. **One full-suite run showed `1 failed | 7765 passed` with no captured
     failure name; the isolated re-run of the same suite was `377 passed` /
     `7766 passed`, as were the three later full runs.** Recorded as a
     machine-contention flake per the stochastic-class policy, not chased.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: unchanged. Bugs 0065, 0182 and 0011 are not
  reopened; the retry taxonomy, the transport-class fold, the 120-code-point cap
  and the off-session fold stay exactly as they are; `mistral` parity remains
  unmeasured (no `mistral` api provider in this install).
