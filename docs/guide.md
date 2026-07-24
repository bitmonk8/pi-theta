# The pi-theta Guide

This is the mental model. It explains *what* a theta is and *why* it is shaped the
way it is: how code interleaves with model-directed text, why evaluation appends
turns to a conversation, what the two execution modes mean, how the `.theta` /
`.thetalib` split works, what the final value is, and how an evaluation ends. It
carries no step-by-step procedure — the [Tutorial](./tutorial.md) teaches the
first run, the [How-to guides](./how-to/) answer "how do I do X", and the
[Reference](./reference/) holds exact, normative behaviour. Definitions are linked
into the Reference rather than restated here.

The code fragments below show the *shape* of a construct. They are not complete
thetas; complete, runnable examples live under `docs/examples/` and are cited from
the Tutorial and How-to guides.

## Where a theta sits: the code/model boundary

A Pi extension is built from three kinds of artefact, each at a different
distance from the model:

- **`.ts` extensions** are pure code — deterministic TypeScript, no model
  interaction.
- **`.md` prompts and subagents** are pure model instructions — text shipped to
  the LLM with no surrounding logic.
- **`.theta` files** sit on the boundary. Deterministic code (variables, loops,
  conditionals, functions) decides *what* text is sent to the model, and the
  model's responses flow back as values the code can inspect and branch on.

Pi's built-in `prompt` and `subagent` features are parameterized Markdown: static
text with YAML frontmatter. They cannot branch on what the model said, loop,
parse a response, or return a typed value to a programmatic caller. A theta is a
scripting language for exactly those cases. Its side effects are *conversational
injections* — the text a theta emits becomes turns in a conversation with the
model.

## A theta is a program, not a template

A `.theta` file does not expand to a single prompt. It is a small program that
drives a conversation across as many turns as it needs. The primitive that
crosses code → model is the **query template** — an `@`-prefixed backtick
template. A query:

1. sends its rendered text as the next user turn into the theta's target
   conversation,
2. awaits the model's response (servicing any tool-call loop on the way), and
3. returns that response as a value usable in subsequent code.

A query is an *expression*, not a statement. It returns a `Result`; the `?`
operator unwraps `Ok` and propagates `Err`. When the surrounding type context
supplies a schema — a binding annotation, a function parameter, a return type —
the response is validated and returned as that type; otherwise it is a string.

```theta
let critique = @`Critique this code:\n${code}`?
let score: ReviewScore = @`Rate the critique 1-5: ${critique}`?
```

Because a query yields a value, control flow can branch on what the model just
said. A loop can review one focus area per iteration and issue a follow-up query
only when the previous answer warrants it; a `while` can keep critiquing a draft
until the model reports it is satisfied. The theta alternates between code (parse,
branch, loop) and model turns for as long as it needs. There is no single
emission buffer flushed at the end — each query is its own turn, and its result
feeds back into code. The sequential loops have a parallel counterpart: `par for`
runs its body concurrently for each element of an array and collects one typed
`Result` per element, for embarrassingly-parallel fan-out over isolated child work
(see [How to fan out in parallel](./how-to/fan-out-in-parallel.md)).

For the query forms, schema inference, and the `respond_repair` loop, see the
[grammar](./reference/grammar.md#-operator) and the
[error & result model](./reference/errors-and-results.md#queryerror-variants);
for the loop and branch forms, see the [grammar](./reference/grammar.md#control-flow).

## Evaluation appends turns to a conversation

Evaluating a theta appends turns to a conversation — one turn per query, in the
order the code issues them. This is the theta's primary effect. When an evaluation
ends, the turns it has already appended stay in the driven conversation; the
runtime performs no implicit rollback of a partially-run theta. Which conversation
those turns land in is decided by the theta's mode.

## Two modes: prompt vs. subagent

Every theta declares its own execution mode in the required `mode:` frontmatter
field. The mode is a property of the file, chosen by the author — not by whoever
invokes it. A slash-command user, an `invoke` caller, and a programmatic harness
all see the same mode for a given theta.

- In **prompt mode**, each query runs as a turn in the *caller's current*
  conversation. Invoked from a slash command, that is the user's session: every
  turn is user-visible and nothing is hidden. The theta's final return value is
  *not* surfaced to the user as a distinct artefact — the conversation is the
  user-facing surface. An author who wants the user to see a result issues a
  final query whose text contains it.
- In **subagent mode**, a fresh, isolated conversation is spawned for the theta.
  Each query runs as a turn in it. When the theta finishes, only its return value
  propagates back to the caller; the intermediate transcript is private and is
  not retained after the theta returns.

The mode selects *which* conversation the turns happen against — not whether the
theta is allowed to round-trip with the model. Both modes drive a conversation
across however many turns the code issues. The two modes also differ in which
frontmatter fields are accepted (for example `system:` is subagent-only) and in
which Pi APIs the runtime calls; see the
[frontmatter reference](./reference/frontmatter.md#field-contract-normative).

The two modes compose. A theta can invoke another theta with `invoke(...)`, and the
*callee's* mode decides whether the child attaches to the caller's conversation
or spawns its own. The full cross-mode matrix — what a prompt-mode parent sees
when it invokes a subagent-mode child, and the three other combinations — is in
the [invoke invocation reference](./reference/discovery-cli.md#invoke-invocation).

A fresh isolated session does not always need a second file. A `subagent fn`
(theta 1.2) is a `fn` whose body runs in its own spawned session on every call, so
an `@` query in that body targets the spawned session rather than the enclosing
conversation — the in-file counterpart of invoking a subagent-mode child. It
inherits the enclosing theta's configuration by default, with an optional
`with { system, model, tools, tool_loop, respond_repair }` clause to override any
subset. This is what makes a per-iteration fresh context expressible in a single
file (see [How to write an agent loop](./how-to/write-an-agent-loop.md)).

## The final value

On the success outcome, evaluation also produces a **final value**: the value of
the theta's tail expression, or — if an explicit `return expr` executes first —
the operand of that `return`. The final value is for programmatic consumers: an
`invoke` caller reads it, and it is the payload that crosses the subagent
boundary. It is distinct from the conversation. In prompt mode the user never
sees it directly; in subagent mode it is the *only* thing the caller gets back.
Use `invoke<Schema>(...)` when the caller needs the value typed and validated; an
untyped `invoke(...)` discards the child's return value and exists for
fire-and-forget orchestration. The exact rule is the
[final-value contract](./reference/errors-and-results.md#final-value-fn-5).

## The success / fail / cancelled trichotomy

Once evaluation has begun, it produces exactly one of three terminal outcomes:

- **Success** — evaluation ran to the end; turns were appended and a final value
  is available to programmatic callers.
- **Fail** — the theta returned an unhandled `Err`, panicked, or breached a
  query-terminating [hard ceiling](./reference/hard-ceilings.md) (for example the
  per-query tool-loop bound, or the invoke-chain depth cap).
- **Cancelled** — the theta's abort signal fired and a checkpoint observed it.

A failure is only a *fail* outcome if it goes unhandled. Queries and invokes
return `Result<T, QueryError>`; a caller that consumes an `Err` with `match`, or
discards it, keeps evaluation on the success arm. Propagating an `Err` with `?`,
or letting a panic escape, is what reaches the *fail* arm. Because query and
invoke failures share the single `QueryError` type, a function that mixes `?` on
queries and `?` on invokes still has one `Result` return type and one `match`
shape to handle. The closed set of outcomes, the per-cause caller surfaces, and
the `QueryError` variant schemas are owned by the
[error & result model](./reference/errors-and-results.md#terminal-outcomes-closed-set).

Two boundaries matter for the mental model. First, failures that occur *before*
evaluation begins — a slash-command argument-binding failure, a load error — are
not evaluation outcomes; they never enter the trichotomy. Second, cancellation is
observed only at fixed checkpoints (before each loop iteration, before each query,
tool call, and invoke), and propagates *downward* only: a child cancelling
internally surfaces to its parent as an `Err` the parent may handle or propagate.
An operation that has already returned `Ok` keeps its value even if the signal
fires immediately after — the runtime does not retroactively rewrite a completed
result into a cancellation.

## `.theta` versus `.thetalib`

A theta is stored in one of two file extensions that share a single grammar and
type system:

- **`.theta`** files are invocable — discovered as slash commands, targeted by
  `invoke(...)`, and registrable in another theta's `tools:`. A `.theta` file
  declares a `mode:` and runs.
- **`.thetalib`** files are library modules. Their top level is restricted to
  declaration forms — `import`, `export`, `fn`, `schema`, `enum` — with no
  top-level statements or queries. A `.thetalib` file is never discovered as a slash
  command and is never invoked directly; it is reached only through `import`.

```theta
import { Author, persona_block } from "./shared/personas.thetalib"
```

The file-extension split is the language's only structural separation between
callable surface and reusable building blocks. Code inside a `.thetalib` `fn` body
uses the full language, including queries; when such a function is called, its
queries execute against the *calling* `.theta`'s conversation. Import paths are
relative and must end in `.thetalib`; the resolution and re-export rules are in the
[grammar reference](./reference/grammar.md#source-files).

## What a theta cannot do

The Theta language has no file-writing, network, or process-spawning primitive.
Every external effect a theta produces flows through one of three surfaces: a query
against the model, a tool call, or a child theta invocation. The set of tools the
model and theta code can reach is the theta's **callable set** — the entries listed
under the `tools:` frontmatter field (in subagent mode an extension-tool entry
is reachable by both the model and, since 0.10.0, theta code — see below). If
`tools:` is omitted the theta runs with an
empty callable set; the host session's ambient tools are deliberately not
inherited. The callable set bounds what the *model* can reach; it is not a
host-process sandbox, and any tool a theta admits exposes that tool's full
capability. The effect surface and the trust posture are owned by the
[frontmatter reference](./reference/frontmatter.md#tools-callable-set) and the
[type-system reference](./reference/type-system.md#effects).

Of the three effect surfaces, a tool call is the one that produces a side effect
without a model turn: `read({ path: p })` runs the tool and returns its result as
a value, spending no tokens and adding no turn to the conversation. The
argument is written inline as a bare object literal — its *shape* comes from the
tool's registered input schema — but its *field values* are full expressions, so a
computed value (a `let`-bound identifier, an operator result, another call's
output) reaches the tool channel directly rather than being routed through a query.
The argument grammar and the schema-conflict check are owned by the
[grammar reference](./reference/grammar.md#pi-tool-argument-grammar).

## Extension tools in a subagent

A `tools:` entry names either a Pi tool or a `.theta` callable. In **subagent
mode** Pi tool names resolve against Pi's full tool registry — the built-ins
(`read`, `bash`, `edit`, `write`, ...) and any tool an installed Pi extension
contributes (for example `finding_store` or `projection`). In **prompt mode**
resolution is built-ins-only: a `tools:` entry naming an extension tool fails
load with `theta/load/unknown-tool`.

In **subagent mode** an extension tool listed in `tools:` is reachable by both
the theta's **model** and its **code**. A subagent-mode invocation runs the
whole callee — the interpreter included — in a spawned child `pi` process that
performs Pi's normal extension discovery, so the same extension tools are
registered there; the callable-set names become the child's active-tool
allowlist and the model may call them during a query's tool loop. (The callee's
`params:` are marshalled into the child structurally and its typed final value
returns as a single `theta_result` line on the child's stdout — mechanics you
never write by hand; see [How to return a typed value across a subagent boundary](./how-to/return-a-typed-value-across-a-subagent-boundary.md).)

Since 0.10.0 theta **code** can also dispatch an extension tool from a
subagent-mode theta. A code-side `<name>(...)` call is routed through the
child's own host agent loop (PIC-61 rung 2 — *host-loop dispatch*): the
runtime registers a theta-controlled provider that authors the `tool_use` with
the code-supplied arguments verbatim, the child's host loop runs the call, and
the runtime reads the result back — deterministic arguments, zero model tokens,
no executable definition ever obtained by theta code. Its costs (a fabricated
turn in the child's discarded transcript and a temporary child-session model
switch) are confined to the child's private `--no-session` session. Code-side
dispatch stays **fail-closed** only where no dispatch rung exists — a
prompt-mode theta (whose `tools:` cannot name an extension tool at all) or an
in-process `subagent fn` inline body: there a theta whose code calls an
extension tool refuses to load with `theta/load/extension-tool-unreachable`,
naming the tool. An unknown tool name is a separate **load-time** error
(`theta/load/unknown-tool`) — a typo or a missing extension refuses
registration loudly instead of degrading at run time.

Because the child loads installed extensions, their non-tool contributions
(system-prompt additions, handlers, providers) are also present — as in any Pi
session. What is *not* inherited is your user and project context: context files,
skills, and prompt templates do not cross into the subagent. The child runs with
tool approval pre-granted only when the callable set includes a project-local
extension tool (one you already trusted in this project); otherwise it runs with
least privilege. Full recipe: [How to use an extension tool in a
subagent](./how-to/use-an-extension-tool-in-a-subagent.md).

## Where to go next

- [Tutorial](./tutorial.md) — one worked path from an empty file to a running
  theta.
- [How-to guides](./how-to/) — recipes for specific goals.
- [Reference](./reference/) — grammar, type system, frontmatter, the error and
  result model, hard ceilings, diagnostics, and the discovery / CLI surface.

## Provenance

- Code/model boundary and the three-artefact framing:
  `docs/spec_topics/overview.md` §"Code and Model" and §Overview.
- Query-and-await ("a theta is a program, not a template", the query expression
  returning a `Result`, schema inference from the surrounding type context):
  `docs/spec_topics/overview.md` §"Query-and-Await" and
  `docs/spec_topics/query.md`. Branch-on-response framing:
  `docs/spec_topics/control-flow.md`. The `critique`/`score` and `import`
  fragments are the illustrative fragments from those spec pages.
- "Evaluation appends turns" and the partial-append / no-rollback framing:
  `docs/spec_topics/overview-and-orientation.md` §Overview (terminal-outcomes
  aggregator) and `docs/spec_topics/errors-and-results.md`.
- Prompt vs. subagent mode, mode as a per-file author choice, final value not
  surfaced to the user in prompt mode, private discarded subagent transcript:
  `docs/spec_topics/overview.md` §"Scope of a theta file",
  `docs/spec_topics/glossary.md` (*prompt mode* / *subagent mode*). Cross-mode
  composition: `docs/spec_topics/invocation.md` §"Cross-mode semantics".
- Final value (tail expression or `return` operand; typed vs. untyped `invoke`):
  `docs/spec_topics/overview-and-orientation.md` §Overview and
  `docs/spec_topics/invocation.md` §"Typed return" / §"Final-value propagation".
- Success / fail / cancelled trichotomy, pre-evaluation failures excluded, the
  unhandled-vs-handled `Err` rule, single `QueryError` type:
  `docs/spec_topics/overview-and-orientation.md` §"terminal-outcomes-aggregator",
  `docs/spec_topics/invocation.md` §Failures.
- Cancellation checkpoints, downward-only propagation, no retroactive rewrite of a
  completed `Ok`: `docs/spec_topics/cancellation.md` (§Granularity, §Propagation,
  CNCL-5).
- `.theta` vs. `.thetalib`, shared grammar/type system, five permitted `.thetalib`
  top-level forms, thetalib `fn` queries running against the caller's conversation:
  `docs/spec_topics/overview-and-orientation.md` §"file-extension-grammar",
  `docs/spec_topics/imports.md`, `docs/spec_topics/glossary.md`
  (*`.thetalib` file*, *theta (file unit)*).
- Tool call as the code-driven, zero-turn effect channel, and its argument field
  values being full expressions (not literals): `docs/spec_topics/tool-calls.md`
  §"No conversation turn" / §"Argument shape", `docs/rfcs/0002-computed-tool-arguments.md`.
- No file/network/process primitive; effects only via query, tool call, invoke;
  callable set bounds the model's reach and is not a sandbox:
  `docs/spec_topics/runtime-value-model.md` §Effects,
  `docs/spec_topics/overview-and-orientation.md` §"Trust boundary",
  `docs/spec_topics/glossary.md` (*callable set*).
- Whole-callee child-process execution, extension tools reachable by a
  subagent's model (`[0.9.0]`) and, via host-loop dispatch, by its code
  (`[0.10.0]`), the code-side fail-closed refusal
  (`theta/load/extension-tool-unreachable`) now scoped to no-rung contexts, the
  project-local trust rule, and
  extension ambience vs. no user/project context: `CHANGELOG.md` `[0.10.0]` /
  `[0.9.0]`,
  `docs/spec_topics/pi-integration-contract/subagent.md`
  ([PIC-58](./spec_topics/pi-integration-contract/subagent.md#pic-58)…[PIC-63](./spec_topics/pi-integration-contract/subagent.md#pic-63),
  §*Isolation and trust*, §*`--tools` / `--no-tools` allowlist suppression*,
  state-isolation matrix),
  `docs/rfcs/0006-child-process-theta-execution.md`.
- Terminology (`Theta`, `.theta`, `.thetalib`, *prompt mode* / *subagent mode*,
  *final value*, *callable set*, *query-terminating*) matches
  `docs/spec_topics/glossary.md`.
- Definition links point into `docs/reference/` rather than restating normative
  detail, per `docs/STYLE.md` and `docs/documentation-plan.md` §3.
