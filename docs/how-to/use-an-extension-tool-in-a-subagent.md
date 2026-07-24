# How to use an extension tool in a subagent

You want a subagent-mode theta's model to call a Pi tool that an installed Pi
extension registers — not just the built-ins. List the extension tool's name in
`tools:`, exactly as you would a built-in.

## How names resolve

In **subagent mode** a `tools:` Pi-tool entry resolves against Pi's full tool
registry at load time — every name Pi exposes, built-in or extension-registered.
So `finding_store`, `projection`, or any other extension tool name is admissible
alongside `read`, `bash`, and friends. In **prompt mode** a `tools:` entry naming
an extension tool fails load with `theta/load/unknown-tool` — prompt-mode
admission is built-ins-only. An unknown name is a **load-time** error
(`theta/load/unknown-tool`); a typo or an uninstalled extension refuses
registration loudly rather than degrading at run time.

## The model-can, code-cannot asymmetry

In subagent mode the reach is **model-facing only** in this release:

- The theta's **model** can call an extension tool during a query's tool loop.
  The invocation runs the whole callee — the interpreter included — in a spawned
  child `pi` process that performs Pi's normal extension discovery, so the tool
  is registered in the child; the callable-set names become the child's
  active-tool allowlist.
- Theta **code** cannot dispatch an extension tool in this release. The design
  routes a code-side `<name>(...)` call through the child's own host agent loop,
  but that dispatch rung is **not wired in 0.9.0**, so it ships **fail-closed**:
  a theta whose *code* calls an extension tool refuses to load with
  `theta/load/extension-tool-unreachable`, naming the tool. Remove the code-side
  call — model-facing use via a `@`-query is unaffected — or, if it ever lands,
  upgrade to a Pi minor that exposes the upstream `getToolDefinition` rung. Only
  built-ins and `.theta` callables are code-callable today
  (see [Call a tool from theta code](./call-a-tool-from-theta-code.md)).

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
mixes the built-in `read` with the extension tool `finding_store`:

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
@`Use finding_store to list the findings under ${findings_dir}, read any file it
references, and report how many findings are still open in one sentence.`
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

## Reference

- `tools:` callable set, entry kinds, and resolution — [Frontmatter](../reference/frontmatter.md#tools-callable-set).
- `theta/load/unknown-tool`, `theta/load/extension-tool-unreachable`, and the
  subagent child-process diagnostics — [Diagnostics](../reference/diagnostics.md).
- Prompt vs. subagent mode and the isolation story — [Guide](../guide.md#extension-tools-in-a-subagent).

## Provenance

- CHANGELOG `[0.9.0]` (whole-callee child execution, code-side dispatch ladder
  shipping fail-closed, extension-tool reach, `--tools` allowlist, trust rule,
  extension ambience) and `[0.8.0]` (initial subagent model-facing reach).
- Spec: `docs/spec_topics/pi-integration-contract/subagent.md`
  ([PIC-61](../spec_topics/pi-integration-contract/subagent.md#pic-61)
  code-side dispatch ladder + permission surface, §*Isolation and trust*,
  §*`--tools` / `--no-tools` allowlist suppression*, state-isolation matrix),
  `docs/rfcs/0006-child-process-theta-execution.md`,
  `docs/rfcs/0005-child-process-subagent-sessions.md`.
