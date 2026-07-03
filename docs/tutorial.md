# Tutorial: your first loom

This is one continuous path from an empty session to a loom that invokes a
subagent and reads a typed value back across the boundary. Work the steps in
order — each builds on the last. You write nothing from scratch: every step runs
a real, checked-in file under [`docs/examples/`](./examples/), so you can
reproduce every result on your own machine.

For *why* looms are shaped this way, read the [Guide](./guide.md). For exact
behaviour, the [Reference](./reference/) holds the normative detail; this tutorial
links into it rather than restating it.

## What you need

- `pi` installed and on your `PATH`.
- A configured provider and model. The steps below issue real turns against your
  provider; without one, `pi` reports `needs-provider` and no turn is sent.
- A checkout of this repository, so the example files resolve under
  `docs/examples/`.

Every example is invoked the same way — by its filename stem, as a slash command,
with the example directory placed on the discovery path via `--loom`:

```
pi --loom docs/examples -p "/<stem> <arguments>"
```

`--loom <path>` is one of the [five discovery
sources](./reference/discovery-cli.md#the-five-discovery-sources); it registers
every `*.loom` in the directory as a slash command for that run.

### One fact to carry through the tutorial

Looms run under one of two [execution
modes](./spec_topics/glossary.md), set by frontmatter `mode:`, and the mode
governs what you can observe on `pi -p` stdout:

- **[Prompt mode](./reference/discovery-cli.md#slash-command-invocation)** drives
  your existing session. Assistant tokens stream into the transcript, so a
  prompt-mode loom's trailing turn is visible on stdout.
- **[Subagent mode](./reference/discovery-cli.md#slash-command-invocation)**
  spawns a fresh, isolated conversation whose transcript is private and discarded
  when the loom returns. A subagent loom's [final
  value](./reference/errors-and-results.md#final-value-fn-5) reaches programmatic
  callers and propagates across the subagent boundary, but it is **not** printed
  on the `pi -p` text channel. A successful subagent run surfaces as exit 0 with
  empty stdout.

Steps 1–2 illustrate what you can see on stdout. Steps 3–5 run in subagent mode;
they complete successfully (exit 0), and the tutorial is explicit about where the
value lives when stdout is empty. Every step below records its actual observed
runtime status — no transcript is imagined.

## Step 1 — Run your first loom (prompt mode)

The smallest useful loom is a single model turn. Here is the whole file,
[`docs/examples/hello.loom`](./examples/hello.loom):

```loom
---
description: "Minimal discovered loom for the host-integration recipe"
mode: prompt
---
@`Say hello and confirm the loom extension is wired up.`
```

Two parts. The YAML frontmatter declares `mode: prompt`. The body is a single
**query template**: the `@` before a backtick string marks that string as text to
send to the model as a query. This is the primitive that crosses code → model.
The query-template form is part of the [expression
sublanguage](./reference/grammar.md#expression-sublanguage).

Run it:

```
pi --loom docs/examples -p "/hello"
```

Observed: exit 0, a [success terminal
outcome](./reference/errors-and-results.md#terminal-outcomes-closed-set). Because
this is prompt mode, the assistant turn streams onto stdout — a greeting followed
by a short confirming line. The exact wording is model-generated and
non-deterministic; treat it as illustrative. What is stable is the shape: one
completed assistant turn, exit 0, no error.

## Step 2 — Interpolate values into a query with the `@` operator

A query template is more than a fixed string. Inside a template, `${...}` splices
a value into the text sent to the model. To get a value to splice, a loom takes
typed parameters. Here is
[`docs/examples/arg-binding.loom`](./examples/arg-binding.loom):

```loom
---
description: "Summarise a file for a given audience"
argument-hint: "<path> for <audience>"
mode: subagent
bind_echo: true
params:
  path: string
  audience: string
---
@`Summarise the file at ${path} for an audience of: ${audience}.`
```

New pieces:

- `params:` declares two typed inputs. On a slash invocation, your free-form
  argument string is mapped onto these typed parameters by the
  [binder](./reference/frontmatter.md#params).
- `${path}` and `${audience}` interpolate those parameters into the query text.
  The interpoland renders by its Loom static type per the [template
  interpolation](./reference/frontmatter.md#template-interpolation) rules.
- `bind_echo: true` prints a one-line envelope showing what the binder resolved,
  before the loom runs.

Run it with an argument string:

```
pi --loom docs/examples -p "/arg-binding README.md for new hires"
```

Observed: exit 0. The bind echo is printed to stdout:

```json
{"kind":"ok","args":{"path":"README.md","audience":"new hires"}}
```

That envelope is the observable proof that the binder mapped the free-form string
onto the two typed `params`. This loom is `mode: subagent`, so its trailing query
runs inside an isolated conversation; the query's own turn is not on stdout, and
the run ends at exit 0. The bind echo is the part you see.

## Step 3 — Return a typed value with a schema

So far the model's reply has been free text. A loom can instead demand structured
output that conforms to a declared schema, and bind the parsed result to a
variable. Here is [`docs/examples/sentiment.loom`](./examples/sentiment.loom):

```loom
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

What is new:

- `schema Sentiment { ... }` declares an object schema in the [schema
  subset](./reference/schema-subset.md#the-subset) Loom lowers to JSON Schema.
  `label` is a literal-union type; `confidence` is a number.
- `let result: Sentiment = @\`...\`` makes this a **typed query**. The annotation
  `: Sentiment` is a [type sink](./spec_topics/glossary.md): it supplies the
  schema the model's response is validated against. A conforming response is
  parsed into `result`; a non-conforming one enters the respond-repair loop and,
  if unrecovered, returns an `Err`.
- The trailing `?` is the [error-propagation
  operator](./reference/grammar.md#-operator): on `Ok` it unwraps to the inner
  value; on `Err` it early-returns the `Err` from the top-level loom.
- The final line, `result`, is the loom's tail expression — its [final
  value](./reference/errors-and-results.md#final-value-fn-5).

`text` is a single `string` parameter with no default, so the binder is bypassed
and the whole argument string becomes `text`. Run it:

```
pi --loom docs/examples -p "/sentiment I love this new build"
```

Observed: exit 0, a success terminal outcome. This is subagent mode, so stdout is
empty on success — the typed `Sentiment` value is the loom's final value, which
propagates across the subagent boundary to a programmatic caller but is not
printed on the `pi -p` text channel. Step 5 consumes exactly such a value in code,
where you can act on it.

## Step 4 — Call a tool from loom code

Loom code can call a tool directly, not only through the model. A loom declares
its [callable set](./reference/frontmatter.md#tools-callable-set) in `tools:`, and
calls an entry by its bare name. Here is
[`docs/examples/call-tool.loom`](./examples/call-tool.loom):

```loom
---
description: Count TODO markers under src
mode: subagent
tools: grep
---
let hits = grep({ pattern: "TODO", path: "src" })?
@`How many TODO markers appear in this grep output? ${hits}`
```

What is new:

- `tools: grep` puts the `grep` Pi tool in this loom's callable set. The host
  session's ambient tools are not inherited; a loom sees only what its `tools:`
  declares.
- `grep({ pattern: "TODO", path: "src" })` is a code-driven tool call. The single
  object argument matches the tool's input schema. The call returns a
  `Result`; the `?` unwraps it (or early-returns on failure).
- `hits` — the tool's output — is then interpolated into a query, so the model
  reasons over a value that deterministic code produced.

This loom takes no parameters. Run it:

```
pi --loom docs/examples -p "/call-tool"
```

Observed: exit 0, a success terminal outcome. Subagent mode again: stdout is
empty on success. The point of this step is the mechanics — a tool call in code,
its result flowing into a query — which complete without error.

## Step 5 — Invoke a subagent and read its typed final value

The last step composes the previous two: one subagent loom invokes another and
consumes the typed value the callee returns across the subagent boundary. Here is
[`docs/examples/typed-return.loom`](./examples/typed-return.loom):

```loom
---
description: Invoke a subagent classifier and branch on its typed result
mode: subagent
tools:
  - ./sentiment.loom
params:
  text: string
---
let s = sentiment(text)?
if s.confidence < 0.5 {
  @`The classifier was unsure (${s.label}). Ask a clarifying question.`?
}
@`Acknowledge the ${s.label} sentiment in one line.`
```

What is new:

- The `tools:` entry `./sentiment.loom` is a **`.loom`
  callable** — a path to the subagent loom from Step 3, wrapped as a callable and
  called by its bare stem name, `sentiment`. See [`invoke`
  invocation](./reference/discovery-cli.md#invoke-invocation) for resolution and
  cross-mode rules.
- `sentiment(text)` invokes that callee. Arguments are positional, in `params:`
  order. The callee runs in its own isolated subagent conversation and returns its
  final value — the typed `Sentiment` from Step 3 — across the boundary. The `?`
  unwraps that into `s`.
- `s` is a real typed value in this loom's code: `s.confidence` and `s.label` are
  read to branch. This is the [final value](./reference/errors-and-results.md#final-value-fn-5)
  contract in action — an invoke parent receives the callee's final value as the
  `Ok` payload.
- The tail query is this loom's own final value.

`text` is again a single-string parameter, so pass the text directly:

```
pi --loom docs/examples -p "/typed-return I love this new build"
```

Observed: exit 0, a success terminal outcome. The callee's typed value crosses the
subagent boundary and drives the `if` branch in code. This loom is itself in
subagent mode, so its own final value is not printed on the `pi -p` text channel;
success is exit 0 with empty stdout. The value you learned to produce in Step 3 is
now consumed programmatically in Step 5 — which is where a subagent loom's typed
final value is meant to be read.

## Where to go next

You have run a loom end-to-end through five constructs: a prompt-mode query, `${}`
interpolation with typed params, a typed return with a schema, a code-driven tool
call, and a subagent invoke that returns a typed final value across the boundary.

For single-goal recipes past this path — recovering from a `QueryError`,
configuring the tool-call round budget, sharing a schema from a `.warp` module —
see the [How-to guides](./how-to/). For the model behind it all, read the
[Guide](./guide.md). For exact behaviour, the [Reference](./reference/) is
normative.

## Provenance

Every step runs a checked-in example under [`docs/examples/`](./examples/).
Runtime validation used provider `unity-messages` / model `claude-haiku-4-5`,
loading the working-tree build via
`pi -ne -e ./extensions --loom docs/examples -p "/<stem> ..."`. All five steps
reach a success terminal outcome (exit 0, no runtime panic).

| Step | Example stem | Mode | Observable on stdout | Runtime status |
|---|---|---|---|---|
| 1 | `hello` | prompt | Streamed assistant turn (illustrative; model-generated, non-deterministic) | pass (exit 0) |
| 2 | `arg-binding` | subagent | Bind echo `{"kind":"ok","args":{"path":"README.md","audience":"new hires"}}` | pass (exit 0) |
| 3 | `sentiment` | subagent | None on success (typed final value not on the `pi -p` text channel) | pass (exit 0) |
| 4 | `call-tool` | subagent | None on success | pass (exit 0) |
| 5 | `typed-return` | subagent (invokes `sentiment.loom`) | None on success (typed final value propagated across the subagent boundary, not to stdout) | pass (exit 0) |

Constraint recorded (not a defect): subagent-mode looms run an isolated,
discarded conversation; their final value reaches programmatic callers and
propagates across the subagent boundary but is not observable on `pi -p` stdout.
Prompt mode (Step 1) surfaces its trailing turn on stdout. See
[final value (FN-5)](./reference/errors-and-results.md#final-value-fn-5) and the
[prompt-vs-subagent invocation](./reference/discovery-cli.md#slash-command-invocation)
rules.

- Terminal outcomes, final value: `docs/reference/errors-and-results.md`.
- `@` query template, `?` operator, expression sublanguage:
  `docs/reference/grammar.md`.
- `params:`, `${}` interpolation, `tools:` callable set:
  `docs/reference/frontmatter.md`.
- Schema subset (typed return): `docs/reference/schema-subset.md`.
- Discovery, slash/prompt/subagent invocation, `invoke`:
  `docs/reference/discovery-cli.md`.
- Terminology (prompt mode, subagent mode, callable set, `.loom` callable, type
  sink, final value): `docs/spec_topics/glossary.md`.
</content>
</invoke>
