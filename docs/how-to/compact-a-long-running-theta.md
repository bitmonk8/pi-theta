# How to compact a long-running theta

A prompt-mode loop that drives many `@` queries over the same conversation can
approach the model's context window before its work is done. Three
runtime-owned tools (theta 1.5, RFC 0011) let a theta manage its own
conversation's memory in code: `compact`, `context_usage`, `session_name`.

## Compact vs. a fresh session

Decide per phase, not once per theta:

- **Independent phases** — a phase that needs none of an earlier phase's
  detail — spawn a fresh child instead: `invoke(...)` / a `.theta`-callable
  call, or a `subagent fn` body ([Functions — FN-6](../spec_topics/functions.md#fn-6)).
  Each child starts with an empty conversation; nothing to compact.
- **Sequential phases in the same conversation** — a later phase needs a
  compacted memory of earlier phases (the running total of a fix loop, the
  set of files already touched) — call `compact` between phases instead of
  starting over: the summary keeps that memory, the rest of the transcript is
  dropped.

## Declare the tools

List each tool in `tools:`, like any other callable-set entry:

```yaml
tools: compact, context_usage, session_name
```

The three names are **code-only** — never model-facing (RFC 0011's carve-out
to [FRNT-2](../spec_topics/frontmatter/frontmatter-fields-a.md#frnt-2)): they
never enter the prompt-mode `pi.setActiveTools` install vector or a subagent
child's `--tools` allowlist, and no model in any `@`-query tool loop can call
them. Declaring one only wires the code-side callable. `as` renames the
presented name as usual (`compact as compact_session`); diagnostics that name
the tool render the presented spelling.

## Working example

[`docs/examples/compact-loop.theta`](../examples/compact-loop.theta) applies a
fix plan wave by wave, compacting between waves when the gauge crosses a
threshold:

```theta
---
description: Apply a fix plan wave by wave, compacting between waves
mode: prompt
params:
  plan_path: string
tools: read, compact, context_usage, session_name, theta_progress
---
session_name("fix-loop " + plan_path)?

let plan = read({ path: plan_path })?
let waves: array<string> = plan.split("\n")
for wave in waves {
  @`Apply this step of the plan and report what changed: ${wave}`?

  let usage = context_usage()?
  if usage.percent > 60 {
    match compact("Keep the per-wave change list and any failing test names.") {
      Ok(c)  => theta_progress({ message: "compacted (tokens after / before)", done: c.tokens_after, total: c.tokens_before }),
      Err(_) => theta_progress({ message: "no compaction this wave" }),
    }
  }
}
```

Run it:

```
pi --theta docs/examples -p "/compact-loop plan_path=plan.md"
```

## The gauge idiom

Read `context_usage()` after a query, never immediately after `compact()` — a
completed compaction leaves the host's gauge in its post-compaction state
(token count and percent both unknown) until the next assistant response
carries usage. `usage.percent` is typed `number` after the `?` unwrap; the
loop's own read sits right after the wave's query, which is where the gauge
is populated.

`context_usage()`'s `Err` arms are not failures to bubble past a `?` without
thought — branch on them:

- `context usage unavailable: no model selected or unknown context window` —
  no model is selected, or the selected model reports no known context
  window.
- `context usage unknown until the next assistant response` — read
  immediately after a `compact()`, before any further assistant response.

## The benign refusals

`compact` surfaces two refusals as `Err(CodeToolError { cause: "execution" })`
carrying the host message verbatim: `Nothing to compact (session too small)`
and `Already compacted`. Both mean the postcondition — "the context is small"
— already holds; they are not authoring mistakes. Do not string-match the
message text: branch on `Err` alone and treat it as "nothing compacted this
wave" (see [Errors and Results — Runtime-tool
arms](../reference/errors-and-results.md#codetoolerror) for the full pinned
arm list, and [Tool Calls — Session-control runtime
tools](../spec_topics/tool-calls.md#session-control-runtime-tools) for the
normative text this page mirrors).

## Cancellation

An abort mid-`compact()` surfaces `Err(cause: "cancelled")` at once, without
invoking any host abort of the running compaction: the host compaction keeps
running in the background and its later `onComplete` / `onError` settlement
is discarded. A compaction entry may still land on the driven session after
the theta reported cancelled — visible in the TUI, where the user's Escape
key aborts the running compaction directly.

## Inside `subagent fn` bodies

A call inside a `subagent fn` body addresses the body's own child session
(the body runs as the root invocation of its own child process, [Functions —
FN-6](../spec_topics/functions.md#fn-6)) — `compact()` there compacts that
child's conversation, not the calling theta's.

## `par for` bodies reject the tools

A `par for` body has severed its link to the enclosing conversation; a
runtime-tool call anywhere inside one — directly or in a nested block, a
renamed entry judged by resolution — is the parse error
`theta/parse/session-tool-in-isolated-body`. A plain `fn` body is not
isolated and admits the calls; a `fn` reachable both from inside and outside
a `par for` body still refuses at runtime for the `par for` call path (the
runtime backstop, `Err(CodeToolError { cause: "execution" })`).

## Reference

- `tools:` callable-set third entry kind —
  [Frontmatter](../reference/frontmatter.md#tools-callable-set).
- The fixed signatures, argument-typing rule, isolated-body rejection, and
  return-type row — [Tool Calls — Session-control runtime
  tools](../spec_topics/tool-calls.md#session-control-runtime-tools).
- The pinned `CodeToolError` arms per tool — [Errors and
  Results](../reference/errors-and-results.md#codetoolerror).
- `subagent fn` isolation — [Functions —
  FN-6](../spec_topics/functions.md#fn-6).

## Provenance

- [RFC 0011 — Session-control tools: `compact`, `context_usage`,
  `session_name`](../rfcs/0011-session-control-tools.md).
- CHANGELOG `[0.476.0]`.
