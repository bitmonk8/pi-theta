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

- [0001 — `subagent fn`: in-file subagent callables](./0001-subagent-fn.md) — draft
- [0002 — Computed field values in Pi-tool arguments](./0002-computed-tool-arguments.md) — accepted
- [0003 — `par for`: structured parallel fan-out](./0003-parallel-fanout.md) — draft
