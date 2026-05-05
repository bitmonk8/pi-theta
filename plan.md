# pi-loom — Implementation Plan

Companion to [`spec.md`](./spec.md). The full plan is split into per-phase pages under [`plan_topics/`](./plan_topics/). An implementer working on a single leaf only needs to open that leaf's phase page plus the spec topics it references.

## How to use this plan

1. Read [`plan_topics/conventions.md`](./plan_topics/conventions.md) once — it covers the three phase categories (horizontal / MVP / vertical), the per-phase TDD ritual, the leaf format, and the project-wide cross-cutting rules.
2. Pick the next leaf whose **Deps** are satisfied. Open that leaf's phase page below; read only the leaf and the spec topic(s) listed under its **Spec** field.
3. Follow the TDD ritual; tag the commit `<id>-complete` when the **Ships when** condition is observable.
4. Consult [`plan_topics/coverage-matrix.md`](./plan_topics/coverage-matrix.md) to confirm every spec rule has a closing leaf when V18s lands.

---

## Horizontal phases

Project scaffold, dependency-injection skeleton, diagnostics primitive, Pi-extension shell.

- [H1 — Repository scaffold and test framework](./plan_topics/h1-scaffold.md)
- [H2 — Dependency-injection skeleton with fakes](./plan_topics/h2-di-skeleton.md)
- [H3 — Diagnostics primitive and multi-error accumulator](./plan_topics/h3-diagnostics.md)
- [H4 — Pi extension shell](./plan_topics/h4-extension-shell.md)
- [H5 — Pi end-to-end harness](./plan_topics/h5-pi-e2e-harness.md)
- [H6 — REQ-ID anchor insertion and coverage-matrix re-pivot](./plan_topics/h6-req-ids.md)

---

## MVP phase

The smallest end-to-end `.loom` that runs as a Pi slash command.

- [Ma — Minimal lexer + parser for prompt-mode no-params loom](./plan_topics/m-mvp.md)
- [Mb — Minimal runtime + slash registration + two-root discovery + no-params overflow note](./plan_topics/m-mvp.md)

---

## Vertical slices

Each page contains the leaves for that slice. Leaves are the unit of work; their grouping is editorial.

- [V1 — Lexer hardening](./plan_topics/v1-lexer.md)
- [V2 — Expression sublanguage and bindings](./plan_topics/v2-expressions.md)
- [V3 — Frontmatter and `params` (excluding binder)](./plan_topics/v3-frontmatter.md)
- [V4 — Schemas, AJV pipeline, lowering](./plan_topics/v4-schemas.md)
- [V5 — Untyped queries and prompt-mode driver](./plan_topics/v5-untyped-queries.md)
- [V6 — Typed queries, `Result`, `?`, schema inference](./plan_topics/v6-typed-queries.md)
- [V7 — `match` and pattern grammar](./plan_topics/v7-match.md)
- [V8 — Control flow](./plan_topics/v8-control-flow.md)
- [V9 — Function definitions](./plan_topics/v9-functions.md)
- [V10 — Enums and literal-union types](./plan_topics/v10-enums.md)
- [V11 — Discriminated unions and recursion](./plan_topics/v11-discriminated-unions.md)
- [V12 — Subagent mode](./plan_topics/v12-subagent.md)
- [V13 — Wire names, descriptions, coercion](./plan_topics/v13-wire-names.md)
- [V14 — Tool calls and discovery](./plan_topics/v14-tool-calls.md)
- [V15 — `invoke`, registered loom callees, cross-mode](./plan_topics/v15-invoke.md)
- [V16 — Slash-command argument binder (LLM path)](./plan_topics/v16-binder.md)
- [V17 — `.warp` library files](./plan_topics/v17-warp.md)
- [V18 — Cancellation, file watcher, system notes, panics, diagnostics rollup](./plan_topics/v18-cancellation.md)

---

## Spec coverage

- [Spec coverage matrix](./plan_topics/coverage-matrix.md) — every executable spec rule mapped to its closing leaf(s).
