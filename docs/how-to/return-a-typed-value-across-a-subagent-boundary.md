# How to return a typed value across a subagent boundary

You want a parent theta to run a subagent-mode child in its own isolated
conversation and get a **typed** value back — not a string, and not the child's
transcript. The child's final value crosses the boundary as the `Ok` payload; its
conversation stays private and is discarded when the child returns.

## Steps

1. Write the child as a `mode: subagent` theta whose final value has the type you
   want. Its return type is inferred from its body (there is no `returns:` field).
2. From the parent, reach the child in one of two operationally equivalent ways:
   - register the child path in `tools:` and call it by name — its inferred
     return type flows into the call site; or
   - call `invoke<Schema>("./child.theta", args)?` with an inline path and an
     explicit return schema.
3. Unwrap with `?`. The runtime AJV-validates the child's return value; the
   parent then holds a typed value it can index and branch on.

## Working example

Child [`docs/examples/sentiment.theta`](../examples/sentiment.theta) returns a typed
`Sentiment`:

```theta
---
description: Classify text sentiment
mode: subagent
params:
  text: string
---
schema Sentiment {
  label: "positive" | "neutral" | "negative",
  confidence: number
}

let result: Sentiment = @`Classify the sentiment of: ${text}`?
result
```

Parent [`docs/examples/typed-return.theta`](../examples/typed-return.theta) calls it
as a `.theta` callable and branches on the typed result:

```theta
---
description: Invoke a subagent classifier and branch on its typed result
mode: subagent
tools:
  - ./sentiment.theta
params:
  text: string
---
let s = sentiment(text)?
if s.confidence < 0.5 {
  @`The classifier was unsure (${s.label}). Ask a clarifying question.`?
}
@`Acknowledge the ${s.label} sentiment in one line.`
```

Run it (the child is exercised through the parent — a `.thetalib`/child theta is not
invoked directly here):

```
pi --theta docs/examples -p "/typed-return I love this, it works perfectly"
```

## Result

`sentiment(text)?` runs the whole child theta in a spawned child `pi` process,
validates its return value against the inferred `Sentiment` shape, and binds a
typed `s`. The child's intermediate turns never reach the parent's transcript;
only `s` crosses back. The transport is a single `{"theta_result": {"ok": …}}`
line the child emits on its stdout — mechanics you never write by hand: the
parent reconstructs the typed value (or the `Err`) from that envelope with full
`Result` fidelity. On child failure the parent observes
`Err(InvokeCalleeError { ... })` (the child returned `Err`) or
`Err(InvokeInfraError { ... })` (load / validation / panic, or a child that
exited without an envelope — mapped fail-closed, never a fabricated value) — no
value flows.

The inline-path form `let s: Sentiment = invoke<Sentiment>("./sentiment.theta",
text)?` is equivalent; use it for one-off calls, and `tools:` for repeated or
model-exposed callees.

## Large params cross the same way

Because the whole callee runs in the child process, the callee's `params:` are
marshalled across the process boundary structurally — canonical JSON on an env
var for small payloads, a 0600 temp file for larger ones — with the binder
bypassed. A **big string param and a typed return therefore behave identically
to the in-process path**: no size ceiling an author has to know about, no loss
of typing.
[`docs/examples/typed-params-across-boundary.theta`](../examples/typed-params-across-boundary.theta)
passes a (possibly large) `document` param to
[`docs/examples/summarise-doc.theta`](../examples/summarise-doc.theta) and
branches on the typed `Summary` it returns:

```
pi --theta docs/examples -p "/typed-params-across-boundary <your document text>"
```

## Reference

- `invoke`, typed return, static resolution, and the callee return-type rule —
  [Discovery & invocation](../reference/discovery-cli.md).
- `.theta`-callable registration and return-type flow — [Frontmatter](../reference/frontmatter.md).
- Return-value lowering and AJV validation — [Schema subset](../reference/schema-subset.md).
- `InvokeCalleeError` / `InvokeInfraError` shapes — [Error & result model](../reference/errors-and-results.md).
- What "final value", "subagent mode", and "isolated conversation" mean — [Guide](../guide.md).

## Provenance

- Spec: `docs/spec_topics/invocation.md` (typed return, final-value propagation,
  argument binding), `docs/spec_topics/return.md`, `docs/spec_topics/functions.md`
  (FN-3, FN-5), `docs/spec_topics/schema-subset.md`,
  `docs/spec_topics/runtime-value-model.md`,
  `docs/spec_topics/pi-integration-contract/subagent.md` (return-value envelope
  [PIC-59](../spec_topics/pi-integration-contract/subagent.md#pic-59),
  marshalled-params channel
  [PIC-60](../spec_topics/pi-integration-contract/subagent.md#pic-60),
  state-isolation matrix), `docs/spec_topics/invocation.md`
  ([INV-5](../spec_topics/invocation.md#inv-5), envelope-mediated propagation),
  `docs/rfcs/0006-child-process-theta-execution.md`, glossary entries
  *prompt mode* / *subagent mode*, *final value*, *Pi tool* vs *`.theta` callable*.
- Examples `typed-return.theta` + `sentiment.theta` requested from
  `theta-docs-example-runner`; `typed-params-across-boundary.theta` +
  `summarise-doc.theta` added for the RFC 0006 process-boundary marshalling.
