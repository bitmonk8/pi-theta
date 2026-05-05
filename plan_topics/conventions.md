# Plan structure and conventions

Three kinds of phase:

1. **Horizontal phases (H1–H4).** Project scaffold, dependency-injection skeleton, diagnostics primitive, Pi-extension shell.
2. **MVP phase (M).** The smallest end-to-end `.loom` that runs as a Pi slash command — single hard-coded untyped query, prompt mode.
3. **Vertical slices (V1–V18, broken into leaf phases).** Each leaf is the smallest feature that can ship independently *and* be tested independently. Leaves carry IDs like `V4b`. Their grouping (V4) is editorial only — leaves are the unit of work.

Slices are roughly ordered by dependencies; non-linear deps are stated in each leaf's **Deps** field. Reorder freely as long as the deps DAG is respected.

## Per-phase TDD ritual (mandatory)

Every phase, leaf or otherwise, runs the same loop:

1. **Tests first.** Write the failing tests for *every* spec rule the phase introduces. One assertion per rule where practical. A test that would pass when prerequisites are missing is a defect — fix it before writing code.
2. **Implement.** Write the minimum code that turns red tests green. No speculative APIs.
3. **Run.** All tests green; type-check clean; lint clean.
4. **Self-review.** Re-read the spec section, the diff, the test list. Check: any rule unverified? any silent skip? any `catch(...)` that should be a specific type? any global / static / singleton creeping in?
5. **Fix review issues.** Iterate from step 3 until the review is clean.
6. **Phase exit gate.** "Ships when" criterion observable; tag commit `<id>-complete`.

A phase is **not** complete until its exit gate is met. No "we'll fix it next slice" carry-overs.

## Leaf format

Each leaf has the same fields, in the same order:

- **Spec.** Page(s) under [`../spec_topics/`](../spec_topics/) the leaf implements, *or* **Convention.** Section(s) of [`conventions.md`](conventions.md) the leaf operationalises (used by horizontal phases H1–H4, which derive from project-level conventions rather than spec rules).
- **Adds.** One sentence — what the leaf introduces.
- **Tests.** Bullet list — one bullet per **REQ-ID** the leaf claims to implement; cite the ID inline (e.g. `BIND-7: ...`). Where a leaf implements only part of a rule (sometimes a leaf adds the parser surface and a later leaf adds the runtime check), each Tests bullet still cites its REQ-ID; the coverage matrix's REQ-ID-to-leaf mapping is many-to-many. The REQ-ID prefix table for each spec page lives in [`../spec.md` Appendix — REQ-ID prefix table](../spec.md). Pure-narrative pages (`overview.md`, `influences.md`, `comparison.md`, `related-work.md`, `future-considerations.md`) carry no IDs and need no leaf citation.
- **Deps.** Other leaf IDs that must be complete first. Listed `-` if none beyond the previous-leaf-in-the-group.
- **Ships when.** A concrete, externally observable change.

## Cross-cutting rules (every phase)

- **No globals, statics, singletons.** All collaborators passed by constructor. Architectural test in H1 enforces.
- **Specific exception types only.** No `catch (e)` / `catch (Error)` without rethrow-on-mismatch. ESLint rule wired in H1.
- **Sequential by default.** No `Promise.all` / `Promise.race` outside slices that have a documented spec reason.
- **No silent test skipping.** `assert.fail` / `panic` when prerequisites are missing — never silent `return` early.
- **Spec drift.** If implementation reveals the spec is wrong, ambiguous, or under-specified, **stop**, fix the spec first in a dedicated commit, then resume.
- **Doc updates.** After each leaf, update `README.md`'s status table and append a one-line dated entry to `CHANGELOG.md`. The plan itself is updated only when the **plan** changes; non-plan discoveries go to `notes.md`.
- **Diagnostic message anchors.** Tests asserting a diagnostic's rendered message MUST cite the diagnostic code and source the expected string from the *Message* column of the [diagnostics registry](../spec_topics/diagnostics.md#code-registry). Phrasings like "matches spec verbatim" or "spec's exact wording" without a code anchor are insufficient — the registry is the single source of truth for every author-visible message string. System-note templates that live outside the registry (the binder failure-modes table in [`binder.md`](../spec_topics/binder.md#failure-mode-templates-normative); the no-params overflow note in [`slash-invocation.md`](../spec_topics/slash-invocation.md)) are cited by section anchor in the same posture.
- **REQ-ID discipline.** REQ-IDs are immutable. When a rule is split, the original ID retires and two new IDs appear; never renumber to fill holes. The prefix is taken from the spec page's filename stem at the moment of first numbering and frozen (binder.md → BIND, errors-and-results.md → ERR — see the prefix table in [`../spec.md`](../spec.md)). New diagnostic sites added by future spec work MUST land their REQ-IDs in the same edit; the V18o gate (per [V18 — V18o](v18-cancellation.md)) treats a spec REQ-ID without a coverage-matrix mapping as a CI failure.
