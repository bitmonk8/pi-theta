# How to call a tool from theta code

You want deterministic theta code — not the model — to run a tool (read a file,
grep, invoke a helper theta) and use the result. Call it directly with the
bare-identifier form `<name>(args)`, where `<name>` is an entry in the theta's
callable set.

A tool call is **not** a conversation turn: it consumes no model tokens, adds no
turn to the theta's conversation, and — for built-ins and `.theta` callables —
does not appear in the transcript. That is the distinction from an `@`...``
query. One exception to the transcript silence: a code-side call to an
*extension-registered* tool routes through a host agent loop and appends a
fabricated tool-call turn to the backing session's transcript — the child's
discarded one in subagent mode, your own in prompt mode — still zero tokens;
see the Result section below. A call made inside a `subagent fn` inline body
carries the same cost in the same place: the body's isolation covers its own
conversation, not the dispatch channel.

## Steps

1. List the tool in frontmatter `tools:` — the callable set is empty by default
   and the host session's ambient tools are not inherited.
2. Call it with `<name>(args)`. A Pi tool takes a single bare object literal
   matching its input schema, written inline at the call site; its field values
   may be full expressions (identifier references, operators, calls, `${...}`
   interpolation), so computed values can be passed directly —
   `read({ path: base + "/main.ts" })`.
3. The call returns `Result<string, QueryError>` (a Pi tool) — unwrap with `?` or
   handle with `match`.

## Working example

[`docs/examples/call-tool.theta`](../examples/call-tool.theta) greps the tree from
code with a computed `path` field, then feeds the result into a query:

```theta
---
description: Count TODO markers under src
mode: subagent
tools: grep
---
// A Pi-tool argument's field values are full expressions (RFC 0002), not only
// literals: `path` here is a let-bound identifier reference, passed directly.
let root = "src"
let hits = grep({ pattern: "TODO", path: root })?
@`How many TODO markers appear in this grep output? ${hits}`
```

Run it:

```
pi --theta docs/examples -p "/call-tool"
```

## Result

`grep(...)` runs against Pi's tool runtime and returns its output as a `string`;
`?` unwraps `Ok` (or early-returns `Err`). This code-side form works for built-in
Pi tools, `.theta` callables, and extension-registered Pi tools in both modes
(subagent since 0.10.0, prompt since 0.11.0). An extension-tool call is
dispatched deterministically through a host agent loop — the child's own in a
subagent-mode theta, the user's live session in a prompt-mode theta — with zero
model tokens; in prompt mode the dispatch visibly appends a fabricated
tool-call turn to the user's own transcript. See [Use an extension tool from
prompt mode](./use-an-extension-tool-from-prompt-mode.md) and [Use an extension
tool in a subagent](./use-an-extension-tool-in-a-subagent.md). A code-side
extension-tool call refuses **at load** with
`theta/load/extension-tool-unreachable` (fail-closed) only in a **no-rung**
context — a host where no dispatch rung is establishable (the required Pi
surfaces are missing, or no backing host session exists) — in which case the
theta does not register; model-facing use via a `@`-query is unaffected. The grep output is interpolated into
the query — no tool-call card and no extra model turn are spent on the grep
itself. A Pi-tool failure surfaces as `Err(CodeToolError { ... })` with a `cause`
of `validation`, `execution`, `cancelled`, or `unknown_tool`; a tool that
reports failure (an `isError` result) — extension tools included — lowers to
`cause: "execution"`, never a fabricated `Ok`.

## Reference

- `tools:` callable set, resolution, and the `as` rename — [Frontmatter](../reference/frontmatter.md).
- `CodeToolError` shape and `cause` enum — [Error & result model](../reference/errors-and-results.md).
- The `?` operator and bare-object-literal argument rule — [Grammar](../reference/grammar.md).
- Why tool calls are side-effects rather than turns — [Guide](../guide.md).

## Provenance

- Spec: `docs/spec_topics/tool-calls.md` (bare-name call form, argument shape,
  return type, failures), `docs/spec_topics/functions.md`,
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md` (`tools`, FRNT-2),
  glossary entries *callable set*, *Pi tool* vs *`.theta` callable*.
- Example `call-tool.theta` requested from `theta-docs-example-runner`.
