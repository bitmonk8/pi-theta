# Plan structure and conventions

Three kinds of phase:

1. **Horizontal phases (H1–H6).** Project scaffold, dependency-injection skeleton, diagnostics primitive, Pi-extension shell, Pi end-to-end harness, REQ-ID anchor insertion + coverage-matrix re-pivot.
   The harness (H5) exists so that from M onward every leaf whose `Ships when` claims a behaviour against "a real Pi session" can express that gate as a scripted assertion against an in-process `AgentSession`, not a manual smoke. "Manual in real Pi session" is reserved for gates that exercise Pi's CLI extension-discovery path itself (H4). H6 stands up the REQ-ID anchors in `spec_topics/*.md` and re-pivots `coverage-matrix.md` to per-REQ-ID granularity so that the leaf-format convention ("one bullet per REQ-ID; cite the ID inline") is satisfiable from M onward and the V18s gate ceases to pass vacuously.
2. **MVP phase (M).** The smallest end-to-end `.loom` that runs as a Pi slash command — single hard-coded untyped query, prompt mode.
3. **Vertical slices (V1–V18, broken into leaf phases).** Each leaf is the smallest feature that can ship independently *and* be tested independently. Leaves carry IDs like `V4b`. Their grouping (V4) is editorial only — leaves are the unit of work. The IDs `H1`–`H4`, `M`, and `V1`–`V18` (and their `<group><letter>` leaf forms) are reserved for plan phases. When plan prose needs to refer to the initial release of the loom language, write "loom 1.0" or "the initial release"; never reuse "V1" for that meaning.

Slices are roughly ordered by dependencies; non-linear deps are stated in each leaf's **Deps** field. Reorder freely as long as the deps DAG is respected.

## Per-phase TDD ritual (mandatory)

Every phase, leaf or otherwise, runs the same loop:

1. **Tests first.** Write the failing tests for *every* spec rule the phase introduces. One assertion per rule where practical. A test that would pass when prerequisites are missing is a defect — fix it before writing code.
2. **Implement.** Write the smallest correct increment that turns the red tests green: correctness is the goal, the tests are the evidence — do not under-implement to game a thin test, and do not add speculative APIs (unused exports, public hooks no test in this leaf or its declared downstream consumers exercises) that anticipate later leaves.
3. **Run.** All tests green; type-check clean; lint clean.
4. **Self-review.** Re-read the spec section, the diff, the test list. Check: any rule unverified? any silent skip? any `catch(...)` that should be a specific type? any global / static / singleton creeping in?
5. **Fix review issues.** Iterate from step 3 until the review is clean.
6. **Phase exit gate.** "Ships when" criterion observable; tag commit `<id>-complete`.

A phase is **not** complete until its exit gate is met. No "we'll fix it next slice" carry-overs.

## Leaf format

Each leaf has the same fields, in the same order:

- **Spec.** Page(s) under [`../spec_topics/`](../spec_topics/) the leaf implements, *or* **Convention.** Section(s) of [`conventions.md`](conventions.md) the leaf operationalises (used by horizontal phases H1–H4, which derive from project-level conventions rather than spec rules; H5 and H6 cite spec topics because they implement, respectively, the Pi integration surface and the REQ-ID anchoring + coverage-matrix re-pivot pass over the spec).
- **Adds.** One sentence — what the leaf introduces.
- **Tests.** Bullet list — one bullet per **REQ-ID** the leaf claims to implement; cite the ID inline (e.g. `BIND-7: ...`). Where a leaf implements only part of a rule (sometimes a leaf adds the parser surface and a later leaf adds the runtime check), each Tests bullet still cites its REQ-ID; the coverage matrix's REQ-ID-to-leaf mapping is many-to-many. The REQ-ID prefix table for each spec page lives in [`../spec.md` Appendix — REQ-ID prefix table](../spec.md). Pure-narrative pages (`overview.md`, `influences.md`, `comparison.md`, `related-work.md`, `future-considerations.md`) carry no IDs and need no leaf citation.
- **Deps.** Other leaf IDs that must be complete first. Listed `-` if none beyond the previous-leaf-in-the-group. Cite specific leaf IDs (`V4b`, `V9a–V9e`, `V14k–V14p`); never a bare group token (`V4`, `V9`) — group IDs are editorial only and a bare `VN` in `Deps.` is ambiguous between "every leaf" and "some subset". Use ranges where the deps are contiguous and comma-separated lists where they are not. Rationale-only parentheticals (`*(Order: ...)*`, `(discovery roots)`) belong in surrounding prose, not the `Deps.` field.
- **Ships when.** A concrete, externally observable change.

## Cross-cutting rules (every phase)

- **No globals, statics, singletons.** All collaborators passed by constructor. Architectural test in H1 enforces.
- **Specific exception types only.** No `catch (e)`, `catch (e: unknown)`, `catch (e: any)`, or `catch (e: Error)` — bind to a specific subtype or let the exception propagate. The rethrow-on-mismatch pattern (`catch (e) { if (!(e instanceof X)) throw e; … }`) is also forbidden. Aligns with the parent `CLAUDE.md` rule "Never `catch(...)` or `catch(std::exception&)`." ESLint rule (`no-broad-catch`) wired in H1 enforces this.
- **Sequential by default.** No `Promise.all` / `Promise.race` outside slices that have a documented spec reason.
- **No silent test skipping.** `assert.fail` / `panic` when prerequisites are missing — never silent `return` early.
- **Spec drift.** If implementation reveals the spec is wrong, ambiguous, or under-specified, **stop**, fix the spec first in a dedicated commit, then resume.
- **Doc updates.** After each leaf, update `README.md`'s status table and append a one-line dated entry to `CHANGELOG.md`. The plan itself is updated only when the **plan** changes; non-plan discoveries go to `notes.md`. (Both `CHANGELOG.md` and `notes.md` are bootstrapped in [H1](h1-scaffold.md); do not re-create.)
- **Diagnostic message anchors.** Tests asserting a diagnostic's rendered message MUST cite the diagnostic code and source the expected string from the *Message* column of the [diagnostics registry](../spec_topics/diagnostics.md#code-registry). Phrasings like "matches spec verbatim" or "spec's exact wording" without a code anchor are insufficient — the registry is the single source of truth for every author-visible message string. System-note templates that live outside the registry (the binder failure-modes table in [`binder.md`](../spec_topics/binder.md#failure-mode-templates-normative); the no-params overflow note in [`slash-invocation.md`](../spec_topics/slash-invocation.md)) are cited by section anchor in the same posture.
- **REQ-ID discipline.** REQ-IDs are immutable. When a rule is split, the original ID retires and two new IDs appear; never renumber to fill holes. The prefix is taken from the spec page's filename stem at the moment of first numbering and frozen (binder.md → BIND, errors-and-results.md → ERR — see the prefix table in [`../spec.md`](../spec.md)). New diagnostic sites added by future spec work MUST land their REQ-IDs in the same edit; the V18s gate (per [V18 — V18s](v18-cancellation.md)) treats a spec REQ-ID without a coverage-matrix mapping as a CI failure. Diagnostic codes are subject to the same closing-gate discipline: a new code added to the registry table of [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md) MUST land its asserting test in the same edit; the V18s gate treats a registry code without an asserting test (and any asserted code not in the registry) as a CI failure, mirroring the REQ-ID rule.
