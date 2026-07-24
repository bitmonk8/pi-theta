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

In subagent mode the reach is **model-facing only**:

- The theta's **model** can call an extension tool during a query's tool loop.
  The invocation runs in a spawned child `pi` process that performs Pi's normal
  extension discovery, so the tool is registered in the child; the callable-set
  names become the child's active-tool allowlist.
- Theta **code** cannot dispatch an extension tool in theta 1.0. A bare
  `<name>(...)` call to an extension tool fails — surfacing to theta code as
  `Err(CodeToolError)`, never a silent fallthrough. Only built-ins and `.theta`
  callables are code-callable
  (see [Call a tool from theta code](./call-a-tool-from-theta-code.md)). Code-side
  reach for extension tools is future work.

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

Each subagent-mode invocation spawns a child `pi` process (Node boot plus
extension discovery). That is per-invocation overhead — multiplied under `par for`
fan-out and nested subagents — but because every subagent invocation also makes at
least one model call, it is a fraction of the typical wall time, not a new
dominant cost.

## Reference

- `tools:` callable set, entry kinds, and resolution — [Frontmatter](../reference/frontmatter.md#tools-callable-set).
- `theta/load/unknown-tool` and the subagent child-process diagnostics — [Diagnostics](../reference/diagnostics.md).
- Prompt vs. subagent mode and the isolation story — [Guide](../guide.md#extension-tools-in-a-subagent).

## Provenance

- CHANGELOG `[0.8.0]` (extension-tool reach, `--tools` allowlist, trust rule,
  code-side asymmetry, extension ambience).
- Spec: `docs/spec_topics/pi-integration-contract/subagent.md`
  (§*Isolation and trust*, §*`--tools` / `--no-tools` allowlist suppression*,
  state-isolation matrix), `docs/rfcs/0005-child-process-subagent-sessions.md`
  (§*Isolation and trust*, §*What this RFC does not deliver*).
