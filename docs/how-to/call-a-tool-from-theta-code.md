# How to call a tool from theta code

You want deterministic theta code — not the model — to run a tool (read a file,
grep, invoke a helper theta) and use the result. Call it directly with the
bare-identifier form `<name>(args)`, where `<name>` is an entry in the theta's
callable set.

A tool call is **not** a conversation turn: it consumes no model tokens, adds no
turn to the theta's conversation, and does not appear in the transcript. That is
the distinction from an `@`...`` query.

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
code, then feeds the result into a query:

```theta
---
description: Count TODO markers under src
mode: subagent
tools: grep
---
let hits = grep({ pattern: "TODO", path: "src" })?
@`How many TODO markers appear in this grep output? ${hits}`
```

Run it:

```
pi --theta docs/examples -p "/call-tool"
```

## Result

`grep(...)` runs against Pi's tool runtime and returns its output as a `string`;
`?` unwraps `Ok` (or early-returns `Err`). The grep output is interpolated into
the query — no tool-call card and no extra model turn are spent on the grep
itself. A Pi-tool failure surfaces as `Err(CodeToolError { ... })` with a `cause`
of `validation`, `execution`, `cancelled`, or `unknown_tool`.

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
