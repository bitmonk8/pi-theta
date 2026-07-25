# How to use an extension tool in a subagent

You want a subagent-mode theta's model to call a Pi tool that an installed Pi
extension registers — not only the built-ins. List the extension tool's name in
`tools:`, exactly as you would a built-in. (For the same goal in a prompt-mode
theta — where the dispatch runs in your own live session — see [How to use an
extension tool from prompt mode](./use-an-extension-tool-from-prompt-mode.md).)

## How names resolve

A `tools:` Pi-tool entry resolves against Pi's full tool registry at load time —
every name Pi exposes, built-in or extension-registered. So `finding_store`,
`projection`, or any other extension tool name is admissible alongside `read`,
`bash`, and friends. Resolution is mode-independent (since 0.11.0): the same
names resolve in a prompt-mode `tools:` list. An unknown name is a **load-time**
error (`theta/load/unknown-tool`); a typo or an uninstalled extension refuses
registration loudly rather than degrading at run time.

## Both the model and code can reach it

In subagent mode an extension tool is reachable **two ways**:

- The theta's **model** can call it during a query's tool loop. The invocation
  runs the whole callee — the interpreter included — in a spawned child `pi`
  process that performs Pi's normal extension discovery, so the tool is
  registered in the child; the callable-set names become the child's
  active-tool allowlist.
- Theta **code** can dispatch it too (since 0.10.0). A code-side `<name>(...)`
  call is routed through the child's own host agent loop (PIC-64 rung 2 —
  *host-loop dispatch*): the runtime registers a theta-controlled provider that
  authors the `tool_use` with your arguments verbatim, the child's host loop
  runs the call, and the runtime reads the result back. Deterministic
  arguments, zero model tokens, no executable definition ever obtained by theta
  code — the result comes back like any other tool call (a tool that reports
  failure lowers to `Err(CodeToolError { cause: "execution" })`, as for a
  built-in):

  ```theta
  ---
  description: List findings from code
  mode: subagent
  tools:
    - finding_store
  params:
    findings_dir: string
  ---
  // Deterministic, zero-token: dispatched in the child via host-loop dispatch.
  let report = finding_store({ op: "validate", findingsDir: findings_dir })?
  @`Given this schema check, is the store healthy? ${report}`
  ```

### Still fail-closed: no-rung contexts

Code-side dispatch refuses to load with `theta/load/extension-tool-unreachable`
(naming the tool) only where **no dispatch rung is establishable** — a host
where the required Pi surfaces are missing or no backing host session exists
(probe-failed host).

A prompt-mode theta is *not* such a context: since 0.11.0 code-side dispatch
runs there against the user's live host session, with a visible-transcript cost
(see [the prompt-mode how-to](./use-an-extension-tool-from-prompt-mode.md)).
Neither is a `subagent fn` inline body: its code-side extension-tool calls
dispatch through the process's backing host session — the child's private
session here, the user's live session in a prompt-mode theta — because the
body's isolation covers its own conversation, not the dispatch channel
(PIC-64). In a no-rung context, remove the code-side call — model-facing use
via a `@`-query is unaffected — or, if it ever lands, an upstream
`getToolDefinition` rung would restore code-side reach without the host loop.
Built-ins and `.theta` callables are code-callable everywhere (see [Call a tool
from theta code](./call-a-tool-from-theta-code.md)).

## The trust rule

The child process runs with tool approval pre-granted (no per-call prompt) only
when the callable set contains a **project-local** extension tool — one whose
extension you already trusted in this project's session, so the decision was
already made. Otherwise the child runs least-privilege. You do not configure this;
it is inferred from the callable set.

## Extension ambience

Because the child loads installed extensions, their non-tool contributions
(system-prompt additions, handlers, providers) are present too — as in any Pi
session. What is **not** inherited is your user and project context: context
files, skills, and prompt templates do not cross into the subagent.

## Working example

[`docs/examples/subagent-extension-tool.theta`](../examples/subagent-extension-tool.theta)
mixes the built-in `read` with the extension tool `finding_store` and exercises
both reach paths — code first, then the model (header comments elided here; the
checked-in file carries the full commentary):

```theta
---
description: Summarise the findings under a directory using an extension tool
mode: subagent
tools:
  - read
  - finding_store
params:
  findings_dir: string
---
// Code-side reach: dispatched in the child via host-loop dispatch — zero
// model tokens, confined to the child's private, discarded session.
let check = finding_store({ op: "validate", findingsDir: findings_dir })?

// Model-facing reach: the MODEL may also call `finding_store` during this
// query's tool loop — the callable set is the child's active-tool allowlist.
@`Using the store under ${findings_dir} (schema check: ${check}), list the
findings with finding_store, read any file it references, and report how many
findings are still open in one sentence.`
```

Run it (the `finding_store` extension must be installed in the Pi session):

```
pi --theta docs/examples -p "/subagent-extension-tool findings/"
```

## A note on cost

Each subagent-mode invocation spawns a child `pi` process (a full Node runtime
plus extension discovery), and because the whole callee now runs in that child,
**each nesting level is its own process** — the depth-32 invoke cap doubles as
the process-tree depth bound. That is per-invocation overhead, multiplied under
`par for` fan-out (N parallel calls spawn N children) and nested subagents — but
because every subagent invocation also makes at least one model call, it is a
fraction of the typical wall time, not a new dominant cost. Memory and
process-slot footprint are OS-owned; theta imposes no process-count cap.

A code-side extension-tool call adds one host-loop turn in the child per call
(fast — the authored `tool_use` runs with no network round-trip). Its only side
effects — a fabricated turn in the child's discarded transcript and a temporary
child-session model switch — are confined to the child's private `--no-session`
session; nothing reaches the user's session or transcript. That confinement is
the child process's, so it covers calls made inside a `subagent fn` inline body
too; in a prompt-mode theta the same calls land in the user's live session
instead (see the prompt-mode how-to).

## Reference

- `tools:` callable set, entry kinds, and resolution — [Frontmatter](../reference/frontmatter.md#tools-callable-set).
- `theta/load/unknown-tool`, `theta/load/extension-tool-unreachable`, and the
  subagent child-process diagnostics — [Diagnostics](../reference/diagnostics.md).
- Prompt vs. subagent mode and the isolation story — [Guide](../guide.md#extension-tools).
- The prompt-mode counterpart — [Use an extension tool from prompt mode](./use-an-extension-tool-from-prompt-mode.md).

## Provenance

- CHANGELOG `[0.11.0]` (mode-independent `tools:` admission; host-loop dispatch
  establishable in the parent, so the fail-closed refusal narrows to genuinely
  no-rung contexts; `isError` → `Err(CodeToolError { cause: "execution" })`),
  `[0.10.0]` (code-side extension-tool dispatch wired in subagent mode via
  host-loop dispatch, PIC-64 rung 2), `[0.9.0]` (whole-callee child execution,
  code-side dispatch ladder shipping fail-closed, extension-tool reach,
  `--tools` allowlist, trust rule, extension ambience) and `[0.8.0]` (initial
  subagent model-facing reach).
- Spec: `docs/spec_topics/pi-integration-contract/subagent.md`
  ([PIC-64](../spec_topics/pi-integration-contract/subagent.md#pic-64)
  code-side dispatch ladder + permission surface, §*Isolation and trust*,
  §*`--tools` / `--no-tools` allowlist suppression*, state-isolation matrix),
  `docs/rfcs/0006-child-process-theta-execution.md`,
  `docs/rfcs/0005-child-process-subagent-sessions.md`.
