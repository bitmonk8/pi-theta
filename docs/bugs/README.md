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

- [0001 — Extension-registered tools are unreachable from Theta](./0001-extension-tools-unreachable.md) — fixed (0.11.0)
- [0002 — Spawned subagent child never exits under `pi -p`](./0002-subagent-child-hangs-under-acceptance-pi-p.md) — fixed (0.12.0); investigation: [0002-investigation.md](./0002-investigation.md)
- [0003 — Whole-object Pi-tool argument dispatches with dropped args instead of the documented parse rejection](./0003-tool-arg-shape-rule-not-enforced.md) — fixed (0.16.0)
- [0004 — `invoke<array<T>>` return validation drops transitive `$defs` of named schemas](./0004-generic-annotation-drops-transitive-defs.md) — fixed (0.15.0)
- [0005 — `subagent fn` return-type annotations: `with` swallowed, keyword recognition lost, `?` rejected](./0005-subagent-fn-return-annotation-misparse.md) — fixed (0.14.0)
- [0006 — A leading-`[` expression statement glues onto the previous statement as index access](./0006-leading-bracket-glued-as-index-access.md) — fixed (0.13.0)
