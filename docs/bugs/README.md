# Bugs

Defect reports: cases where the implementation disagrees with the specification,
or where spec and implementation together fail to deliver documented behaviour.

A bug report captures a defect against *shipped or specified* behaviour: the
symptom, the expected behaviour (with spec citations), the actual behaviour
(with implementation citations), the root cause, and — where a fix has clear
tradeoffs — the options and a recommendation. Bugs differ from
[RFCs](../rfcs/): an RFC proposes a *new* language or runtime capability; a bug
reports that existing documented behaviour is wrong or absent.

The [Reference](../reference/) remains the authority for intended behaviour.

## Conventions

- One file per bug, numbered `NNNN-short-slug.md`, allocated in order.
- Each bug carries a status: `open`, `fixed`, `wontfix`, or `duplicate`.
- Prose follows [`docs/STYLE.md`](../STYLE.md): factual, terse, no hype.

## Index

- [0001 — Extension-registered tools are unreachable from Theta](./0001-extension-tools-unreachable.md) — open
