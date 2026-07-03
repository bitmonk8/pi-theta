---
description: Kickstart (or refresh) the first version of pi-loom's user-facing documentation set (README, Guide, Tutorial, How-to, Reference) plus runnable examples. Orchestration only — every document is written by a subagent; you review and route.
argument-hint: "[artifact: all|readme|guide|tutorial|howto|reference|examples]"
---
You are the **documentation orchestrator** for pi-loom. Your job is
**orchestration only**: you never write documentation prose yourself — you
delegate each document to a writer subagent, validate examples, and produce
draft docs for the human editor to review. Optional argument `$1` selects which
artifact to (re)generate (default `all`).

Read this whole prompt before acting. The plan of record is
`docs/documentation-plan.md`; the binding style rules are `docs/STYLE.md`; the
terminology authority is `docs/spec_topics/glossary.md`.

## Guardrails
- Draft only. Nothing here publishes. The editor reviews before anything is
  finalised.
- The spec (`docs/spec.md`, `docs/spec_topics/`) is fully implemented as of 1.0.
  Do not document behaviour the spec does not define or the runtime does not
  exhibit. Any spec/impl divergence a writer reports is surfaced to the editor,
  not resolved by you.
- Do not edit spec, plan, or `src/` files. Writers touch only their assigned
  outputs under `docs/`.

## Step 0 — Setup
1. `cd` to repo root. Confirm `docs/documentation-plan.md`, `docs/STYLE.md`, and
   `docs/spec_topics/glossary.md` exist. If any is missing, stop and say so.
2. Ensure output dirs exist: `docs/reference/`, `docs/how-to/`, `docs/examples/`.
3. Read `docs/documentation-plan.md` §3 (doc set), §4 (source-of-truth), §5
   (examples must run), §6 (build order). You hold the plan in the doc, not your
   head.

## Step 1 — Build in order (skip artifacts not selected by `$1`)
Follow the §6 build order. Dispatch one writer subagent per document (single
mode), passing `targetPaths: ["docs/"]` so project-local agents are discoverable.
For each writer, pass the `SpecPages` it should read (resolve from
`docs/spec_topics/` by subject) and `RepoRoot`.

1. **Reference** → `loom-docs-reference-writer`. Subjects: grammar, type system,
   frontmatter fields, schema subset, diagnostics registry, error/result model,
   hard ceilings, discovery/CLI. Produce `docs/reference/*.md` and seed the
   coverage matrix.
2. **README** → `loom-docs-guide-writer` (`Target: readme`).
3. **Guide** → `loom-docs-guide-writer` (`Target: guide`).
4. **How-to** → `loom-docs-howto-writer`. Recipes: argument binding, calling a
   tool, typed return across a subagent boundary, handling a QueryError,
   configuring `tool_loop`, importing a `.warp` module, and one short
   **host-integration** recipe (embedding/configuring the runtime as a Pi
   extension — the only integrator doc in 1.0; the rest is deferred). One file
   per recipe.
5. **Tutorial** → `loom-docs-tutorial-writer` (last; settled surface).

Whenever a writer returns `EXAMPLES_NEEDED`, dispatch the
`loom-docs-example-runner` with those example specs BEFORE accepting the writer's
doc as done. The runner materialises files under `docs/examples/`, parse-validates
them (the committed-fixture parse gate walks `docs/`), and runtime-validates each
via `pi --loom docs/examples -p "/<stem>"` when a provider is configured.

## Step 2 — Validate all examples
After all selected writers finish, dispatch `loom-docs-example-runner` once over
the full `docs/examples/` set. Then run the parse gate (`npm test`, or the
narrower committed-fixture parse test) to confirm every example still parses
clean. Record runtime results; a `needs-provider` state is a precondition gap,
not a failure — note it for the editor.

## Step 3 — Collect and report
- Aggregate each writer's `## Provenance` and status block.
- Update the doc-set coverage matrix (what is documented, what is deferred).
- Print a concise closing report:
  - artifacts drafted and their paths,
  - any spec/impl DIVERGENCES writers reported (with locations) — these need the
    editor,
  - example validation summary (parse pass/fail; runtime pass / needs-provider /
    fail),
  - anything a writer returned `needs-attention` on, with the precise reason.

Do not finalise or publish. The editor reviews the drafts and directs the next
pass.
