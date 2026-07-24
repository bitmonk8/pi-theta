# Reference — Frontmatter fields

Every `.theta` file declares metadata in YAML frontmatter. `mode:` is the only
required field. This page carries the normative field-contract table, transcribed
verbatim from its single spec source (see Provenance). Cross-reference link
targets in the table have been flattened to plain-text labels; the normative
wording is unchanged. See [Diagnostics](./diagnostics.md) for every
`theta/load/*` / `theta/parse/*` code named here.

```yaml
---
description: Programmatic, parameterised code review
argument-hint: "<language> <focus_areas...>"
mode: subagent              # prompt | subagent
model: claude-sonnet-4-5    # model used for every query in this theta
bind_model: claude-haiku    # model used to bind slash-command args to params (default: theta.binderModel in settings.json)
bind_context: none          # none | session — see Slash-Command Argument Binding
bind_echo: true             # echo bound args before execution (default: true)
tools: read, grep, bash     # tools available to the model during query-time tool loops
system: |                   # system prompt for the conversation (subagent-only)
  You are an expert ${language} reviewer.
  Reviewer context: ${author.name} (${author.role}, ${author.experience_years}y).
respond_repair:
  attempts: 3                  # max respond-repair follow-ups per typed query (default: 3)
  methodology: validator_error # how to phrase respond-repair turns (default: validator_error)
tool_loop:
  max_rounds: 25               # max free-phase tool-call rounds per query; the typed-query forced respond turn is exempt (default: 25)
params:
  language: string
  focus_areas: array<string>
  author: Author
---
```

## Field contract (normative)

Fields not listed here are not part of the theta 1.0 vocabulary and surface as
`theta/load/unknown-frontmatter-field` (warning), or
`theta/load/deferred-frontmatter-field` (warning) for reserved names; the theta
still loads and registers in both cases.

| Field | Required? | Default when absent | Behaviour when absent |
|---|---|---|---|
| `mode` | yes | — | `theta/load/missing-mode` load-time error; the theta is not registered. An unrecognised value (e.g. `mode: agent`) is the separate `theta/load/unknown-mode-value` — "missing" and "present-but-bad" do not collapse into one code, because the authoring intent differs. |
| `description` | no | `null` | The slash-command entry registers without description text; the binder prompt omits the `Description:` line. No warning — internal-only thetas legitimately omit this. |
| `argument-hint` | no | `null` | The binder prompt omits the `Argument hint:` line; no autocomplete surface exists for the field in theta 1.0 (Pi's extension-registered commands have no `argumentHint` slot; the owning definition of the autocomplete contract is the `argument-hint` autocomplete contract prose). Declaring `argument-hint` without `description` emits the advisory `theta/load/argument-hint-not-displayed` so authors are not surprised by an empty-looking dropdown entry. Legal even when `params:` is non-empty; the binder simply has one fewer grounding signal. |
| `model` | no | Pi session's model at invocation time | The theta inherits the caller's model at invocation time and pins it for the duration of that one invocation; a later invocation of the same theta re-inherits the session model afresh, so a session-model change between two invocations is observed. A present `model:` value that resolves to no available model (a non-string scalar, a malformed reference, a reference matching no available model, or a bare `modelId` ambiguous across providers) is the load-time error `theta/load/model-unresolved` and the theta is not registered — "absent" and "present-but-unresolvable" do not collapse into one behaviour, because the absent case has no load-time registry call. In `mode: subagent`, if the inherited model is itself `undefined` at invocation time (frontmatter `model:` absent and no session model to inherit), the spawn is refused per the Pre-spawn model guard. |
| `bind_model` | no | `theta.binderModel` setting (no further fallback) | Slash-command argument binding uses the fallback model. When neither `bind_model:` nor `theta.binderModel` resolves and the theta is not bypass-eligible, load fails with `theta/load/binder-model-unresolved`. The configured string is matched to a model per the binder-model parse rule. The resolved model is then run through the three-valued strict-capability requirement: an explicit `false` strict-capability indicator fails the load with `theta/load/binder-model-not-strict-capable` (E), while an absent indicator (absent on every Pi-supplied `Model<Api>` under the theta 1.0 Pi-SDK pin) emits `theta/load/binder-model-strict-capability-unknown` (W) and the theta still registers. |
| `bind_context` | no | `none` | The binder runs with no caller-session context. A present value other than `none` or `session` (including non-string scalars) is the separate `theta/load/unknown-bind-context-value` load-time error and the theta is not registered — mirroring the `mode:` recognised-key / unrecognised-value split. |
| `bind_echo` | no | `true` | Bound args are echoed before execution, except auto-suppressed on the binder bypass. |
| `tools` | no | empty callable set | The model cannot make tool calls and theta code has no `<name>(...)` callables. `tools: []` and absent `tools:` are equivalent. |
| `system` | no | no system prompt (the spawned conversation runs under the model's training defaults) | Subagent-mode only; presence on a `mode: prompt` theta is `theta/parse/system-on-prompt-mode`. |
| `respond_repair` | no | `{ attempts: 3, methodology: validator_error }` | Typed queries get the default respond-repair budget. `respond_repair: {}` (block present, sub-keys absent) is equivalent to omitting `respond_repair:` entirely; the defaults apply. |
| `tool_loop` | no | `{ max_rounds: 25 }` | Every query (untyped, typed, and any respond-repair follow-up) runs its tool-call loop under the default cap. `tool_loop: {}` (block present, `max_rounds` absent) is equivalent to omitting `tool_loop:` entirely; the default `25` applies. |
| `params` | no | no parameters | The theta takes no parameters; the binder does not run regardless of how the theta is invoked. Slash-argument overflow against a no-params theta is governed by Slash-Command Invocation — No-params overflow. `params:` absent and `params: {}` are equivalent; the redundant `params: null` is `theta/load/params-null` (use absent or `{}` instead). An explicit `bind_echo: true` on a no-params theta is `theta/load/bind-echo-without-params` (warning) and produces no echo regardless. |

## Naming convention

`description` and `argument-hint` retain Pi's prompt-template spellings verbatim
(Pi's loader keys off the literal YAML string `argument-hint`, so theta inherits
the hyphen). Every theta-defined multi-word field uses underscore separators
(`bind_model`, `bind_context`, `bind_echo`, `tool_loop`, and the nested
`*.max_rounds` / `*.attempts` / `*.methodology` keys). A key of `argument_hint:`
is therefore unrecognised (`theta/load/unknown-frontmatter-field`). There is **no
`name` field** — the filename is canonical (`code-review.theta` → `/code-review`;
stem regex and rejection in [Discovery](./discovery-cli.md)).

**Binder-model root-word convention.** The concept uses the short root `bind_` in
its frontmatter field (`bind_model`) and the long root `binder` in its settings
key (`theta.binderModel`), diagnostic codes (`theta/load/binder-model-*`), section
anchors, and prose ("binder model").

## `params:`

- **Type side.** Each field's RHS is a type expression parsed by the theta type
  grammar (see [Type system](./type-system.md), [Grammar](./grammar.md)). A
  `NamedType` resolves against the file's body-level `schema`/`enum` declarations
  and imported `.thetalib` symbols. Resolution is whole-file — a frontmatter →
  body forward reference resolves. An unresolved named type is
  `theta/parse/unresolved-named-type`.
- **Defaults.** `field: type = literal`. The RHS is the [Theta literal
  sublanguage](./grammar.md#theta-literal-sublanguage) — primitives (incl. unary-`-`
  on numerics), `null`, arrays, bare-key object literals (declared type supplies
  the schema), `Enum.Variant`, variant-schema construction (`Cat { ... }`).
  Operators, calls, non-`Enum.Variant` identifier references, `${...}`, `@`...``
  are not admitted (`theta/parse/default-not-literal`). When a slash-command
  invocation omits the positional argument, the default fills in before AJV
  validation. The default's static type must be compatible with the declared type.
  No non-defaulted field may follow a defaulted field
  (`theta/parse/non-trailing-default`). Defaults are the only literal-valued
  defaulting in theta 1.0; schema field declarations support no defaults.

`params` are AJV-validated at invocation time. From a slash command, free-form
arguments are bound to `params` via an LLM binder; from `invoke(...)` or a
registered tool, arguments arrive already typed and are validated directly.

## `tools:` (callable set)

Declares the theta's **callable set** — a unified list of Pi tools and `.theta`
paths, callable from the model (during a query's tool loop) and from theta code
(bare `<name>(...)`). Absent `tools:` → empty callable set. `tools: []` and absent
are equivalent. The Pi session's ambient tools are **not** inherited.

- **FRNT-2** (callable-set terminology): use `callable set`; avoid `tool set`,
  `theta's tools`, `available tools`.
- **FRNT-3** (`.theta`-callable terminology): use `.theta callable`; avoid
  `registered theta`, `theta callee`. Terminology only; no code/format impact.

Two entry kinds:

- **Pi tool names** (`read`, `bash`, `grep`, ...) — resolve against Pi's tool
  registry at load time; entry name is the Pi tool name verbatim. Unknown →
  `theta/load/unknown-tool`.
- **`.theta` paths** (`./summarise.theta`) — resolve relative to the calling theta's
  directory, forward-slash only, byte-exact lowercase `.theta` extension (else
  `theta/parse/invoke-non-theta-extension`, or `theta/load/unresolvable-theta-path`
  for a `.theta`-ending literal resolving to no file), and must point at a
  **subagent-mode** theta (a prompt-mode callee is `theta/load/prompt-mode-callable`).
  Default name is the basename without `.theta`, hyphens → underscores
  (`./code-review.theta` → `code_review`). `as <name>` overrides for either kind
  (target must be lowercase-first, else `theta/load/invalid-tool-rename`). Two
  entries resolving to the same name, or a collision with a top-level `fn` or
  import, is `theta/load/tool-name-collision`.
- A callee that fails to parse/lower during the parent's load pass is
  `theta/load/callee-has-errors` (severity `error` for `tools:` entries).

**Extension-registered Pi tools (subagent mode).** “Pi's tool registry” is the
*full* registry: the built-ins plus any tool an installed Pi extension
contributes (e.g. `finding_store`, `projection`). In `mode: subagent` an
extension tool named in `tools:` is reachable by the theta's **model** — the
invocation runs the whole callee in a child `pi` process that loads the same
extensions and receives the callable-set names as its active-tool allowlist
(`tools: []` → no tools). Since 0.10.0 theta **code** can dispatch an extension
tool too: a code-side `<name>(...)` call routes through the child's host agent
loop (PIC-61 rung 2 — host-loop dispatch), running deterministically with the
code-supplied arguments and zero model tokens. Code-side dispatch is
**fail-closed** only where no dispatch rung exists — a prompt-mode theta (an
extension tool is inadmissible in a prompt-mode `tools:` anyway) or an in-process
`subagent fn` inline body — where a theta whose code calls an extension tool
refuses to load with `theta/load/extension-tool-unreachable` (distinct from
`theta/load/unknown-tool`, which means the tool is absent from Pi's registry).
The child is granted tool approval up front only when the callable set contains
a *project-local* extension tool (already trusted in the parent session);
otherwise it runs least-privilege. Installed extensions load in the child
(their tools, system-prompt appends, handlers, and providers are present, as in
any Pi session), but no user/project context — context files, skills, prompt
templates — is inherited. See
[Guide — Extension tools in a subagent](../guide.md#extension-tools-in-a-subagent).

**YAML shape.** `tools:` accepts a comma-separated short form and a YAML list
form, both parsed by the same per-entry grammar. `.theta` paths and `as` renames
are legal in either form.

**Resolution snapshot.** Load-time resolution produces a frozen per-theta table of
`{ post-rename name → resolved callable }`. Each Pi-tool entry holds a strong
reference to the resolved `ToolDefinition`; each `.theta`-path entry holds a strong
reference to the parsed callee plus its lowered tool spec. Calls dispatch through
the held reference; the runtime never re-queries Pi's tool registry by name during
execution. The `unknown_tool` cause on `CodeToolError` is reachable only via the
file-watcher reload path.

## `system:`

Subagent-mode only (`theta/parse/system-on-prompt-mode` on a prompt-mode theta).
Fixed once at conversation creation; applies to every query. If omitted, the
spawned conversation has no system prompt.

**Interpolation.** Supports `${param}` and `${param.field}` against the theta's
typed `params` — **bare identifier paths only**, not the full expression
sublanguage:

```
SystemInterp := '${' Path '}'
Path         := Ident ('.' Ident)*
```

The head `Ident` must name a declared `params` entry; each `.Ident` must name a
reachable field of an *object* schema (theta-side names throughout). Arrays,
discriminated unions, and scalars terminate the path. A `\${` is a literal `${`.
Parse errors (all at frontmatter-parse time): `theta/parse/system-interp-not-path`,
`theta/parse/system-interp-unknown-param`, `theta/parse/system-interp-bad-field`,
`theta/parse/system-interp-unterminated`. Stringification uses the canonical
interpolation-stringification table shared with `@`...`` templates.

## `respond_repair:`

`attempts` bounds respond-repair follow-up turns; `methodology` selects phrasing.
Recognised methodologies (theta 1.0):

- `validator_error` (default) — the follow-up turn includes the AJV validation
  error from the previous attempt.
- `schema_repeat` — the follow-up re-states the expected schema without a
  specific error.
- `none` — no follow-up; the first failure is returned as `Err` immediately.
  Equivalent to `attempts: 0`. A non-zero `attempts` is silently ignored under
  `methodology: none` (no diagnostic). `ValidationError.attempts` is `0` on every
  path under `methodology: none`.

An absent `methodology:` defaults to `validator_error`. A value outside the
recognised set (incl. non-string scalars) is `theta/load/unknown-methodology-value`
and the theta is not registered.

## `tool_loop:` (FRNT-1)

`max_rounds` is a non-negative integer (no upper bound). One round = the model
emits one or more `tool_use` blocks, the runtime executes them (in parallel where
supported), and feeds results back. `max_rounds` counts **free-phase** rounds
only; the typed-query forced respond turn is exempt and issued on every typed
query reaching CIO-4's `max_rounds`-final branch, including `max_rounds: 0`. The
cap applies independently to each query, each respond-repair follow-up (fresh
budget, not inherited), and every query inside an `invoke`d callee (which uses the
callee's own `tool_loop`; the parent's budget is not debited). On exhaustion
without a terminating turn: `Err(QueryError { kind: "tool_loop_exhausted", ... })`.
`max_rounds: 0` disables model-driven tool calls (theta code's `<name>(...)` calls
remain unaffected). Out-of-range values (negative, non-integer such as `25.5`,
non-number such as `"25"`, or `null`) are rejected at frontmatter-parse time as
`theta/load/frontmatter-value-out-of-range`; integer-ness is judged on the parsed
value (`25` and `25.0` both accepted). The same rule applies to
`respond_repair.attempts`. No operator-level override in theta 1.0.

## Template interpolation

A `${...}` inside a `@`...`` query template contains a Theta expression from the
[expression sublanguage](./grammar.md#expression-sublanguage), evaluated up to the
matching `}`. The `@` character never appears inside `${...}`. There is no
bash-style argument-slice sugar (`${@:N}`, `$1`, `$@`, `$ARGUMENTS`);
slash-command arguments are bound to typed `params` and referenced by name. The
interpolated value renders by its Theta static type per the canonical
stringification table; `Result<T, E>` interpolands are rejected at parse time
(`theta/parse/interpolated-result`).

## Provenance

- Field-contract table (transcribed verbatim; cross-reference link targets
  flattened): `docs/spec_topics/frontmatter/frontmatter-fields-a.md` (Field
  contract).
- Naming convention, binder-model root-word convention, `params:` type/defaults,
  `tools:` (FRNT-2, FRNT-3): `docs/spec_topics/frontmatter/frontmatter-fields-a.md`.
- `tools:` YAML shape, resolution snapshot, `system:` interpolation,
  `respond_repair:`, `tool_loop:` (FRNT-1), template interpolation:
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`.
- Frontmatter hub: `docs/spec_topics/frontmatter.md`.
- Binder bypass and binder-model resolution referenced from
  `docs/spec_topics/bindings.md`, `docs/spec_topics/binder.md`.
