# How to use an extension tool from prompt mode

You want a prompt-mode theta — one that drives your own, live session — to reach
a Pi tool that an installed Pi extension registers (`finding_store`,
`projection`, ...): from the model during an `@` query, from theta code, or
both. List the extension tool's name in `tools:`, exactly as you would a
built-in. Since 0.11.0 this works in prompt mode; before that an extension name
in a prompt-mode `tools:` failed load.

## How names resolve

A `tools:` Pi-tool entry resolves at load time against Pi's full tool registry
(the `pi.getAllTools()` snapshot) — every name Pi exposes, built-in or
extension-registered — mode-independently. The resolved entry carries the
tool's `parameters` schema, so computed argument fields are checked against the
tool's input schema like a built-in's. An unknown name is a **load-time** error
(`theta/load/unknown-tool`): a typo or an uninstalled extension refuses
registration loudly rather than degrading at run time.

## Two reach paths

- **Model-facing.** During a query's tool loop the model sees exactly the
  theta's callable set as the session's active tools — the extension tool
  included — and your host session, which holds the tool's implementation,
  executes the call. The prior active set is restored when the query window
  ends, so the theta leaks no tools into your session.
- **Code-side.** Theta code calls the tool directly — `finding_store({ ... })`
  — with deterministic arguments and zero model tokens. The public extension
  API exposes no executable handle for another extension's tool, so the runtime
  dispatches through your live session's host agent loop (PIC-64 — *host-loop
  dispatch*): it authors the `tool_use` with your arguments verbatim, the host
  loop runs it, and the result returns to code like any other tool call.

## What you will see in your transcript (accepted cost)

Prompt mode means the code-side dispatch lands in **your own session**. Per
code-side call:

- one fabricated user message plus a tool-call card and a tool-result card
  appear in your transcript — they render as ordinary Pi tool-call cards and
  are deliberately not suppressed;
- the session model switches twice (`model_select` fires on the way into the
  dispatch and again when your prior model is restored — restored in a
  `finally`, including on error and abort);
- zero model tokens are spent, and per-call latency is negligible next to a
  real model turn.

This is the documented trade-off for a zero-token, deterministic side-effect
channel running against a live session — not a defect. Expect the cards; do not
be surprised by them. A code-side call made inside a `subagent fn` inline body
carries the same cost in your transcript: the body's isolation covers its own
conversation — its queries, its transcript, its return value — not the
dispatch channel. If transcript cards in your session are unacceptable,
put the calls in a subagent-mode theta instead: the identical mechanics run in
the child's private, discarded session ([How to use an extension tool in a
subagent](./use-an-extension-tool-in-a-subagent.md)).

There is no new permission gate. The capability is bounded by the two existing
gates — the theta must name each tool in `tools:`, and the project must be
trusted — the same gates that already govern `bash`.

## Failure behaviour

- A code-side call whose tool reports failure (an `isError` result) returns
  `Err(CodeToolError { cause: "execution" })` carrying the tool's message —
  the same semantics as a failing built-in, never a fabricated `Ok`.
- On a host where no code-side dispatch rung is establishable (the required Pi
  surfaces are missing), a theta whose code calls an extension tool refuses to
  load with `theta/load/extension-tool-unreachable`, naming the tool —
  fail-closed, never a silent fallthrough. Model-facing use via a `@`-query
  needs no dispatch rung and is unaffected.

## Working example

[`docs/examples/prompt-extension-tool.theta`](../examples/prompt-extension-tool.theta)
reaches `finding_store` both ways from prompt mode — code first, then the model
(header comments elided here; the checked-in file carries the full commentary):

```theta
---
description: Check a findings store from prompt-mode code, then have the model report on it
mode: prompt
tools:
  - finding_store
params:
  findings_dir: string
---
// Code-side reach: dispatched through YOUR live session's host agent loop —
// zero model tokens, but one fabricated tool-call turn appears in your
// transcript per call.
let check = finding_store({ op: "validate", findingsDir: findings_dir })?

// Model-facing reach: during the query's tool loop below the MODEL sees
// exactly this theta's callable set as the session's active tools —
// `finding_store` included — and the user's host session executes the call.
@`The findings store under ${findings_dir} reports: ${check}
Using the finding_store tool, list the store's findings and report how many
are still open, in one sentence.`
```

Run it (the `finding_store` extension must be installed in the Pi session):

```
pi --theta docs/examples -p "/prompt-extension-tool findings/"
```

If `finding_store` is not installed, the theta refuses to load with
`theta/load/unknown-tool` naming the tool — the `/prompt-extension-tool` slug is
then not registered at all.

## Reference

- `tools:` callable set, mode-independent resolution, and the resolution
  snapshot — [Frontmatter](../reference/frontmatter.md#tools-callable-set).
- `theta/load/unknown-tool`, `theta/load/extension-tool-unreachable`,
  `theta/load/host-incompatible` — [Diagnostics](../reference/diagnostics.md).
- `CodeToolError` shape and `cause` enum —
  [Error & result model](../reference/errors-and-results.md).
- The reach story across both modes — [Guide](../guide.md#extension-tools).
- The subagent-mode counterpart —
  [Use an extension tool in a subagent](./use-an-extension-tool-in-a-subagent.md).

## Provenance

- CHANGELOG `[0.11.0]` (mode-independent `tools:` admission via the
  `pi.getAllTools()` registry snapshot; parent-side host-loop dispatch; the
  accepted prompt-mode cost — fabricated user message + tool-call/tool-result
  cards, double `model_select`, no suppression, no new permission gate;
  `isError` → `Err(CodeToolError { cause: "execution" })`).
- Motivation: `docs/bugs/0001-extension-tools-unreachable.md`.
- Spec: `docs/spec_topics/pi-integration-contract/subagent.md`
  ([PIC-64](../spec_topics/pi-integration-contract/subagent.md#pic-64) —
  mode-independent code-side dispatch, host-loop wiring (a)–(f), *Accepted cost
  (prompt mode)*, permission surface),
  `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md`
  ([PIC-17](../spec_topics/pi-integration-contract/tool-registration-lifetime.md#pic-17)
  — the callable set as the query-window active set),
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md` §`tools`
  (mode-independent registry-snapshot admission),
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`
  §Resolution snapshot (name + `parameters` entry shape, prompt-mode
  extension-tool leg), `docs/spec_topics/slash-invocation.md` (SLSH-2 —
  prompt-mode tool calls render as ordinary, unsuppressed transcript cards).
- Example `prompt-extension-tool.theta` validated through the committed-fixture
  parse gate (`tests/committed-fixture-parse-gate.test.ts`).
