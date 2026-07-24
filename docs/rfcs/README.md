# RFCs

Design proposals for changes to the Theta language or the pi-theta runtime.

An RFC captures a proposed change before it is specified or implemented: the
problem, the motivation, the concrete proposal, the alternatives considered, and
the open questions. It is a discussion artefact, not normative documentation —
the [Reference](../reference/) remains the authority for shipped behaviour.

Language-surface RFCs describe a theta 1.x language-scope change under the
specification's versioning governance
(`../spec_topics/governance/release-version-naming.md`); they do not change
shipped behaviour until specified and implemented.

## Conventions

- One file per RFC, numbered `NNNN-short-slug.md`, allocated in order.
- Each RFC carries a status: `draft`, `proposed`, `accepted`, `rejected`, or
  `superseded`.
- Prose follows [`docs/STYLE.md`](../STYLE.md): factual, terse, no hype.

## Index

- [0001 — `subagent fn`: in-file subagent callables](./0001-subagent-fn.md) — accepted
- [0002 — Computed field values in Pi-tool arguments](./0002-computed-tool-arguments.md) — accepted
- [0003 — `par for`: structured parallel fan-out](./0003-parallel-fanout.md) — accepted
- [0005 — Child-process subagent sessions (RPC session driver)](./0005-child-process-subagent-sessions.md) — draft
- [0006 — Child-process theta execution (remote theta)](./0006-child-process-theta-execution.md) — draft (depends on 0005)

Reclassified out of the RFC series:

- 0004 — Extension-registered tools are unreachable from Theta — this was a
  defect against documented behaviour, not a feature proposal; moved to
  [Bugs — 0001](../bugs/0001-extension-tools-unreachable.md).
