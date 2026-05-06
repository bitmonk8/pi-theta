# Overview and Conceptual Model

## Overview

`pi-loom` is a [Pi Coding Agent](https://github.com/badlogic/pi-mono) extension that introduces a purpose-built scripting language for authoring parameterized, programmatic templates that target the code/model boundary. Where Pi's built-in `prompt` and `subagent` features provide parameterized Markdown — static text with YAML frontmatter — `pi-loom` provides a full scripting language whose *side effects are conversational injections* into the current or a new agent context.

A `.loom` file is neither a TypeScript module nor a Markdown prompt: it interleaves code-side control flow (variables, loops, conditionals, function definitions) with model-side text emissions. Evaluating a loom produces two outputs: a structured sequence of text fragments injected into a conversation context (its primary effect) and, on the success outcome, a final value consumed by programmatic callers (`invoke`, subagent harness). The language-level definition of *final value* is owned by [Function Definitions — Final value](./functions.md#final-value-language-definition); the language's effect surface (queries, tool calls, child invocations — and notably the absence of any file-writing primitive) is owned by [Runtime Value Model — Effects](./runtime-value-model.md#effects). Both outputs are detailed under [Scope of a Loom File](#scope-of-a-loom-file).

---

## Conceptual Model

### Code and Model

A Pi extension is built from three kinds of artefact, each occupying a different position relative to the model:

- **`.ts` extensions** are pure code: deterministic TypeScript with no model interaction.
- **`.md` prompts and subagents** are pure model instructions: text shipped to the LLM with no surrounding logic.
- **`.loom` files** sit on the boundary: deterministic code (variables, loops, conditionals, functions) controls *what* text is sent to the model, and the model's responses flow back as values usable in subsequent code.

The human author orchestrates all three but is not itself a runtime layer.

### Query-and-Await

A `.loom` file is **not** a template that expands to a single prompt. It is a small program that drives a conversation across multiple turns. The primitive that crosses code → model is the **query template** — an `@`-prefixed backtick template:

1. Sends the template's rendered text as the next user turn into the loom's target conversation.
2. Awaits the model's response (servicing any tool-call loop on the way).
3. Returns that response as a value usable in subsequent code-side logic.

Concretely, `@`...`` is an *expression*, not a statement. Every query returns a `Result` (see [Errors and Results](./errors-and-results.md)); the `?` operator unwraps `Ok` and propagates `Err`. The response schema, when typed, is inferred from the surrounding type context (binding annotation, function parameter, return type) — see [Query](./query.md) for full rules:

```loom
let critique = @`Critique this code:\n${code}`?
let score: ReviewScore = @`Rate the critique 1-5: ${critique}`?
```

A loom therefore alternates between loom code (parsing the previous response, branching, looping) and model turns (further queries) for as long as it needs. There is no single emission buffer flushed at the end; each query is its own conversation turn whose result feeds back into loom code.

### Scope of a loom file

Each `.loom` file defines a **loom** — a named, invocable unit. Every loom **declares its own execution mode** in frontmatter (`mode: prompt | subagent`); the choice is the loom author's, not the invoker's. A slash-command user, an `invoke` caller, and a programmatic harness all see the same mode for a given loom — it is a property of the file, not of the call site.

The declared mode determines which conversation the loom's queries run against:

- **`mode: prompt`** — each query runs as a turn in the *caller's current* conversation. Invoked from a slash command, that is the user's session; every turn is user-visible and nothing is hidden. The loom's final `Ok` return value is *not* surfaced to the user as a distinct artefact — the conversation is the user-facing surface, and authors who want the user to see a final value should issue a final query whose text contains it. The return value exists for programmatic consumers (an `invoke` caller, a future loom harness).
- **`mode: subagent`** — a *new, isolated* conversation is spawned for the loom; each query runs as a turn in it. When the loom finishes, only its return value is propagated back to the caller — the intermediate transcript is private to the loom and is not retained by the runtime after the loom returns. Surfacing it for testing, replay, or observability is a future consideration (see `loom test` in [Future Considerations](./future-considerations.md)).

In both modes the loom drives the conversation across however many query turns it needs. The mode selects *which* conversation those turns happen against, not whether the loom is allowed to round-trip with the model. Cross-mode interactions between a calling loom and an invoked loom are tabulated in [Invocation](./invocation.md).
