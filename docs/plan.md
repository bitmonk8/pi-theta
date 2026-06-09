# pi-loom — Implementation Plan

Companion to [`spec.md`](./spec.md). The plan is a set of per-phase leaf pages under [`plan_topics/`](./plan_topics/). An implementer working on a single leaf only needs to open that leaf's page plus the spec topics it references.

## How to use this plan

1. Read [`plan_topics/conventions.md`](./plan_topics/conventions.md) once — it covers the three phase categories (horizontal / MVP / vertical), the per-phase TDD ritual, the leaf format, and the project-wide cross-cutting rules.
2. Author new leaves by copying [`plan_topics/leaf-template.md`](./plan_topics/leaf-template.md) and saving under `plan_topics/<id>-<short-name>.md`. Link the new leaf into the appropriate section below.
3. Pick the next leaf whose **Deps** are satisfied. Open that leaf's page; read only the leaf and the spec topic(s) listed under its **Spec** field.
4. Follow the per-phase TDD ritual. MVP and vertical features are two paired tasks — land the tests task `<id>-T` first (tag `<id>-T-complete`), then the implementation task `<id>` (tag `<id>-complete` when its **Ships when** condition is observable). Horizontal leaves are a single task tagged `<id>-complete`.
5. Maintain [`plan_topics/coverage-matrix.md`](./plan_topics/coverage-matrix.md) so every executable spec REQ-ID has at least one closing leaf by the loom 1.0 release gate.

---

## Scope

**In scope.** This plan implements loom 1.0 as defined by [`spec.md`](./spec.md) and its topics. Every leaf traces to a spec REQ-ID, or — for horizontal leaves — to a [`conventions.md`](./plan_topics/conventions.md) section.

**Out of scope.** The loom 1.0 non-goals and deferred forward-compatibility seams are owned by the spec, not this plan: see [`spec.md` — Scope](./spec/overview-and-orientation.md#scope) and [Future Considerations — loom 1.0 non-goals](./spec_topics/future-considerations/model-changes-and-non-goals.md#v1-non-goals). No leaf implements a non-goal or a deferred seam; a step that appears to require one is scope creep — fix the spec first (per the **Spec drift** rule in [`conventions.md`](./plan_topics/conventions.md)) before planning it. Post-loom-1.0 surface extensions and model-level changes are likewise out of scope.

---

## Horizontal phases

Project scaffold, dependency-injection skeleton, diagnostics primitive, Pi-extension shell, end-to-end harness. Horizontal phases are infrastructure work — they operationalise [`conventions.md`](./plan_topics/conventions.md) rather than implement spec rules directly, so their leaves cite a **Convention.** field instead of a **Spec.** field.

_(No leaves yet — author per the template.)_

---

## MVP phase

The smallest end-to-end `.loom` that runs as a Pi slash command. One narrow vertical, end-to-end, to prove the pipeline before slice work begins.

_(No leaves yet — author per the template.)_

---

## Vertical slices

Each slice is a coherent feature area (e.g. lexer, expressions, schemas, queries). Each leaf inside a slice is the smallest feature that can ship and be tested independently; slice grouping is editorial only. Leaves carry IDs like `V4b`. Order slices by their dependency DAG; non-linear deps are stated in each leaf's **Deps** field.

_(No leaves yet — author per the template.)_

---

## Spec coverage

- [Spec coverage matrix](./plan_topics/coverage-matrix.md) — every executable spec REQ-ID mapped to its closing leaf(s). Empty today; populated as leaves are authored.

## Authoring

- [Leaf template](./plan_topics/leaf-template.md) — copy this when adding a new leaf.
- [Conventions](./plan_topics/conventions.md) — phase categories, TDD ritual, leaf format, cross-cutting rules.
