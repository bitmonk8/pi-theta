# How to embed and configure the theta runtime as a Pi extension

This is the one host-integrator recipe. You want `.theta` files to become slash
commands in a Pi session: register the theta runtime as a Pi extension, point it
at the directories your thetas live in, and confirm one runs. Theta authors do not
need this — it is the wiring a host does once.

## Prerequisites

- A Pi host at or above the supported SDK floor (`@earendil-works/pi-coding-agent >=1.3.0`;
  the four `@earendil-works/*` packages move together). See the host prerequisites
  in spec `docs/spec_topics/pi-integration-contract/host-prerequisites.md`.
- Non-bypass thetas need a binder model resolvable via the `theta.binderModel`
  setting (or per-theta `bind_model:`).

## Steps

1. Ship the extension as ES modules: set `"type": "module"` in `package.json` and
   declare the entry with `"pi": { "extensions": ["./extensions"] }`. Pi
   auto-discovers `extensions/index.ts`, whose default export is
   `default function (pi: ExtensionAPI)`.
2. Inside the factory, the runtime registers its surfaces synchronously: the
   `--theta` CLI flag (`pi.registerFlag`), the `theta-system-note` renderer
   (`pi.registerMessageRenderer`), and the `resources_discover` / `session_start`
   / `session_shutdown` subscriptions. `pi.registerCommand` for each discovered
   theta runs on `session_start`, after the cross-format collision check.
3. Tell the runtime where thetas live — any of the five discovery sources:
   - global `~/.pi/agent/theta/*.theta`
   - project `.pi/theta/*.theta`
   - a package's `pi.theta` manifest entry (or conventional `theta/`)
   - the `thetaPaths` array in `settings.json`
   - the `--theta <paths>` CLI flag
4. Invoke a discovered theta as `/<filename-without-extension>`. `.thetalib` files are
   deliberately excluded from discovery.

## Working example

[`docs/examples/hello.theta`](../examples/hello.theta) is a minimal discovered theta:

```theta
---
description: "Minimal discovered theta for the host-integration recipe"
mode: prompt
---
@`Say hello and confirm the theta extension is wired up.`
```

Point the runtime at the directory with the CLI flag and invoke it:

```
pi --theta docs/examples -p "/hello"
```

## Result

The extension's discovery walk finds `hello.theta`, registers `/hello` as a slash
command (its `description` populates autocomplete), and dispatching it drives the
query into the session. Placing the same file under `~/.pi/agent/theta/` or a
`thetaPaths` entry registers it without the `--theta` flag. Editing an existing
`.theta` hot-reloads; adding or removing a file prompts a `/reload` system note.

## Reference

- Five discovery sources, priority, collisions, `thetaPaths`, `--theta` —
  [Discovery & invocation](../reference/discovery-cli.md).
- `theta/load/*` and `theta/host/*` bootstrap and registration codes —
  [Diagnostics](../reference/diagnostics.md).
- Extension bootstrap, registration steps, renderer registration, hot-reload —
  spec `docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-theta.md`
  and `.../registration-steps.md`.
- Where a theta sits relative to Pi's `.ts` extensions and `.md` prompts — [Guide](../guide.md).

## Provenance

- Spec: `docs/spec_topics/pi-integration.md`,
  `docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-theta.md`
  (ES-module rule, entry point, factory-time registration),
  `docs/spec_topics/pi-integration-contract/registration-steps.md` (steps 1–5),
  `docs/spec_topics/pi-integration-contract/host-prerequisites.md` (SDK pin,
  binder model), `docs/spec_topics/discovery.md`, glossary entry
  *pi-theta (extension)*, *operator*.
- Example `hello.theta` requested from `theta-docs-example-runner`.
