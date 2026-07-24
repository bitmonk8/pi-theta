# How-to guides

Task-focused recipes. Each guide answers one "how do I…" question and is backed
by a real, checked-in example under [`docs/examples/`](../examples/). For the
mental model read the [Guide](../guide.md); for the first end-to-end run, the
[Tutorial](../tutorial.md); for exact, normative behaviour, the
[Reference](../reference/).

## Authoring a single theta

- [Bind slash-command arguments](./bind-slash-command-arguments.md) — map a
  user's free-form argument string onto a theta's typed `params:` envelope.
- [Call a tool from theta code](./call-a-tool-from-theta-code.md) — run a tool
  directly from code (no model turn) and use its result, with computed argument
  field values.
- [Configure `tool_loop`](./configure-tool-loop.md) — bound and tune the
  tool-call round budget the model runs during a query.
- [Handle a `QueryError`](./handle-a-queryerror.md) — recover from a failed query
  or invoke with `match` and `?` instead of letting it reach the fail outcome.
- [Import a `.thetalib` module](./import-a-thetalib-module.md) — share a schema,
  enum, or helper `fn` across thetas.
- [Use an extension tool in a subagent](./use-an-extension-tool-in-a-subagent.md)
  — let a subagent theta's model call a Pi tool that an installed extension
  registers, not just the built-ins.

## Composing thetas

- [Return a typed value across a subagent boundary](./return-a-typed-value-across-a-subagent-boundary.md)
  — run a subagent-mode child and read its typed final value back in code.
- [Write an agent loop](./write-an-agent-loop.md) — drive a fresh-context worker
  in a bounded loop until the job is done (the Ralph-loop pattern).
- [Fan out in parallel](./fan-out-in-parallel.md) — run independent, typed work
  concurrently with `par for` and reduce the per-element results.

## Hosting the runtime

- [Embed the theta runtime as a Pi extension](./embed-the-theta-runtime-as-a-pi-extension.md)
  — the host-integrator recipe: make `.theta` files discoverable as slash
  commands and configure discovery.

## Provenance

- Diátaxis boundaries (how-to as one of four distinct modes) and one-document-one-job:
  `docs/STYLE.md` §"Structure and cross-linking".
- Every recipe is backed by a runnable, checked-in example: `docs/STYLE.md`
  §Examples.
