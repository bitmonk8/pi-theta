# Parameters and Frontmatter

Like Pi prompts and subagents, loom files declare metadata in YAML frontmatter:

```yaml
---
description: Programmatic, parameterised code review
argument-hint: "<language> <focus_areas...>"
mode: subagent              # prompt | subagent
model: claude-sonnet-4-5    # model used for every query in this loom
binder_model: claude-haiku  # model used to bind slash-command args to params (default: Pi setting)
bind_context: none          # none | session — see Slash-Command Argument Binding
bind_echo: true             # echo bound args before execution (default: true)
tools: read, grep, bash     # tools available to the model during query-time tool loops
system: |                   # system prompt for the conversation (subagent-only)
  You are an expert ${language} reviewer.
  Reviewer context: ${author.name} (${author.role}, ${author.experience_years}y).
retry:
  attempts: 3                  # max coercion follow-ups per typed query (default: 3)
  methodology: validator_error # how to phrase coercion turns (default: validator_error)
params:
  language: string
  focus_areas: array<string>
  author: Author
---
```

Frontmatter mirrors Pi's prompt-template frontmatter (`description`, `argument-hint`) plus loom-specific fields. **No `name` field** — the filename is canonical, exactly as for Pi prompts (`code-review.loom` is invoked as `/code-review`).

- `params` are validated with AJV at invocation time and exposed as typed variables in the loom body. When invoked from a slash command, the runtime binds free-form slash arguments to `params` via an LLM call (see [Slash-Command Argument Binding](./binder.md)); when invoked from `invoke(...)` or as a registered tool, arguments arrive already typed and are validated directly.
- `binder_model`, `bind_context`, and `bind_echo` configure slash-command argument binding. All three are optional with sensible defaults; see [Slash-Command Argument Binding](./binder.md).
  - **Defaults.** A param may declare a default with `field: type = literal`. The RHS must be a parse-time literal (string, number, boolean, `null`, or a JSON-shaped object/array literal); no expressions, no `${param}` interpolation. When a slash-command invocation omits the corresponding positional argument, the default is filled in before AJV validation. Defaults are the only place where literal-valued defaulting exists in V1; schema field declarations do not support defaults (JSON Schema's `default:` is advisory metadata, not provider-enforced, and would mislead authors about what the model emits).

    ```yaml
    params:
      language: string = "TypeScript"
      focus_areas: array<string> = []
      author: Author = { name: "anon", role: "developer", experience_years: 0 }
    ```
- `model` and `tools` follow the same shape as Pi subagent frontmatter and apply to **every** query in the loom — a single loom file shares one model and one tool set across all of its turns.
  - **`model`**: if frontmatter omits `model`, the loom inherits Pi's session default at invocation time. Once chosen, the model is fixed for the loom's lifetime; it does not re-resolve per query.
  - **`tools`**: declares the loom's **callable set** — a unified list of Pi tools and `.loom` paths, callable from both the model (during a query's tool-call loop) and from loom code (via the bare `<name>(...)` call form; see [Tool Calls](./tool-calls.md)). If frontmatter omits `tools`, the loom runs with an **empty callable set** (the model cannot make tool calls and loom code has no `<name>(...)` callables to resolve). The Pi session's ambient tools are deliberately *not* inherited — tools have side effects, and silent inheritance produces "why did my loom touch the filesystem?" surprises. To opt in, list each callable explicitly. `tools: []` and an absent `tools:` field are equivalent.

    Two kinds of entry are accepted:

    - **Pi tool names** (`read`, `bash`, `grep`, ...) resolve against Pi's tool registry at loom-load time, exactly as for Pi subagents.
    - **`.loom` paths** (`./summarise.loom`, `../shared/classify.loom`) resolve relative to the calling loom's directory, must end in `.loom`, and must point at **subagent-mode** loom files (a prompt-mode callee in `tools:` is a load-time error — interleaving the child's user turns inside a parent's tool-call loop is a semantic mess that V1 rejects outright).

    Each entry is exposed under a single name in the loom's top-level scope (and to the model as a tool of the same name). Naming rules:

    - For a Pi tool, the entry's name is the Pi tool name verbatim.
    - For a `.loom` path, the default name is the file's basename without the `.loom` extension, with **hyphens replaced by underscores** (`./code-review.loom` → `code_review`). The remap exists because loom-file naming convention favours hyphens while loom identifiers must be lowercase-first identifier-shaped.
    - The `as <name>` clause overrides the default for either kind: `read as file_read`, `./summarise.loom as my_summariser`. The override target must obey loom's lowercase-first identifier rule (`./summarise.loom as MyTool` is rejected).
    - Two entries resolving to the same final name are a load-time error; use `as` to disambiguate. A name that collides with a top-level `fn` declaration or an imported symbol in the same file is also a load-time error.

    YAML-shape: `tools:` accepts the comma-separated short form for plain-name entries and the YAML list form for entries that need an `as` rename:

    ```yaml
    tools: read, grep, bash
    ```

    ```yaml
    tools:
      - read
      - bash
      - ./summarise.loom              # callable as `summarise`
      - ./code-review.loom            # callable as `code_review`
      - ./classify.loom as triage     # callable as `triage`
    ```

    Unknown Pi tool names, unresolvable `.loom` paths, prompt-mode loom paths, name collisions, and invalid `as` targets all surface as Pi-compatible diagnostics that prevent the loom from being registered.
  - Per-query overrides and a project → loom → query cascade are deferred (see [Future Considerations](./future-considerations.md)).
- `system` declares the conversation's system prompt. **Subagent-mode only** — `system:` in a `mode: prompt` loom is a parse error, since prompt-mode looms attach to the user's existing Pi session whose system prompt belongs to Pi, not to the loom. In subagent mode, the field is fixed once when the spawned conversation is created and applies to every query the loom issues against it. If omitted, the spawned conversation has no system prompt (the model behaves under its training defaults).
  - **Interpolation.** The `system:` field supports `${param}` and `${param.field}` interpolation against the loom's typed `params`. The full Loom expression sublanguage is **not** available in this slot — only bare identifier paths — because the system prompt is evaluated once at conversation-creation time, before any loom code runs, and the simpler rule is unambiguous and easy to debug. For richer logic, omit `system:` and accept the reduced control-flow surface.
- `retry` controls how typed queries recover from schema-validation failures (see the [Query](./query.md) section). `attempts` bounds the number of follow-up coercion turns; `methodology` selects the phrasing strategy. Recognised methodologies (V1):
  - `validator_error` (default) — the follow-up turn includes the AJV validation error from the previous attempt.
  - `schema_repeat` — the follow-up turn re-states the expected schema without quoting a specific error.
  - `none` — no follow-up; the first failure is returned as `Err` immediately. Equivalent to `attempts: 0`.

  **When to use which.** `validator_error` is the right default for almost all looms: published evaluations of structured-output repair show error-feedback retries outperform schema-restatement, because they direct the model to the specific failure rather than re-reading the whole contract. Prefer `schema_repeat` only when:

  - The schema is small and the model keeps inventing fields — restating the schema reins it back in better than naming one missing-field error at a time.
  - The validator emits noisy or cascading errors from a single root mismatch (common with deeply nested unions), and the error tree is more confusing than the schema.

  Use `none` on hot paths where any single failure should fast-fail and the loom handles recovery itself with `match`.

## Template Interpolation

A `${...}` interpolation inside a `@`...`` query template contains a Loom expression from the [Expression Sublanguage](./expressions.md), evaluated up to the matching `}`. The `@` character has only one lexical role — introducing a query template at top level — and never appears inside `${...}`. There is no bash-style argument-slice sugar (`${@:N}`, `$1`, `$@`, `$ARGUMENTS`); slash-command arguments are bound to typed `params` via the [Slash-Command Argument Binding](./binder.md) machinery and referenced by their declared parameter names like any other identifier.
