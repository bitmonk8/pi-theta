# Parameters and Frontmatter

Like Pi prompts and subagents, loom files declare metadata in YAML frontmatter:

```yaml
---
description: Programmatic, parameterised code review
argument-hint: "<language> <focus_areas...>"
mode: subagent              # prompt | subagent
model: claude-sonnet-4-5    # model used for every query in this loom
bind_model: claude-haiku    # model used to bind slash-command args to params (default: looms.binderModel in settings.json)
bind_context: none          # none | session — see Slash-Command Argument Binding
bind_echo: true             # echo bound args before execution (default: true)
tools: read, grep, bash     # tools available to the model during query-time tool loops
system: |                   # system prompt for the conversation (subagent-only)
  You are an expert ${language} reviewer.
  Reviewer context: ${author.name} (${author.role}, ${author.experience_years}y).
retry:
  attempts: 3                  # max coercion follow-ups per typed query (default: 3)
  methodology: validator_error # how to phrase coercion turns (default: validator_error)
tool_loop:
  max_iterations: 25           # max model tool-call rounds per query, including the typed-query forced respond turn (default: 25)
params:
  language: string
  focus_areas: array<string>
  author: Author
---
```

### Field contract

The table below is normative: for each recognised V1 field it pins down whether the field is required, what the runtime substitutes when the field is absent, and what observable behaviour the absent case produces. Fields not listed here are not part of the V1 vocabulary and surface as `loom/load/unknown-frontmatter-field` (or `loom/load/deferred-frontmatter-field` for reserved names); see [Diagnostics](./diagnostics.md).

| Field | Required? | Default when absent | Behaviour when absent |
|---|---|---|---|
| `mode` | yes | — | `loom/load/missing-mode` load-time error; the loom is not registered. An unrecognised value (e.g. `mode: agent`) is the separate `loom/load/unknown-mode-value` — "missing" and "present-but-bad" do not collapse into one code, because the authoring intent differs. |
| `description` | no | `null` | The slash-command entry registers without description text; the binder prompt omits the `Description:` line. No warning — internal-only looms legitimately omit this. |
| `argument-hint` | no | `null` | The binder prompt omits the `Argument hint:` line; no autocomplete surface exists for the field in V1 (see [Slash-Command Invocation](./slash-invocation.md) for why — Pi's extension-registered commands have no `argumentHint` slot). Declaring `argument-hint` without `description` emits the advisory `loom/load/argument-hint-not-displayed` so authors are not surprised by an empty-looking dropdown entry. Legal even when `params:` is non-empty; the binder simply has one fewer grounding signal. |
| `model` | no | Pi session's model at invocation time | The loom inherits the caller's model and pins it for the loom's lifetime; documented in the `model` prose below. |
| `bind_model` | no | `looms.binderModel` setting (no further fallback) | Slash-command argument binding uses the fallback model. When neither `bind_model:` nor `looms.binderModel` resolves and the loom is not bypass-eligible, load fails with `loom/load/binder-model-unresolved`. The model must support strict structured-output / strict tool-input or load fails with `loom/load/binder-model-not-strict-capable`. Documented under [Slash-Command Argument Binding](./binder.md). |
| `bind_context` | no | `none` | The binder runs with no caller-session context; documented under [Slash-Command Argument Binding — Binder context](./binder.md). |
| `bind_echo` | no | `true` | Bound args are echoed before execution, except auto-suppressed on the binder bypass; documented under [Slash-Command Argument Binding — Echo policy](./binder.md). |
| `tools` | no | empty callable set | The model cannot make tool calls and loom code has no `<name>(...)` callables; documented in the `tools` prose below. `tools: []` and absent `tools:` are equivalent. |
| `system` | no | no system prompt (the spawned conversation runs under the model's training defaults) | Subagent-mode only; presence on a `mode: prompt` loom is `loom/parse/system-on-prompt-mode`. Documented under the `system` prose below. |
| `retry` | no | `{ attempts: 3, methodology: validator_error }` | Typed queries get the default coercion budget; documented under the `retry` prose below. |
| `tool_loop` | no | `{ max_iterations: 25 }` | Every query (untyped, typed, and any coercion follow-up) runs its tool-call loop under the default cap; documented under the `tool_loop` prose below. |
| `params` | no | no parameters | The loom takes no parameters; the binder does not run regardless of how the loom is invoked. Slash-argument overflow against a no-params loom is governed by [Slash-Command Invocation](./slash-invocation.md) (cross-referenced from [Slash-Command Argument Binding](./binder.md)). `params:` absent and `params: {}` are equivalent; the redundant `params: null` is `loom/load/params-null` (use absent or `{}` instead). `bind_echo: true` on a no-params loom is `loom/load/bind-echo-without-params` (warning) and produces no echo regardless. |

`mode:` is the only required field. The blast-radius asymmetry between `prompt` (turns inject into the user's live Pi session) and `subagent` (a private spawned conversation) is exactly the kind of decision that must not be silent: defaulting one way would either route private looms into the user's session or vice versa, and there is no implementer-neutral choice. An explicit-only rule also lets every load-phase enforcement point (the MVP slash-handler, V3a frontmatter parsing, V12a subagent spawn) converge on the same diagnostic.

Frontmatter mirrors Pi's prompt-template frontmatter (`description`, `argument-hint`) plus loom-specific fields. The two shared fields are not behaviourally identical to Pi's prompt-template versions: `description` populates the autocomplete entry as expected, but `argument-hint` is currently used internally only (binder grounding) because Pi's `RegisteredCommand` API has no `argumentHint` slot for extension-registered commands. **No `name` field** — the filename is canonical, exactly as for Pi prompts (`code-review.loom` is invoked as `/code-review`); see [Discovery — Filename validity](./discovery.md) for the accepted stem regex and the `loom/load/invalid-slash-name` rejection rule. Frontmatter fields outside the V1 vocabulary surface as `loom/load/unknown-frontmatter-field` (warning); fields reserved for deferred V1 features surface as `loom/load/deferred-frontmatter-field` (warning). Both keep loading the loom; see [Diagnostics](./diagnostics.md).

- `params` are validated with AJV at invocation time and exposed as typed variables in the loom body. When invoked from a slash command, the runtime binds free-form slash arguments to `params` via an LLM call (see [Slash-Command Argument Binding](./binder.md)); when invoked from `invoke(...)` or as a registered tool, arguments arrive already typed and are validated directly.
- `bind_model`, `bind_context`, and `bind_echo` configure slash-command argument binding. All three are optional with sensible defaults; see [Slash-Command Argument Binding](./binder.md).
  - **Defaults.** A param may declare a default with `field: type = literal`. The RHS is parsed by the **Loom literal sublanguage** — the same notation Loom uses for value construction in body code, restricted to the production set normatively defined in [Grammar Appendix — Loom literal sublanguage](./grammar.md#loom-literal-sublanguage). Primitive literals (including unary-`-` on numeric literals), `null`, array literals, bare-key object literals (the param's declared type supplies the schema), `Enum.Variant` access, and variant-schema construction (`Cat { ... }`) are all admitted. Operators, function calls, identifier references other than `Enum.Variant`, `${...}` interpolation, and `@`...`` query templates are not; violations are `loom/parse/default-not-literal` and the diagnostic names the offending sub-expression. When a slash-command invocation omits the corresponding positional argument, the default is filled in before AJV validation. The same default-vs-non-default partition is what `invoke(...)` and registered-loom calls use to compute argument arity — see [Invocation — Argument arity](./invocation.md#argument-binding) for the parse-time vs runtime split. Defaults are the only place where literal-valued defaulting exists in V1; schema field declarations do not support defaults (JSON Schema's `default:` is advisory metadata, not provider-enforced, and would mislead authors about what the model emits).

    ```yaml
    params:
      language: string = "TypeScript"
      focus_areas: array<string> = []
      author: Author = { name: "anon", role: "developer", experience_years: 0 }
      severity: Severity = Severity.Medium
      pet: Animal = Cat { name: "Whiskers" }
    ```

    Because the literal sublanguage *is* a subset of the body expression grammar, `Enum.Variant` defaults preserve the runtime enum brand (see [Runtime Value Model](./runtime-value-model.md)) without a separate restoration pass, and discriminated-union variant defaults are written via the variant schema name (`Cat { ... }`) just as they are in body code — there is no second "wire-form" dialect for authors to learn.
- `model` and `tools` follow the same shape as Pi subagent frontmatter and apply to **every** query in the loom — a single loom file shares one model and one callable set across all of its turns.
  - **`model`**: if frontmatter omits `model`, the loom inherits Pi's session default at invocation time. Once chosen, the model is fixed for the loom's lifetime; it does not re-resolve per query.
  - **`tools`**: declares the loom's **callable set** — a unified list of Pi tools and `.loom` paths, callable from both the model (during a query's tool-call loop) and from loom code (via the bare `<name>(...)` call form; see [Tool Calls](./tool-calls.md)). If frontmatter omits `tools`, the loom runs with an **empty callable set** (the model cannot make tool calls and loom code has no `<name>(...)` callables to resolve). The Pi session's ambient tools are deliberately *not* inherited — tools have side effects, and silent inheritance produces "why did my loom touch the filesystem?" surprises. To opt in, list each callable explicitly. `tools: []` and an absent `tools:` field are equivalent. The runtime mechanism that *enforces* the no-inheritance rule (`customTools` + explicit `tools` allowlist on `createAgentSession` for subagent mode; `pi.setActiveTools` snapshot/restore around each query for prompt mode) is specified in [Pi Integration Contract — Tool-registration lifetime and visibility](./pi-integration-contract.md).

    Two kinds of entry are accepted:

    - **Pi tool names** (`read`, `bash`, `grep`, ...) resolve against Pi's tool registry at loom-load time, exactly as for Pi subagents.
    - **`.loom` paths** (`./summarise.loom`, `../shared/classify.loom`) resolve relative to the calling loom's directory, use forward-slash separators only (a backslash is a parse error per the "Path literals" rule in [Lexical Structure](./lexical.md)), must end in `.loom` (otherwise `loom/load/unresolvable-loom-path`), and must point at **subagent-mode** loom files — a prompt-mode callee in `tools:` is `loom/load/prompt-mode-callable` (interleaving the child's user turns inside a parent's tool-call loop is a semantic mess that V1 rejects outright).

    Each entry is exposed under a single name in the loom's top-level scope (and to the model as a tool of the same name). Naming rules:

    - For a Pi tool, the entry's name is the Pi tool name verbatim.
    - For a `.loom` path, the default name is the file's basename without the `.loom` extension, with **hyphens replaced by underscores** (`./code-review.loom` → `code_review`). The remap exists because loom-file naming convention favours hyphens while loom identifiers must be lowercase-first identifier-shaped.
    - The `as <name>` clause overrides the default for either kind: `read as file_read`, `./summarise.loom as my_summariser`. The override target must obey loom's lowercase-first identifier rule (`./summarise.loom as MyTool` is `loom/load/invalid-tool-rename`).
    - Two entries resolving to the same final name are `loom/load/tool-name-collision`; use `as` to disambiguate. A name that collides with a top-level `fn` declaration or an imported symbol in the same file is also `loom/load/tool-name-collision`.

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

    Unknown Pi tool names (`loom/load/unknown-tool`), unresolvable `.loom` paths (`loom/load/unresolvable-loom-path`), `.loom` callees that fail to parse during the load pass (`loom/load/callee-has-errors`, severity `error` for `tools:` entries per [Invocation — Static resolution](./invocation.md#static-resolution)), prompt-mode loom paths (`loom/load/prompt-mode-callable`), name collisions (`loom/load/tool-name-collision`), and invalid `as` targets (`loom/load/invalid-tool-rename`) all surface through the loom diagnostics channel defined in [Diagnostics](./diagnostics.md) and prevent the loom from being registered.

    The parsed callee captured at load time — used both for return-type inference at code-side call sites and for the lowered tool spec exposed to the model — comes from the same per-load-pass parse cache `invoke(...)` static resolution uses (see [Invocation — Static resolution](./invocation.md#static-resolution)). One walk of the reachable graph supplies both surfaces; a callee parsed for `tools:` is not re-parsed when an `invoke(...)` literal in the same parent references it.

    **Resolution snapshot.** Loom-load time resolution produces a frozen per-loom table of `{ post-rename name → resolved callable }` entries. Each Pi-tool entry holds a strong reference to the resolved `ToolDefinition` object (its `execute`, `parameters`, and metadata as returned by Pi's tool registry at the moment of load); each `.loom`-path entry holds a strong reference to the parsed callee plus its lowered tool spec (params → input schema, inferred return → output schema, frontmatter `description` → tool description). Subsequent calls — both model-driven (during a `@`...`` query's tool-call loop) and code-driven (`<name>(args)`) — dispatch through the held reference; the runtime never re-queries Pi's tool registry by name during execution. Consequences:

    - Unregistering a Pi tool from Pi's registry mid-run does not affect calls from a loom that already resolved it; the loom continues to use the captured `execute` function until it terminates.
    - The `unknown_tool` cause on `CodeToolError` (see [Tool Calls](./tool-calls.md)) is reachable only via the file-watcher reload path: when the watcher rebuilds a loom's table and a previously-resolved Pi tool is no longer in Pi's registry, the *next* invocation of the rebuilt loom records `loom/load/unknown-tool` and refuses to register; in-flight invocations against the previously-built table run to completion.
    - For `.loom`-callee entries, the held reference points at the parsed callee version captured at load. File-watcher reloads invalidate the schema cache and rebuild `tools:` tables on the next invocation; an in-flight invocation completes against its captured callee parse.
    - Hot-reloading a Pi extension whose tools are held by a running loom (`ctx.reload()` on the source extension) is out of V1 scope: the captured `execute` closure may reference disposed module state. Authors who need clean swap-out of tool implementations should rely on the full re-discovery semantics of `_loom-reload` (see [Pi Integration Contract](./pi-integration-contract.md)) rather than reloading individual extensions mid-loom.
  - Per-query overrides and a project → loom → query cascade are deferred (see [Future Considerations](./future-considerations.md)).
- `system` declares the conversation's system prompt. **Subagent-mode only** — `system:` in a `mode: prompt` loom is `loom/parse/system-on-prompt-mode`, since prompt-mode looms attach to the user's existing Pi session whose system prompt belongs to Pi, not to the loom. In subagent mode, the field is fixed once when the spawned conversation is created and applies to every query the loom issues against it. If omitted, the spawned conversation has no system prompt (the model behaves under its training defaults).
  - **Interpolation.** The `system:` field supports `${param}` and `${param.field}` interpolation against the loom's typed `params`. The full Loom expression sublanguage is **not** available in this slot — only bare identifier paths — because the system prompt is evaluated once at conversation-creation time, before any loom code runs, and the simpler rule is unambiguous and easy to debug. For richer logic, omit `system:` and accept the reduced control-flow surface. The three surfaces of the slot — what parses, what string the model sees, and which diagnostics fire — are pinned down below.

    *Path grammar.*

    ```
    SystemInterp := '${' Path '}'
    Path         := Ident ('.' Ident)*
    ```

    `Ident` is the lexical identifier from [Lexical Structure — Identifiers](./lexical.md) (case-sensitive, exact byte match against the declared `params` field name). There is no depth bound — arbitrary chains of `.Ident` are accepted. The head `Ident` must name a declared `params` entry; each subsequent `.Ident` must name a reachable field of an *object* schema in the lowered params schema. Arrays, discriminated unions, and primitive scalars terminate the path: `${param}` (no further `.`) is always allowed and is rendered by the stringification rule below; `${param.field}` is only allowed when the resolved type one step in is an object. A path that descends into an arm of a discriminated union without a discriminator narrowing is rejected at parse time — V1 has no narrowing in this slot.

    Indexed access (`${arr[0]}`), call syntax (`${f()}`), optional chaining (`${a?.b}`), arithmetic, and any other expression form are not part of the grammar and produce a parse error (see below). For richer logic, omit `system:` (see [Future Considerations](./future-considerations.md), "Richer expression sublanguage inside frontmatter `system:`").

    *Stringification.* Resolve the path against the validated params object, then render the resolved value by its static type. The rule is the canonical interpolation-stringification table defined once in [Query — Stringification of interpolated values](./query.md): `@`...`` query templates and `system:` paths use the same table so that the model sees the same rendering of a given value regardless of which surface introduced it. Resolution happens once, at conversation-creation time; a param whose resolved value is `null` renders as the literal text `null` (per the canonical table), not the empty string. The `Result<T, E>` row of that table cannot fire here — `params:` types do not include `Result` — and `NaN` / `±Infinity` cannot occur because AJV rejects them at param validation, so the `number` row's edge cases are unreachable from this slot.

    *Escapes.* A literal `${` is written `\${` inside the YAML block scalar — the same escape used in `@`-template bodies (see [Template Interpolation](#template-interpolation)). The backslash survives YAML processing and suppresses interpolation only when the next character is `{`; in any other position `\` is passed through verbatim.

    *Parse errors.* All four codes fire at frontmatter-parse time, before AJV validates the params payload, and are listed in [Diagnostics](./diagnostics.md):

    - `loom/parse/system-interp-not-path` — the body of `${...}` is not a `Path` (e.g. `${arr[0]}`, `${a + b}`, `${f(x)}`, `${a?.b}`, `${"x"}`).
    - `loom/parse/system-interp-unknown-param` — the head `Ident` is not a declared `params` field.
    - `loom/parse/system-interp-bad-field` — a `.Ident` step does not name a reachable object field on the resolved schema (or attempts to descend into an array or un-narrowed discriminated union).
    - `loom/parse/system-interp-unterminated` — `${` is not closed by a matching `}` before the YAML scalar ends.
- `retry` controls how typed queries recover from schema-validation failures (see the [Query](./query.md) section). `attempts` bounds the number of follow-up coercion turns; `methodology` selects the phrasing strategy. Recognised methodologies (V1):
  - `validator_error` (default) — the follow-up turn includes the AJV validation error from the previous attempt.
  - `schema_repeat` — the follow-up turn re-states the expected schema without quoting a specific error.
  - `none` — no follow-up; the first failure is returned as `Err` immediately. Equivalent to `attempts: 0`.
- `tool_loop` bounds the model's tool-call loop (see [Query — Tool-call loop bound](./query.md)). `max_iterations` is a positive integer counting tool-call *rounds*, not individual tool calls; one round is the model emitting one or more `tool_use` blocks, the runtime executing them all (in parallel where the provider supports parallel tool calls), and feeding the results back. The forced respond turn that terminates a typed query also consumes one slot. The cap applies independently to each query and, separately, to each coercion follow-up (a follow-up does **not** inherit a depleted budget from the original turn). When the cap is reached without the model producing a terminating turn, the query returns `Err(QueryError { kind: "tool_loop_exhausted", ... })`. `max_iterations: 0` disables model-driven tool calls entirely — the model cannot use any frontmatter `tools:` entry during the query, while loom code's bare `<name>(...)` calls remain unaffected. The default of 25 is calibrated for the agentic patterns common in V1 looms (read → search → read → write → verify); authors who know their loom needs deeper agentic chains should raise it explicitly. The cap is a ceiling, not a floor: cancellation via `AbortSignal` preempts the loop at any iteration boundary.

## Template Interpolation

A `${...}` interpolation inside a `@`...`` query template contains a Loom expression from the [Expression Sublanguage](./expressions.md), evaluated up to the matching `}`. The `@` character has only one lexical role — introducing a query template at top level — and never appears inside `${...}`. There is no bash-style argument-slice sugar (`${@:N}`, `$1`, `$@`, `$ARGUMENTS`); slash-command arguments are bound to typed `params` via the [Slash-Command Argument Binding](./binder.md) machinery and referenced by their declared parameter names like any other identifier.

The interpolated value's rendering into the prompt text — by the expression's Loom static type, with parse-time rejection of `Result<T, E>` interpolands — is specified once in [Query — Stringification of interpolated values](./query.md). The same canonical table covers the bare-path `${param}` / `${param.field}` form in the `system:` field above.
