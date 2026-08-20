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
| `description` | no | `null` | The slash-command entry registers without description text; the binder prompt omits the `Description:` line. No warning — internal-only thetas legitimately omit this. Line breaks in the value each collapse to one space in the binder prompt's `Description:` line, and leading/trailing whitespace of the collapsed result is trimmed. |
| `argument-hint` | no | `null` | The binder prompt omits the `Argument hint:` line; no autocomplete surface exists for the field in theta 1.0 (Pi's extension-registered commands have no `argumentHint` slot; the owning definition of the autocomplete contract is the `argument-hint` autocomplete contract prose). Declaring `argument-hint` without `description` emits the advisory `theta/load/argument-hint-not-displayed` so authors are not surprised by an empty-looking dropdown entry. Legal even when `params:` is non-empty; the binder simply has one fewer grounding signal. Line breaks in the value each collapse to one space in the binder prompt's `Argument hint:` line, and leading/trailing whitespace of the collapsed result is trimmed. |
| `model` | no | Pi session's model at invocation time | The theta inherits the caller's model at invocation time and pins it for the duration of that one invocation; a later invocation of the same theta re-inherits the session model afresh, so a session-model change between two invocations is observed. A present `model:` value that resolves to no available model (a non-string scalar, a malformed reference, a reference matching no available model, or a bare `modelId` ambiguous across providers) is the load-time error `theta/load/model-unresolved` and the theta is not registered — "absent" and "present-but-unresolvable" do not collapse into one behaviour, because the absent case has no load-time registry call. In `mode: subagent`, if the inherited model is itself `undefined` at invocation time (frontmatter `model:` absent and no session model to inherit), the spawn is refused per the Pre-spawn model guard. |
| `bind_model` | no | `theta.binderModel` setting (no further fallback) | Slash-command argument binding uses the fallback model. When neither `bind_model:` nor `theta.binderModel` resolves and the theta is not bypass-eligible, load fails with `theta/load/binder-model-unresolved`. The configured string is matched to a model per the binder-model parse rule. The resolved model is then run through the three-valued strict-capability requirement: an explicit `false` strict-capability indicator fails the load with `theta/load/binder-model-not-strict-capable` (E), while an absent indicator (absent on every Pi-supplied `Model<Api>` under the theta 1.0 Pi-SDK pin) emits `theta/load/binder-model-strict-capability-unknown` (W) and the theta still registers. The load-time refusal does not apply to the marked root theta of a spawned subagent child (the subagent-root exemption). |
| `bind_context` | no | `none` | The binder runs with no caller-session context. A present value other than `none` or `session` (including non-string scalars) is the separate `theta/load/unknown-bind-context-value` load-time error and the theta is not registered — mirroring the `mode:` recognised-key / unrecognised-value split. |
| `bind_echo` | no | `true` | Bound args are echoed before execution, except auto-suppressed on the binder bypass. |
| `tools` | no | empty callable set | The model cannot make tool calls and theta code has no `<name>(...)` callables. `tools: []` and absent `tools:` are equivalent. A value outside the two admitted spellings (a mapping, an alias, or a key with no value node — only `? tools` and a flow-mapping `{tools}` carry no value node; a bare `tools:` parses as a null scalar and keeps `theta/load/unknown-tool`) is `theta/load/malformed-tools-field`; the theta does not register. |
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
  `theta/parse/unresolved-named-type`. The RHS is inline text, not a YAML
  structure: a value that is neither a scalar nor a flow mapping (a block
  mapping or block sequence under the field name, a flow sequence, an alias,
  or any other node kind), or a field with no value node at all (an explicit
  key `? p`; a value-less flow member, as in `params: {p}`), is
  `theta/load/params-type-not-expression` and the theta does not register. A
  value-less `p:` (or `params: {p: }`) parses as a null scalar and is
  admitted. The inline object type `{a: Triage}` is a YAML flow mapping and is
  admitted. A scalar's recovered text must itself spell a `Type`, fragment by
  fragment — YAML-shaped text, prose, punctuation, or an empty string is the
  same `theta/load/params-type-not-expression`, however it is quoted or
  block-scalar-spelled, and wherever the fragment sits: at the top level, in a
  union arm at any depth, in a generic type argument (`array<a: Triage>`), or
  in an inline object type's field type at any depth (`{a: ???}`, `{a: {b:
  ???}}`). "Fragment" ranges over text the source itself spells; a fragment the
  generic-argument split MANUFACTURES by cutting a `{...}`/`[...]` group the
  author wrote as one unit (`array<{a: string, b: integer, c: boolean}>`'s
  middle shard, `b: integer`) is excluded and reaches no judgement. The
  exclusion is per SEGMENT of that split: a whole argument of the same list
  keeps its judgement (`array<{a: string, b: integer, c: boolean}, ???>` refuses
  on `???`), and junk the author wrote INSIDE a manufactured shard is admitted
  — an under-refusal, deliberate: `array<{a: Cat +, b: integer, c: boolean}>`
  and `array<{a: string, b: integer, c: boolean} | Cat +>` draw nothing.
  Literal-shaped text is exempt, and so is a fragment that reaches the
  check carrying a `{` or `}` — `{junk}`, the unterminated `{a: string`,
  `array<{a: ???}>` and `string | {a: ???}` keep their own lowering, which the
  brace frame owns; a brace-free fragment inside a hoisted inline object does
  not inherit that exemption. A field already refused or already erroring keeps
  that one diagnostic alone, and a refused type suppresses that field's own
  default-literal checks.
- **Defaults.** `field: type = literal`. The RHS is the [Theta literal
  sublanguage](./grammar.md#theta-literal-sublanguage) — primitives (incl. unary-`-`
  on numerics), `null`, arrays, bare-key object literals (declared type supplies
  the schema), `Enum.Variant`, variant-schema construction (`Cat { ... }`).
  Operators, calls, non-`Enum.Variant` identifier references, `${...}`, `@`...``
  are not admitted (`theta/parse/default-not-literal`). An RHS that is empty or
  whitespace-only after trim spells no arm at all and is
  `theta/parse/default-without-literal`. A raw line break
  inside a string literal is refused too (`theta/parse/literal-newline-in-string`);
  use the `\n` escape, or move the value into body code. When a slash-command
  invocation omits the positional argument, the default fills in before AJV
  validation. The default's static type must be compatible with the declared type
  (`theta/parse/params-default-type-mismatch`; a `number` under `integer` is
  `theta/parse/integer-narrowing`).
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
are equivalent. The Pi session's ambient tools are **not** inherited. A `tools:`
value that is present but is neither of the two admitted spellings — a mapping,
an alias, or a key carrying no value node at all — is `theta/load/malformed-tools-field`;
the theta does not register.

- **FRNT-2** (callable-set terminology): use `callable set`; avoid `tool set`,
  `theta's tools`, `available tools`.
- **FRNT-3** (`.theta`-callable terminology): use `.theta callable`; avoid
  `registered theta`, `theta callee`. Terminology only; no code/format impact.

Two entry kinds:

- **Pi tool names** (`read`, `bash`, `grep`, ...) — resolve against Pi's tool
  registry at load time (the `pi.getAllTools()` snapshot, in both modes); entry
  name is the Pi tool name verbatim. Unknown → `theta/load/unknown-tool`.
- **`.theta` paths** (`./summarise.theta`) — resolve relative to the calling theta's
  directory, forward-slash only, byte-exact lowercase `.theta` extension (else
  `theta/parse/invoke-non-theta-extension`, or `theta/load/unresolvable-theta-path`
  for a `.theta`-ending literal resolving to no file), and must point at a
  **subagent-mode** theta (a prompt-mode callee is `theta/load/prompt-mode-callable`).
  Default name is the basename without `.theta`, hyphens → underscores
  (`./code-review.theta` → `code_review`); a derived name outside the
  lowercase-first rule is `theta/load/invalid-derived-tool-name`
  (`./2fast.theta` → `2fast`; rename the file or add `as <name>`), checked
  before the collision rule below. `as <name>` overrides for either kind
  (target must be lowercase-first, else `theta/load/invalid-tool-rename`). Two
  entries resolving to the same name, or a collision with a top-level `fn` or
  import, is `theta/load/tool-name-collision`.
- A callee that fails to parse/lower during the parent's load pass is
  `theta/load/callee-has-errors` (severity `error` for `tools:` entries).
- The per-entry grammar is closed: exactly a spec (Pi tool name or `.theta`
  path), optionally `as <name>`. Any other token sequence, or a `tools:`
  sequence item that is not a YAML scalar, is `theta/load/malformed-tool-entry`;
  the theta does not register.
- The field's value shape is closed too, one level up: a `tools:` value that is
  neither the comma-separated short form nor a YAML sequence — a mapping (flow
  or block, including the empty flow mapping `tools: {}`), an alias, or a key
  carrying no value node at all — is `theta/load/malformed-tools-field`; the
  theta does not register. `tools: []` and an absent field stay equivalent,
  both declaring the empty callable set silently.

**Extension-registered Pi tools.** “Pi's tool registry” is the *full* registry:
the built-ins plus any tool an installed Pi extension contributes (e.g.
`finding_store`, `projection`). Admission is mode-independent (since 0.11.0): a
`tools:` name resolves against the `pi.getAllTools()` registry snapshot in
`mode: prompt` and `mode: subagent` alike, and the resolved entry carries the
tool's `parameters` schema **when the host publishes one** (read by the RFC-0002
argument/field disjointness check and the model tool spec; a host that returns
bare tool names publishes no schema, and the check degrades to "schema unknown"
rather than to a defaulted one). An admitted extension tool is reachable by the
theta's **model** — in prompt mode the callable set is installed as the
session's active tools for each query window (PIC-17) and the user's host
session executes the call; in subagent mode the invocation runs the whole
callee in a child `pi` process that loads the same extensions and receives the
callable set's **host-tool** names as its active-tool allowlist (no host tool in
the set — including `tools: []` — → no tools; a `.theta` callable's name is
theta-side and never enters the allowlist, since it names nothing in the host's
tool registry) — and
by theta **code**: a code-side `<name>(...)` call routes through host-loop
dispatch (PIC-64) — the child's host agent loop in subagent mode, the user's
live host session in prompt mode — running deterministically with the
code-supplied arguments and zero model tokens. In prompt mode each code-side
call appends a fabricated user message plus tool-call and tool-result cards to
the user's own transcript and switches the session model twice — the
documented, accepted cost of the zero-token code channel; a code-side call
inside a `subagent fn` inline body carries the same cost (the body's isolation
covers its own conversation, not the dispatch channel); see [How to use an
extension tool from prompt mode](../how-to/use-an-extension-tool-from-prompt-mode.md).
An `as` rename on a Pi-tool entry is presentation-side only: it renames the
theta-side callable (the name theta code calls and the snapshot key), while the
underlying registered name is what enters the active-set install vector / child
allowlist and what the host executes. A failing extension tool (an `isError`
result) lowers to `Err(CodeToolError { cause: "execution" })`, as for a
built-in. Code-side dispatch is **fail-closed** only where no dispatch rung is
establishable — a host missing the required Pi surfaces or carrying no backing
host session — where a theta whose code calls an extension tool refuses to
load with `theta/load/extension-tool-unreachable` (distinct from
`theta/load/unknown-tool`, which means the tool is absent from Pi's registry).
The child is granted tool approval up front only when the callable set contains
a *project-local* extension tool (already trusted in the parent session);
otherwise it runs least-privilege. Installed extensions load in the child
(their tools, system-prompt appends, handlers, and providers are present, as in
any Pi session), but no user/project context — context files, skills, prompt
templates — is inherited. See
[Guide — Extension tools](../guide.md#extension-tools).

**YAML shape.** `tools:` accepts a comma-separated short form and a YAML list
form, both parsed by the same per-entry grammar. `.theta` paths and `as` renames
are legal in either form. A value outside those two spellings is
`theta/load/malformed-tools-field` and the theta does not register; `tools: []`
and an absent field are equivalent, both declaring the empty callable set
silently.

**Resolution snapshot.** Load-time resolution produces a frozen per-theta table of
`{ post-rename name → resolved callable }`. Each built-in Pi-tool entry holds a
strong reference to the resolved `ToolDefinition`; an extension-supplied Pi-tool
entry holds the tool's name and `parameters` schema (the public extension API
strips `execute`), its code-side dispatch routing through host-loop dispatch
(PIC-64); each `.theta`-path entry holds a strong reference to the parsed callee
plus its lowered tool spec. Calls dispatch through the held reference (or, for
an extension tool, against the pinned name); the runtime never re-queries Pi's
tool registry by name during execution. The `unknown_tool` cause on
`CodeToolError` is reachable only via the file-watcher reload path.

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
(`theta/parse/interpolated-result`). A `Result` held at a nested position inside
an interpolated array or object raises the same code as a runtime panic, because
a container's own static type is never `Result<T, E>`.

## Provenance

- Field-contract table (transcribed verbatim; cross-reference link targets
  flattened): `docs/spec_topics/frontmatter/frontmatter-fields-a.md` (Field
  contract).
- Naming convention, binder-model root-word convention, `params:` type/defaults,
  `tools:` (FRNT-2, FRNT-3): `docs/spec_topics/frontmatter/frontmatter-fields-a.md`.
- `tools:` YAML shape, resolution snapshot (built-in vs. extension-supplied
  entry shape), `system:` interpolation, `respond_repair:`, `tool_loop:`
  (FRNT-1), template interpolation:
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`.
- Extension-tool reach (mode-independent admission, PIC-17 query-window active
  set, PIC-64 host-loop dispatch + accepted prompt-mode cost + permission
  surface):
  `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md`,
  `docs/spec_topics/pi-integration-contract/subagent.md` (PIC-64).
- Frontmatter hub: `docs/spec_topics/frontmatter.md`.
- Binder bypass and binder-model resolution referenced from
  `docs/spec_topics/bindings.md`, `docs/spec_topics/binder.md`.
