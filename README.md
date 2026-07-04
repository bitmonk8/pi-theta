# pi-loom

`pi-loom` is a [Pi Coding Agent](https://github.com/earendil-works/pi-mono)
extension that adds **Loom**, a scripting language for authoring parameterized,
programmatic templates that target the boundary between code and an LLM.

A `.loom` file interleaves ordinary code — variables, loops, conditionals,
functions — with literal text destined for the model. Evaluating a loom appends
turns to a conversation: the caller's current conversation in *prompt mode*, or a
fresh isolated conversation in *subagent mode*. On the success outcome it also
produces a [*final value*](./docs/reference/errors-and-results.md#final-value-fn-5)
— the loom's tail expression, or the operand of an executed `return` — available
to programmatic callers and propagated across the subagent boundary. The language
has no file-writing, network, or process-spawning primitive; effects of those
kinds occur only through the Pi tools a loom admits in its
[callable set](./docs/reference/frontmatter.md#tools-callable-set).
`.warp` files are library modules that share Loom's grammar and type system and
are imported by `.loom` files; they are never invoked directly.

## The problem

Pi's built-in `prompt` and `subagent` features are parameterized Markdown —
static text with YAML frontmatter. They cannot branch, loop, parse a model's
response, drive a conversation across several turns, or return a typed value to a
programmatic caller. Loom is a full scripting language for those cases: code
decides *what* text is sent to the model, the model's responses flow back as
values, and evaluation resolves to one of three terminal outcomes — success,
failure, or cancellation — defined in
[Errors and Results](./docs/reference/errors-and-results.md#terminal-outcomes-closed-set).

## Status

pi-loom is at **1.0**, its first release. The core language surface is
implemented and exercised end-to-end — the binder, typed queries with schema
validation, code-driven tool calls, `invoke`/subagent value passing, `match`/`?`,
enums, and user functions all work. Some specified behaviour is **not yet fully
wired into the shipped runtime**, so the specification is not yet fully
implemented. Known gaps at this release:

- **Type-layer diagnostics** — static checks that require type inference are
  partial (e.g. a non-boolean `if` condition, indexing a `string`, a
  non-array `for` iterand).
- **Nested control forms in an expression position** — a nested `match` and an
  effectful expression (a user-`fn` call, a tool-call, an `@`-query) in a `match`
  arm body now route through the single runtime executor, but the same forms
  nested deeper inside a wholesale-evaluated pure expression (an object-literal
  field, an array element) may still not evaluate in every position.

Report issues against the behaviour the [Reference](./docs/reference/) defines.

## Documentation

- **[Guide](./docs/guide.md)** — the mental model: how code interleaves with
  model-directed text, why evaluation appends turns, prompt vs. subagent mode,
  `.loom` vs. `.warp`, and the final value.
- **[Tutorial](./docs/tutorial.md)** — one hands-on path that takes a newcomer
  from an empty file to a working loom.
- **[How-to guides](./docs/how-to/)** — goal-directed recipes for competent
  users.
- **[Reference](./docs/reference/)** — exact, normative behaviour: grammar, type
  system, frontmatter fields, error and result model, hard ceilings, diagnostics,
  and the CLI / discovery surface.

## Provenance

- Terminology (`Loom`, `.loom`, `.warp`, *prompt mode* / *subagent mode*, *final
  value*, *callable set*) matches `docs/spec_topics/glossary.md`.
- "What loom is" and "The problem" draw on `docs/spec_topics/overview.md` §Overview
  and §Conceptual Model, and `docs/spec_topics/overview-and-orientation.md`
  §Overview (the success / fail / cancelled trichotomy, the no-file-write effect
  surface, prompt/subagent conversation targeting).
- The `.loom` / `.warp` split draws on
  `docs/spec_topics/overview-and-orientation.md` §"file-extension-grammar" and
  `docs/spec_topics/language-and-architecture.md`.
- Status posture per `docs/documentation-plan.md` §1 and decision D-6 (1.0 first
  release; spec fully implemented; no enumerated rough edges).
- Definition links point into `docs/reference/` (errors-and-results.md,
  frontmatter.md) rather than restating normative detail, per `docs/STYLE.md`.
</content>
</invoke>
