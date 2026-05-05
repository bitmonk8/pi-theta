# pi-loom — Consolidated Plan Review

_Generated: 2026-05-05T08:11:29Z_
_Source: docs/reviews/plan-review/plan-20260505-083349.md_
_5 findings retained, 3 false positives dropped, 0 persistent failures_

---

## plan_topics/conventions.md

---

# `Promise.all` / `Promise.race` exemption rule has no operational definition

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** "documented spec reason" undefined
**Kind:** clarity

## Finding

`plan_topics/conventions.md` line 38 reads: *"Sequential by default. No `Promise.all` / `Promise.race` outside slices that have a documented spec reason."* The phrase "documented spec reason" is not anchored to any artefact. Two equally plausible readings exist: (a) a spec page contains a normative statement that mandates concurrency at this site, or (b) the leaf's own plan entry contains prose that argues for it. The convention names neither as canonical, lists no pre-blessed slices, and gives the H1 lint authors no predicate to encode.

This matters because the spec actually does mandate parallel execution at specific sites — `spec_topics/query.md` ("the runtime executes them all in parallel where the provider supports parallel tool calls"), `spec_topics/pi-integration-contract.md` (re-entrant adapter for parallel tool calls), `spec_topics/frontmatter.md` (parallel tool-call rounds). The implementing leaves (V14c tool-call execution, V14e tool wired into `@` queries, V15k sibling subagents) will plausibly use `Promise.all` over a fan-out of tool invocations. Under reading (a) the citation is in the spec; under reading (b) the citation is whatever prose the leaf author writes. Two reasonable implementers will diverge on what counts as compliance, and the V18o coverage gate has no hook to verify either.

The convention also leaves three adjacent questions unanswered: does the rule apply to test code (e.g. V15k spawns "two sibling sessions concurrently" — likely via `Promise.all` in test setup); does it cover `Promise.allSettled` and `Promise.any` (sequel constructors with the same fan-out shape); and where the exemption marker physically lives so a grep can audit it.

## Plan Documents

- `plan_topics/conventions.md` — Cross-cutting rules / Sequential by default (edited)
- `plan_topics/v14-tool-calls.md` — V14c, V14e (option-dependent)
- `plan_topics/v15-invoke.md` — V15k (option-dependent)
- `plan_topics/v18-cancellation.md` — V18o gate (read-only)
- `plan.md` — Cross-cutting reference (read-only)

## Spec Documents

- `spec_topics/query.md` — Tool-call loop bound (read-only)
- `spec_topics/pi-integration-contract.md` — Adapter re-entrance (read-only)
- `spec_topics/frontmatter.md` — `tool_loop` parallel rounds (read-only)
- `spec_topics/tool-calls.md` — Concurrency (read-only)

## Affected Leaves

**Phases:** Vertical V14, Vertical V15, Vertical V18

**Leaves (implementation order):**

- V14c — Bare `<name>(args)` call from loom code — (option-dependent)
- V14e — Pi tool wired into `@` queries as model-callable — (option-dependent)
- V15k — Cross-mode cell: subagent → subagent — (option-dependent)
- V18o — Per-call timeout marker / coverage-matrix closing gate — (option-dependent)

## Consequence

**Severity:** correctness

Two implementers reading the convention will pick incompatible compliance models — one will inline `Promise.all` in tool execution, citing the spec's "in parallel where the provider supports" phrasing; another will serialise the same code, citing the rule's "sequential by default" framing. Lint cannot encode the exemption because the predicate is undefined, so the rule degenerates into reviewer-discretion. If the H1 lint instead enforces a blanket prohibition, the parallel-tool-call requirement at V14c/V14e cannot be implemented without a per-line ESLint disable, and the V18o gate has no signal whether each disable corresponds to a real spec mandate.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/conventions.md`, replace the Sequential-by-default bullet (line 38) with:

> **Sequential by default.** `Promise.all`, `Promise.race`, `Promise.allSettled`, and `Promise.any` are forbidden in production code (`src/**`, excluding `**/*.test.ts`) unless the calling leaf's `Spec.` field cites at least one spec REQ-ID whose normative text mandates concurrency at this site, and the leaf's `Adds.` field names the construct and the REQ-ID together (e.g. *"fans tool-use blocks out via `Promise.all` per QUERY-N"*). The H1 lint rule (`no-restricted-syntax`) enumerates an allow-list of `<file>:<line-range>` exemptions, one per blessed call site; each entry MUST have a same-line comment of the form `// allow: <REQ-ID> — <spec-page>` and the lint test asserts that every allow-list entry has a matching REQ-ID present in `coverage-matrix.md`. Test code is unrestricted but MUST NOT carry the exemption comment (so `grep`-based audits stay clean).

Apply two cascading edits:

1. In `plan_topics/v14-tool-calls.md`, when V14c and V14e land their parallel-tool-execution paths, the leaf author updates `Adds.` to name `Promise.all` and the governing REQ-ID (placeholder until the REQ-ID assignment leaf — see related finding "REQ-ID system referenced everywhere but no leaf creates it" — actually mints `QUERY-*` IDs for `query.md`).
2. In `plan_topics/v18-cancellation.md` V18o, extend the gate's coverage check to additionally diff the lint allow-list against `coverage-matrix.md`: any allow-list entry whose REQ-ID is absent from the matrix fails CI.

Edge cases for the implementer of the conventions edit:

- The rule explicitly excludes `**/*.test.ts` — V15k's "two sibling sessions exist concurrently" test setup must not require a citation.
- The four named constructors (`all`, `race`, `allSettled`, `any`) are exhaustive for the lint pattern; do not enumerate additionally (e.g. `for await…of` on async iterables) without a separate convention bullet.
- Until the REQ-ID assignment leaf lands, `Adds.` citations may use the spec-page anchor (e.g. *"per query.md — Tool-call loop bound"*); the V18o gate must tolerate this transitional form and emit a deprecation diagnostic, not a hard fail.

## Related Findings

- "REQ-ID system referenced everywhere but no leaf creates it" — decision-dependency (the recommended fix relies on REQ-IDs existing in spec pages and the coverage matrix; until that leaf lands, citations fall back to spec-page anchors)
- "speculative APIs" undefined — same-cluster (sibling clarity defect on the same `conventions.md` page; resolves independently)
- "Exception-handling convention weaker than CLAUDE.md" — same-cluster (sibling defect in the same Cross-cutting rules block; resolves independently)
- "Ambiguous group-level leaf IDs in Deps fields" — same-cluster (another underspecified rule in `conventions.md`; resolves independently)

---

# Step 2 of TDD ritual: "minimum code" invites test-gaming and "speculative APIs" is undefined

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** "speculative APIs" undefined
**Kind:** clarity

## Finding

`plan_topics/conventions.md` step 2 of the per-phase TDD ritual reads: *"Implement. Write the minimum code that turns red tests green. No speculative APIs."* Both clauses are weak in opposite directions:

- *"Minimum code that turns red tests green"* can be read as a license to under-implement: an implementer who finds a thin path through the test fixtures may ship a partially-correct implementation that happens to pass, treating the tests as the contract rather than as evidence for a separately-specified correctness target.
- *"No speculative APIs"* has no operational predicate. "Speculative" is a judgement word; reviewers will disagree on whether an exported helper is speculative or load-bearing for the next leaf.

The two clauses also collide with the plan's own surface-then-runtime split pattern (called out three paragraphs down in the Tests-bullet convention), where one leaf legitimately exports symbols whose runtime checks land in a downstream leaf.

## Plan Documents

- `plan_topics/conventions.md` — Per-phase TDD ritual, step 2 (edited)

## Spec Documents

None

## Affected Leaves

**Phases:** None

**Leaves (implementation order):**

None

## Consequence

**Severity:** advisory

The rule applies cross-cuttingly to every leaf but does not block any of them. The risk is silent under-implementation (correct-by-the-tests but wrong-by-the-spec) and unbounded over-implementation (speculative exports anticipating later leaves), neither of which fails any leaf gate. The V18o REQ-ID coverage gate is unaffected.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/conventions.md`, replace the existing step 2:

> Implement. Write the minimum code that turns red tests green. No speculative APIs.

with:

> **Implement.** Write the smallest correct increment that turns the red tests green: correctness is the goal, the tests are the evidence — do not under-implement to game a thin test, and do not add speculative APIs (unused exports, public hooks no test in this leaf or its declared downstream consumers exercises) that anticipate later leaves.

Two operational anchors land in one sentence:

1. *Correctness is the goal, the tests are the evidence.* A reviewer who sees an implementation that passes the suite but misses a spec rule the suite under-asserts can still reject the PR; the convention now names that posture explicitly.
2. *Speculative = no test in this leaf or its declared downstream consumers exercises it.* The "declared downstream consumers" qualifier honours the surface-then-runtime split: a V4 schema lowering may export shapes that only V6 tests exercise, as long as V6 lists V4 in its `Deps`. Symbols not reachable from any current-leaf or declared-downstream-leaf test belong in the leaf that needs them.

Edge case for the implementer: internal (non-exported) helpers introduced to keep the implementation readable are not covered by the speculative-API rule and remain a normal code-review judgement call.

## Related Findings

- `"documented spec reason" undefined` — same-cluster (sibling weasel-qualifier in the same `conventions.md` cross-cutting rules block; resolves independently)

---

# Exception-handling convention weaker than CLAUDE.md

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** Exception-handling convention weaker than CLAUDE.md
**Kind:** doc-alignment-broad

## Finding

`plan_topics/conventions.md` cross-cutting rule (line 37) reads: "Specific exception types only. No `catch (e)` / `catch (Error)` without rethrow-on-mismatch. ESLint rule wired in H1." This permits broad catches as long as they rethrow on type mismatch.

The parent `C:\UnitySrc\CLAUDE.md` policy is absolute: "Never `catch(...)` or `catch(std::exception&)`. Catch specific types or let crash." Mapped to TypeScript, the analogues are bare `catch (e)` / `catch (e: unknown)` and `catch (e: Error)` — both are flatly prohibited, with no rethrow-on-mismatch escape hatch.

H1's `Adds` field schedules an ESLint rule named `no-broad-catch`. Because the rule will be specified against the convention page (not against `CLAUDE.md`), it will codify the weaker reading: a `try { … } catch (e) { if (!(e instanceof FooError)) throw e; … }` pattern will pass lint despite being prohibited by the parent policy. Every downstream leaf will then be free to use that pattern, and there is no later gate that re-checks against `CLAUDE.md`.

## Plan Documents

- `plan_topics/conventions.md` — Cross-cutting rules, line 37 (edited)
- `plan_topics/h1-scaffold.md` — Adds; possibly Tests (option-dependent — only if the lint rule's tests must be re-pinned to the tighter wording)

## Spec Documents

None. Exception-handling discipline is a project convention; the spec under `spec_topics/` does not normatively constrain `try`/`catch` style.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

## Consequence

**Severity:** correctness

Two implementers reading the current `conventions.md` rule will produce different `no-broad-catch` ESLint configurations: one will allow `catch (e)` with a rethrow guard, the other will ban it outright. The first is consistent with the literal convention text; the second is consistent with the parent `CLAUDE.md` policy. Whichever ships, every later leaf inherits it — there is no re-check gate. Code that violates `CLAUDE.md` can pass H1's lint and accumulate across the entire codebase before any reviewer notices.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/conventions.md`, replace the line

> - **Specific exception types only.** No `catch (e)` / `catch (Error)` without rethrow-on-mismatch. ESLint rule wired in H1.

with

> - **Specific exception types only.** No `catch (e)`, `catch (e: unknown)`, `catch (e: any)`, or `catch (e: Error)` — bind to a specific subtype or let the exception propagate. The rethrow-on-mismatch pattern (`catch (e) { if (!(e instanceof X)) throw e; … }`) is also forbidden. Aligns with the parent `CLAUDE.md` rule "Never `catch(...)` or `catch(std::exception&)`." ESLint rule (`no-broad-catch`) wired in H1 enforces this.

In `plan_topics/h1-scaffold.md`, add a Tests bullet:

> - `no-broad-catch` ESLint rule fires on fixtures containing each of `catch (e)`, `catch (e: unknown)`, `catch (e: any)`, `catch (e: Error)`, and the rethrow-on-mismatch pattern; passes on `catch (e: FooError)` for any user-defined subtype.

Edge case for the implementer: Vitest / Node's standard library throws plain `Error` instances in some paths (e.g. `AbortError`, `TypeError` from JSON parsing). The lint rule must permit catching those at well-defined boundary sites — restrict the ban to `src/` and exempt `test/` and any explicit boundary modules; document the exempt list in the lint config so it is reviewable.

## Related Findings

- "CHANGELOG.md / notes.md creation violates CLAUDE.md" — same-cluster (another `conventions.md` rule that drifts from `CLAUDE.md`; resolved independently but worth fixing in the same conventions-alignment pass)
- "\"lint rule forbids `throw new Error`\" has no asserting test" — same-cluster (sibling H3 lint rule with no asserting test; this finding's recommended Tests bullet for `no-broad-catch` should follow the same pattern that finding prescribes)
- "H1 scaffolds engineering hygiene without spec basis" — co-resolve (touches H1's convention-only `Adds` items; tagging `no-broad-catch` as "convention" per that finding's recommendation should happen in the same edit)

---

# Group-level IDs in `Deps.` are ambiguous

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** Ambiguous group-level leaf IDs in Deps fields
**Kind:** traceability

## Finding

Fifteen leaves list a bare group identifier (`V1`, `V2`, `V4`, `V6`, `V9`, `V12`) in their `Deps.` field instead of a specific leaf ID such as `V1c` or `V9a–V9e`. `plan_topics/conventions.md` defines the leaf format ("Other leaf IDs that must be complete first") but never says what a group ID means in that position. Two readings are equally consistent with the surrounding text: (a) "every leaf in the group must be complete" or (b) "the group must have produced enough surface area for this dep to be satisfied" (i.e. a subset). The same conventions file argues against (a) by stating outright that "Their grouping (V4) is editorial only — leaves are the unit of work."

Authoring intent is visibly mixed. `V6d` writes `Deps. V6c, V9 (functions). *(Order: this leaf depends on V9a–V9e; reorder as needed.)*` — the parenthetical exists precisely because `V9` alone is ambiguous and the author meant a strict subset, not all of `V9a–V9p`. By contrast `V17a — Deps. V1.` plausibly does mean every leaf in `V1` (lexer hardening must finish before the warp parser shares it). Without a stated convention, an implementer working `V12e (Deps. V12a, V6.)` cannot tell whether they are blocked on `V6a` only, on `V6a–V6b`, or on the entire `V6a–V6r` chain — a difference of weeks of work.

The DAG that `plan.md` step 2 ("Pick the next leaf whose **Deps** are satisfied") relies on is therefore not machine-checkable and not even consistently human-checkable.

## Plan Documents

- `plan_topics/conventions.md` — "Leaf format" / **Deps.** bullet (option-dependent)
- `plan_topics/v2-expressions.md` — V2a (option-dependent)
- `plan_topics/v3-frontmatter.md` — V3a (option-dependent)
- `plan_topics/v5-untyped-queries.md` — V5a (option-dependent)
- `plan_topics/v6-typed-queries.md` — V6c, V6d, V6e, V6i (option-dependent)
- `plan_topics/v7-match.md` — V7a (option-dependent)
- `plan_topics/v8-control-flow.md` — V8a (option-dependent)
- `plan_topics/v9-functions.md` — V9a (option-dependent)
- `plan_topics/v10-enums.md` — V10a (option-dependent)
- `plan_topics/v12-subagent.md` — V12e (option-dependent)
- `plan_topics/v15-invoke.md` — V15a, V15c (option-dependent)
- `plan_topics/v17-warp.md` — V17a (option-dependent)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical V2, Vertical V3, Vertical V5, Vertical V6, Vertical V7, Vertical V8, Vertical V9, Vertical V10, Vertical V12, Vertical V15, Vertical V17

**Leaves (implementation order):**

- V2a — `let` immutable bindings — (modified)
- V3a — Frontmatter parsing — (modified)
- V5a — Bare `@`literal`` query parsed — (modified)
- V6c — Schema inference: binding-annotation sink — (modified)
- V6d — Schema inference: enclosing return-type sink — (modified)
- V6e — Schema inference: enclosing call-site parameter-type sink — (modified)
- V6i — AJV validation of typed query results — (modified)
- V7a — `match` expression structure — (modified)
- V8a — `if` / `else` statement form — (modified)
- V9a — Top-level `fn` declaration — (modified)
- V10a — `enum X { ... }` declaration — (modified)
- V12e — Subagent return value flow — (modified)
- V15a — `invoke("./path.loom", ...)` parsing and resolution — (modified)
- V15c — Typed `invoke<Schema>` with AJV validation — (modified)
- V17a — `.warp` lexer/parser shares loom lexer — (modified)

## Consequence

**Severity:** correctness

Two implementers picking up the same leaf can legitimately disagree on what is blocking. The worst case is `V12e (Deps. V12a, V6.)`: a strict reading delays subagent return-value plumbing until typed queries, AJV validation, and the entire tool-loop budget land; a loose reading lets it ship after `V6a`/`V6b`. The looser implementer ships a leaf that imports symbols whose semantics later leaves still alter, and integration breaks silently when V6 finishes. The DAG that `plan.md` instructs implementers to walk is not actually well-defined.

## Solution Space

**Shape:** single

### Recommendation

Audit each of the fifteen leaves listed above; for each `VN` token in `Deps.` substitute the precise leaf set the author actually relies on. Use `V6d`'s existing parenthetical (`V9a–V9e`) as the model: ranges where contiguous, comma-separated lists where not. Delete the now-redundant parentheticals (see related finding "V11g and V6d Deps fields contain rationale-only asides (cruft)").

**Plan edits.**
- `plan_topics/v2-expressions.md` V2a — `Deps. V1.` → `Deps. V1a–V1e.`
- `plan_topics/v3-frontmatter.md` V3a — `Deps. V2.` → `Deps. V2a.` (frontmatter parsing only needs the binding surface; verify against V3a's Tests).
- `plan_topics/v5-untyped-queries.md` V5a — `Deps. M, V2.` → `Deps. M, V2a.`
- `plan_topics/v6-typed-queries.md` V6c — `Deps. V4, V6b.` → `Deps. V4a–V4d, V6b.` (the AJV pipeline pieces V6c needs; verify scope).
- `plan_topics/v6-typed-queries.md` V6d — `Deps. V6c, V9 (functions). *(Order: ...)*` → `Deps. V6c, V9a–V9e.` and delete the parenthetical.
- `plan_topics/v6-typed-queries.md` V6e — `Deps. V6c, V9.` → `Deps. V6c, V9a–V9e.`
- `plan_topics/v6-typed-queries.md` V6i — `Deps. V6c, V4.` → `Deps. V6c, V4a–V4i.` (V6i needs the full AJV pipeline; verify against its Tests).
- `plan_topics/v7-match.md` V7a — `Deps. V2.` → explicit set.
- `plan_topics/v8-control-flow.md` V8a — `Deps. V2.` → explicit set including V2f (truthiness, cited in V8a Tests).
- `plan_topics/v9-functions.md` V9a — `Deps. V2, V1c.` → explicit V2 leaves plus V1c.
- `plan_topics/v10-enums.md` V10a — `Deps. V4.` → explicit set.
- `plan_topics/v12-subagent.md` V12e — `Deps. V12a, V6.` → explicit V6 leaf set the return-value plumbing actually relies on.
- `plan_topics/v15-invoke.md` V15a — `Deps. V12, V14k–V14p (discovery roots).` → explicit V12 leaf set, keep V14k–V14p, drop the parenthetical.
- `plan_topics/v15-invoke.md` V15c — `Deps. V15a, V4.` → explicit V4 leaf set.
- `plan_topics/v17-warp.md` V17a — `Deps. V1.` → `Deps. V1a–V1e.`

**Spec edits.** None.

For each leaf, validate the substituted set against that leaf's Tests bullets — the Tests reveal which surface is actually exercised. When a substitution is uncertain, prefer the larger set (the author can shrink it later) rather than guessing a subset. The resulting DAG becomes mechanically checkable: a future lint can grep for `V[0-9]+` not followed by a letter in any `Deps.` field and fail.

A leaf added to a group later that a dependent leaf actually does need will not be retroactively added — this is the correct failure mode (it forces explicit thought rather than silently widening the prerequisite set).

## Related Findings

- "V11g and V6d Deps fields contain rationale-only asides (cruft)" — co-resolve (V6d's parenthetical disappears once `V9` is replaced with `V9a–V9e`; the same edit pass should handle both)
- "V12a missing from V14e Deps" — same-cluster (independent missing-dep issue in the same DAG; resolve separately)
- "V14e missing V12a from Deps (duplicate of V12 ordering finding)" — same-cluster (same as above; flagged twice in the source review)
- "V14n / V14o missing V14q from Deps despite citing its collision rule in Tests" — same-cluster
- "V14o missing V14n from Deps" — same-cluster
- "V15n Deps missing V17j; meta-level dep note in Tests is cruft" — same-cluster
- "V16e ordering: forward Dep on V16o with misleading file order" — same-cluster
- "V14c tests registered-loom callees before V15e creates them (ordering gap)" — same-cluster
- "V6 leaf file order: V6k appears before V6j" — same-cluster (file-order issue, but lives in the same V6 group whose Deps are being re-stated)

---

# Per-leaf `CHANGELOG.md` and `notes.md` updates have no bootstrap leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** CHANGELOG.md / notes.md creation violates CLAUDE.md
**Kind:** doc-alignment-broad

## Finding

`plan_topics/conventions.md` line 41 mandates that "after each leaf, update `README.md`'s status table and append a one-line dated entry to `CHANGELOG.md`. The plan itself is updated only when the **plan** changes; non-plan discoveries go to `notes.md`." Neither `CHANGELOG.md` nor `notes.md` exists in the repository today (only `README.md` is present at the project root), and no leaf — including H1, where bootstrap work lives — lists either file in its `Adds.` field, includes a Tests bullet for it, or otherwise records its creation.

The first implementer to complete a leaf will therefore have to create both files unprompted, with no prior leaf having authorised them. The convention also embeds a forward reference to documents the plan never schedules into existence — a structural defect that two reasonable implementers will diverge on (one creates the files and proceeds, one routes notes into `README.md`, one stops to ask).

## Plan Documents

- `plan_topics/conventions.md` — Cross-cutting rules → "Doc updates" bullet (edited)
- `plan_topics/h1-scaffold.md` — `Adds.` / `Tests.` / `Ships when` (edited)
- `plan.md` — "How to use this plan" / horizontal-phase index (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

## Consequence

**Severity:** correctness

Without a resolution, the per-leaf phase-exit ritual is ambiguous in its very first step: implementers either silently skip the convention or silently retarget it to `README.md`. The `CHANGELOG.md` / `notes.md` workflow becomes unreliable, the project history that the convention is meant to produce is incoherent across leaves, and review of any leaf cannot observe whether the doc-update gate was met.

## Solution Space

**Shape:** single

### Recommendation

Bootstrap `CHANGELOG.md` and `notes.md` in H1 so the per-leaf doc-update convention has real targets from day one.

**Plan edits.**
- In `plan_topics/h1-scaffold.md`, append to `Adds.`: `; project bootstrap files CHANGELOG.md (Keep-a-Changelog header only) and notes.md (header only), created once so the per-leaf doc-update convention has stable targets.`
- In `plan_topics/h1-scaffold.md`, add a Tests bullet: `File-presence test: CHANGELOG.md and notes.md exist at the project root with the expected headers.`
- In `plan_topics/h1-scaffold.md`, extend `Ships when.`: `… and CHANGELOG.md / notes.md present at the project root.`
- In `plan_topics/conventions.md`, append to the "Doc updates" bullet a parenthetical: `(Both files are bootstrapped in H1; do not re-create.)`

**Spec edits.** None.

Edge case for the implementer: pin the Keep-a-Changelog header form (e.g. the standard `# Changelog` + format/versioning links + `## [Unreleased]` section) so the file-presence test has a stable target rather than asserting only file existence; `notes.md` only needs `# Notes` plus a one-line description of its purpose.

## Related Findings

- "`docs/manual-smoke.md` does not exist and its creation violates CLAUDE.md" — co-resolve (same root question, resolved together: H4 bootstraps `docs/manual-smoke.md` on the same precedent)
- "Exception-handling convention weaker than CLAUDE.md" — same-cluster (different convention bullet, separate fix)

