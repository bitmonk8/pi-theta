# How to bind slash-command arguments

You have a loom with a typed `params:` envelope and you want a user to invoke it
from a slash command with free-form text — `/summarise README.md for new hires` —
without inventing `key=value` syntax. The runtime's LLM-driven *binder* maps the
argument string onto your typed params before the loom runs.

Binding applies **only** to the slash-command path. `invoke(...)` and
`.loom`-callable callers pass already-typed values and skip the binder.

## Steps

1. Declare the parameters you want filled in `params:`. Each field is a type
   expression (see [Frontmatter](../reference/frontmatter.md)).
2. Leave the defaults on `bind_model:`, `bind_context:`, and `bind_echo:` unless
   you need to override them. With no `bind_model:`, the binder uses the
   `looms.binderModel` setting.
3. Optionally add `argument-hint:` — it is passed to the binder as grounding, not
   shown in autocomplete.
4. Invoke the loom by filename with plain text; the binder fills `params`, AJV
   validates them, and a one-line echo note confirms the bound values (suppress
   with `bind_echo: false`).

Two static shapes bypass the binder entirely: a loom with no `params:`, and a
loom whose only parameter is a defaultless `string` (the whole argument string is
assigned verbatim). See the *bypass* rules in
[Discovery & invocation](../reference/discovery-cli.md).

## Working example

[`docs/examples/arg-binding.loom`](../examples/arg-binding.loom) declares two
string params and echoes the bound values before running:

```loom
---
description: "Summarise a file for a given audience"
argument-hint: "<path> for <audience>"
mode: subagent
bind_model: claude-haiku
bind_echo: true
params:
  path: string
  audience: string
---
@`Summarise the file at ${path} for an audience of: ${audience}.`
```

Because this loom's `params:` block is not bypass-eligible (two fields), it needs
a resolvable binder model — `bind_model:` here, or `looms.binderModel` in
settings. With neither resolvable the loom fails to load with
`loom/load/binder-model-unresolved` and does not register.

Run it:

```
pi --loom docs/examples -p "/arg-binding README.md for new hires"
```

## Result

The binder runs **off-session and invisibly** against the resolved binder model
(no user-visible turn, no transcript card): it maps `README.md for new hires`
onto `{ path: "README.md", audience: "new hires" }`, the runtime AJV-validates the
merged args, and — with `bind_echo` on — an echo system note
(`Running /arg-binding: path=README.md, audience="new hires"`) summarises the
bound arguments before the loom's query runs. The binder's internal
`ok | needs_info | ambiguous` envelope never reaches the session. Binding that
cannot resolve the arguments does not run the loom — it surfaces a one-line
failure note (`loom /arg-binding: argument binding needs more info — …`) instead.

## Reference

- Slash invocation, echo, and the binder bypass — [Discovery & invocation](../reference/discovery-cli.md).
- `params:`, `bind_model:`, `bind_context:`, `bind_echo:`, `argument-hint:` field
  contracts — [Frontmatter](../reference/frontmatter.md).
- `loom/load/binder-model-*`, `loom/load/argument-hint-not-displayed`, and the
  bypass warnings — [Diagnostics](../reference/diagnostics.md).
- Why binding exists and where it sits relative to loom code — [Guide](../guide.md).

## Provenance

- Spec: `docs/spec_topics/binder.md`, `docs/spec_topics/slash-invocation.md`
  (SLSH-1), `docs/spec_topics/frontmatter/frontmatter-fields-a.md` (`params:`,
  `bind_*`, `argument-hint`, no-params / single-string bypass), glossary entries
  *binder*, *binder model*, *no-params bypass* / *single-string bypass*.
- Example `arg-binding.loom` requested from `loom-docs-example-runner`; the doc
  cites the checked-in file, not a pasted copy.
