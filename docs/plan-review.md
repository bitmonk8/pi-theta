# pi-loom — Consolidated Plan Review

_Generated: 2026-05-05T08:11:29Z_
_Source: docs/reviews/plan-review/plan-20260505-083349.md_
_63 findings retained, 3 false positives dropped, 0 persistent failures_

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

---

# REQ-ID infrastructure has no owning leaf; V18o gate passes vacuously

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** REQ-ID system referenced everywhere but no leaf creates it
**Kind:** traceability, consistency, implementability, assumptions, codebase-grounding-broad, validation

## Finding

The plan and spec describe a complete REQ-ID traceability system that is not actually implemented anywhere in the repository. `spec.md` Appendix — REQ-ID prefix table assigns a stable per-page prefix to every non-narrative spec page (`LEX`, `TYPE`, `SCHM`, `DESC`, `SUBS`, `FRNT`, `QRY`, `EXPR`, `BNDG`, `CTRL`, `ERR`, `RET`, `FN`, `TOOL`, `INV`, `IMP`, `DISC`, `SLSH`, `BIND`, `CNCL`, `DIAG`, `RVM`, `PIC`, `IMPL`, `PIE`, `GRAM`). `plan_topics/conventions.md` mandates that every leaf's Tests bullet cite a REQ-ID inline (e.g. `BIND-7: ...`). `plan_topics/coverage-matrix.md` declares itself "section-level scaffolding that pre-dates the REQ-ID assignment pass." `plan_topics/v18-cancellation.md` V18o defines a CI gate that diffs REQ-IDs grepped from `spec_topics/*.md` against REQ-IDs grepped from `coverage-matrix.md`.

What does not exist:

1. Zero `**PREFIX-N.**` markers or `<a id="prefix-n"></a>` anchors in any file under `spec_topics/`. A `grep -roh -E '\b(LEX|TYPE|SCHM|DESC|SUBS|FRNT|QRY|EXPR|BIND|BNDG|CTRL|ERR|RET|FN|TOOL|INV|IMP|DISC|SLSH|CNCL|DIAG|RVM|PIC|IMPL|PIE|GRAM)-[0-9]+\b' spec_topics/` returns nothing.
2. Zero leaves cite a REQ-ID in any Tests bullet. The only `BIND-7` token in the repo is the example in `conventions.md` itself.
3. `coverage-matrix.md` rows still key on spec sections, not REQ-IDs.
4. The "Phase 12b" referenced by `coverage-matrix.md`'s preamble does not exist (V12b is "`system:` field declaration", unrelated).
5. No leaf in `plan.md` owns the work of inserting anchors, re-pivoting the matrix, or backfilling citations.

The consequence is that V18o's gate diffs an empty set against an empty set and passes for any spec content. The convention requiring REQ-ID citation per leaf cannot be obeyed because the IDs do not exist. The traceability story the spec advertises in Appendix is fictional until a leaf takes ownership of standing it up.

## Plan Documents

- `plan_topics/conventions.md` — "Leaf format" section, "Cross-cutting rules — REQ-ID discipline" section (read-only; the rules are correct, only the work to satisfy them is missing)
- `plan_topics/coverage-matrix.md` — preamble + every row (edited; preamble loses the "Phase 12b" sentence and gains a forward reference; rows are re-pivoted to per-REQ-ID granularity)
- `plan_topics/v18-cancellation.md` — V18o (edited; Deps gain the new owning leaf, Adds/Tests text loses the "passes vacuously" failure mode)
- `plan.md` — Horizontal phases or Vertical slices section (edited; new leaf added to the listing)
- `plan_topics/h1-scaffold.md` … `plan_topics/v18-cancellation.md` (every per-phase file) — Tests bullets across all leaves (option-dependent; under Option A every existing leaf is rewritten to cite REQ-IDs, under Option B the rewrite is deferred to the closing leaf)

## Spec Documents

- `spec.md` — Appendix — REQ-ID prefix table (read-only; prefix table is correct as-is)
- `spec_topics/lexical.md`, `type-system.md`, `schemas.md`, `descriptions.md`, `schema-subset.md`, `frontmatter.md`, `query.md`, `expressions.md`, `bindings.md`, `control-flow.md`, `errors-and-results.md`, `return.md`, `functions.md`, `tool-calls.md`, `invocation.md`, `imports.md`, `discovery.md`, `slash-invocation.md`, `binder.md`, `cancellation.md`, `diagnostics.md`, `runtime-value-model.md`, `pi-integration-contract.md`, `implementation-notes.md`, `pi-integration.md`, `grammar.md` — every normative obligation gets a `**PREFIX-N.**` marker (edited)

## Affected Leaves

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- `<new>` — REQ-ID anchor insertion and coverage-matrix re-pivot — (added)
- `V18o` — Per-call timeout marker / coverage-matrix closing gate — (modified)

(All other leaves are touched only at Tests-bullet-citation granularity; under Option A they are mass-edited as part of the new leaf, under Option B they are individually backfilled. This is per-leaf editorial work, not a structural change to any leaf's contract.)

## Consequence

**Severity:** blocking

V18o's CI gate is the project's V1.0 acceptance check for spec coverage. As written today it inspects two empty sets and reports success regardless of how much normative spec text ships unimplemented. Implementers also cannot satisfy the leaf-format convention "one bullet per REQ-ID … cite the ID inline" because there are no IDs to cite. Without a leaf that owns the anchoring + re-pivot work, the entire traceability story collapses and V18o ships as a no-op gate that gives false confidence at V1.0.

## Solution Space

**Shape:** single

### Recommendation

Insert a new horizontal phase **`H5 — REQ-ID anchor insertion and coverage-matrix re-pivot`** between H4 and M. The leaf walks every non-narrative spec page, inserts `**PREFIX-N.**` markers at each normative obligation, re-pivots `coverage-matrix.md` rows from section keys to REQ-ID keys, and is the gating point for the convention "one Tests bullet per REQ-ID" to become enforceable. From M onward every leaf cites real IDs from day one; nothing needs backfill.

**Plan edits.**
- `plan.md` Horizontal phases section: insert `- [H5 — REQ-ID anchor insertion and coverage-matrix re-pivot](./plan_topics/h5-req-ids.md)` after H4.
- `plan_topics/h5-req-ids.md` (new file): full leaf with `Spec.` listing every page in the prefix table, `Adds.` describing the anchor pass, `Tests.` asserting (i) every non-narrative spec page contains ≥1 `PREFIX-N` marker, (ii) `coverage-matrix.md` has one row per REQ-ID, (iii) the V18o `comm -23` diff is empty against current spec text, `Deps.` `H4`, `Ships when.` "the V18o gate is enabled and green against current spec content."
- `plan_topics/coverage-matrix.md` preamble: strike the sentence "The current rows below are section-level scaffolding that pre-dates the REQ-ID assignment pass; rows below will be re-pivoted to per-REQ-ID granularity as Phase 12b assigns REQ-IDs page-by-page (see [Conventions — REQ-ID discipline](conventions.md))." Replace with: "Rows are keyed per REQ-ID (per the prefix table in [`../spec.md`](../spec.md)); H5 owns the initial population pass."
- `plan_topics/v18-cancellation.md` V18o `Deps.` field: add `H5` to the list. Strike the parenthetical "(the citation pass is editorial and ships incrementally with the leaves themselves)" — the bulk pass is now H5's responsibility and only post-H5 leaves carry their own citations as they ship.

**Spec edits.** Every page listed in the prefix table gets `**PREFIX-N.**` markers inserted at each normative obligation. Pure-narrative pages (`overview.md`, `glossary.md`, `influences.md`, `comparison.md`, `related-work.md`, `future-considerations.md`) are untouched.

The convention `conventions.md` already requires "one bullet per REQ-ID" from the first leaf; satisfying that convention only at the end of V18 (the alternative considered) would mean every leaf in between ships in violation of its own format spec, which is a worse defect than the one this finding raises. The immutability concern for REQ-IDs across spec churn is already covered by the "Spec drift" cross-cutting rule (stop, fix spec, resume).

Implementer-relevant edge cases for the H5 leaf:

- The new leaf's Tests assertion (i) must use the union of all prefixes from the appendix table, not the literal string `PREFIX-`; see the related finding "V18o CI command assumes sorted input and literal `PREFIX-` prefix" for the corresponding V18o fix.
- Pure-narrative pages must be excluded from assertion (i)'s denominator; the prefix table marks them `(no IDs — narrative)`.
- Deleting the `coverage-matrix.md` "Phase 12b" sentence is part of this leaf, not a separate edit; see related finding `"Phase 12b" stale reference and embedded decision-log note`.

## Related Findings

- `"Phase 12b" stale reference and embedded decision-log note` — co-resolve (the same H5/V18p leaf strikes the stale sentence as part of its preamble rewrite)
- `V18o bundles per-call timeout marker with coverage-matrix CI gate` — decision-dependency (if V18o splits into V18o + V18p, the new owning leaf must pair with whichever half holds the gate; under Option B the names collide and one must be renamed)
- `V18o CI command assumes sorted input and literal `PREFIX-` prefix` — same-cluster (both findings concern the V18o gate's mechanics; this one stands up the IDs the gate inspects, the other fixes the gate's command form)
- `V18o wrong diagnostic code for `timeout:` field rejection` — same-cluster (touches V18o's other criterion; resolved independently)
- `Diagnostic-code coverage has no closing CI check parallel to V18o's REQ-ID gate` — same-cluster (proposes a parallel gate for diagnostic-code coverage; the H5/V18p model here is the template for that follow-on leaf)
- `"V1 reference implementation" identifier collision` — same-cluster (its suggested fix references "`IMPL-N` once REQ-IDs are assigned" — depends on this leaf shipping first)

---

# `V1` is overloaded: plan-phase ID and loom language version

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** "V1 reference implementation" identifier collision
**Kind:** traceability, consistency, implementability, assumptions, codebase-grounding-broad, validation

## Finding

`plan_topics/conventions.md` (§2–3) reserves the IDs `V1`–`V18` for the plan's vertical-slice phases — `V1` is "Lexer hardening". The spec, by contrast, uses bare "V1" throughout `spec_topics/` to mean "the initial release of the loom language" (i.e. loom 1.0): "not in V1", "exhaustiveness not statically checked in V1", "V1-supported provider set", "no privacy modifier in V1", and so on. Several plan leaves inherit that spec phrasing verbatim into their own `Adds` / `Spec` bullets, producing a direct collision between two unrelated meanings of the same token inside the plan corpus.

Concrete instances inside `plan_topics/`:

- `v6-typed-queries.md` V6i — `Spec.` parenthetical "(V1 reference implementation of the typed-query mechanism)"; `Adds.` "Load-time check against the V1-supported provider set …", "No `before_provider_request` hook is installed in V1."
- `v12-subagent.md` V12a — `Spec.` parenthetical "(V1 reference implementation of the typed-query mechanism reused inside the spawned session)".
- `v10-enums.md` V10b — `Adds.` "RHS must be string literal in V1."
- `v7-match.md` V7i — `Adds.` "exhaustiveness not statically checked in V1."
- `v17-warp.md` V17g — `Adds.` "no privacy modifier in V1."
- `v16-binder.md` V16f — `Adds.` "no other surface consumes it in V1".
- `v16-binder.md` V16m — `Adds.` "the runtime does **not** surface it in V1".

In every case context disambiguates for a careful reader, but the same characters carry one meaning in `Deps.`/`Ships when.`/cross-references (plan-phase ID) and a different meaning two lines away in prose (language-release marker). The original framing of this finding cited only V6i and V12a; the actual surface area is seven leaves across five files plus the underlying convention.

## Plan Documents

- `plan_topics/conventions.md` — §2–3 (vertical-slice ID definition) (edited)
- `plan_topics/v6-typed-queries.md` — V6i `Spec.` and `Adds.` (edited)
- `plan_topics/v12-subagent.md` — V12a `Spec.` (edited)
- `plan_topics/v10-enums.md` — V10b `Adds.` (edited)
- `plan_topics/v7-match.md` — V7i `Adds.` (edited)
- `plan_topics/v17-warp.md` — V17g `Adds.` (edited)
- `plan_topics/v16-binder.md` — V16f `Adds.` (edited)
- `plan_topics/v16-binder.md` — V16m `Adds.` (edited)

## Spec Documents

None. The spec's own use of "V1" to denote loom 1.0 is internally consistent within the spec corpus (no spec page defines a phase called "V1"), and the plan-side fix removes the cross-corpus collision by paraphrasing on the plan side rather than rewriting the spec.

## Affected Leaves

**Phases:** Vertical V6, Vertical V7, Vertical V10, Vertical V12, Vertical V16, Vertical V17

**Leaves (implementation order):**

- V6i — AJV validation of typed query results (two-phase tool loop) — (modified)
- V7i — `MatchError` runtime panic — (modified)
- V10b — Explicit variant values — (modified)
- V12a — `mode: subagent` accepted; AgentSession spawn — (modified)
- V16f — `bind_context: none` — (modified)
- V16m — `ambiguous` envelope handling — (modified)
- V17g — Implicit export of all `.warp` top-level declarations — (modified)

## Consequence

**Severity:** advisory

An implementer reading V12a's `Spec.` line ("(V1 reference implementation of the typed-query mechanism reused inside the spawned session)") may pause to reconcile why a subagent leaf cites V1 — Lexer hardening — at all; the same goes for V6i. None of the seven sites would change executable behaviour under any reasonable interpretation, so no two implementers would write divergent code, but the wording costs comprehension cycles and weakens the convention that `V1`–`V18` are dedicated plan-phase IDs.

## Solution Space

**Shape:** single

### Recommendation

1. In `plan_topics/conventions.md`, append a sentence to §3 ("Vertical slices") fixing the namespace:

   > The IDs `H1`–`H4`, `M`, and `V1`–`V18` (and their `<group><letter>` leaf forms) are reserved for plan phases. When plan prose needs to refer to the initial release of the loom language, write "loom 1.0" or "the initial release"; never reuse "V1" for that meaning.

2. Edit each leaf bullet listed below, replacing the highlighted span with the literal replacement:

   - `plan_topics/v6-typed-queries.md` V6i `Spec.` — strike `(V1 reference implementation of the typed-query mechanism)`, insert `(reference implementation of the typed-query mechanism for loom 1.0)`.
   - `plan_topics/v6-typed-queries.md` V6i `Adds.` — replace `the V1-supported provider set` with `the loom-1.0-supported provider set`; replace `No \`before_provider_request\` hook is installed in V1.` with `No \`before_provider_request\` hook is installed in loom 1.0.`
   - `plan_topics/v12-subagent.md` V12a `Spec.` — strike `(V1 reference implementation of the typed-query mechanism reused inside the spawned session)`, insert `(reference implementation of the typed-query mechanism for loom 1.0, reused inside the spawned session)`.
   - `plan_topics/v10-enums.md` V10b `Adds.` — replace `RHS must be string literal in V1.` with `RHS must be string literal in loom 1.0.`
   - `plan_topics/v7-match.md` V7i `Adds.` — replace `exhaustiveness not statically checked in V1.` with `exhaustiveness not statically checked in loom 1.0.`
   - `plan_topics/v17-warp.md` V17g `Adds.` — replace `no privacy modifier in V1.` with `no privacy modifier in loom 1.0.`
   - `plan_topics/v16-binder.md` V16f `Adds.` — replace `no other surface consumes it in V1` with `no other surface consumes it in loom 1.0`.
   - `plan_topics/v16-binder.md` V16m `Adds.` — replace `the runtime does **not** surface it in V1` with `the runtime does **not** surface it in loom 1.0`.

Edge case for the implementer: do **not** rewrite occurrences of `V1` that appear in `Deps.` / `Ships when.` fields or in cross-references to the lexer-hardening phase (e.g. `v17-warp.md` line 8 `**Deps.** V1.`, `v2-expressions.md` line 8 `**Deps.** V1.`). Those uses are correct under the new convention. Only the prose occurrences listed above change.

## Related Findings

- "Ambiguous group-level leaf IDs in Deps fields" — same-cluster (both stem from the `V1`–`V18` namespace being overloaded; the conventions.md edit landing here can co-locate with the group-level-Deps disambiguation rule, but the two findings resolve independently)
- "Static-resolution cache named three different ways" — same-cluster (sibling terminology-hygiene defect; independent fix)
- "V13 title inconsistency and \"retry\" terminological conflict" — same-cluster (sibling terminology-hygiene defect; independent fix)

---

## plan_topics/coverage-matrix.md

---

# "Phase 12b" stale reference and embedded decision-log note

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** "Phase 12b" stale reference and embedded decision-log note
**Kind:** cruft, traceability, assumptions

## Finding

The preamble of `plan_topics/coverage-matrix.md` ends with: "The current rows below are section-level scaffolding that pre-dates the REQ-ID assignment pass; rows below will be re-pivoted to per-REQ-ID granularity as Phase 12b assigns REQ-IDs page-by-page (see [Conventions — REQ-ID discipline](conventions.md))."

No "Phase 12b" exists in `plan.md`. The plan's phase taxonomy is H1–H4 / M / V1–V18; `12b` only appears as the leaf id `V12b` (the `system:` field declaration in `plan_topics/v12-subagent.md`), which is unrelated to REQ-ID pivoting. A reader following the reference therefore hits a dead end.

Beyond the dangling identifier, the sentence is a decision-log entry — it describes an editorial transition the matrix is "currently in the middle of" — rather than a normative property of the matrix. Decision-log content does not belong in a coverage-gate source-of-truth document; the surrounding paragraph already establishes (correctly) that V18o is the gate and that the prefix table in `spec.md` is the source of REQ-IDs.

## Plan Documents

- `plan_topics/coverage-matrix.md` — preamble paragraph (edited)
- `plan.md` — phase index (read-only — to confirm absence of "Phase 12b")
- `plan_topics/conventions.md` — REQ-ID discipline (read-only)
- `plan_topics/v18-cancellation.md` — V18o (read-only)

## Spec Documents

- `spec.md` — Appendix § REQ-ID prefix table (read-only)

## Affected Leaves

**Phases:** None

**Leaves (implementation order):** None

(The fix is a one-sentence deletion in a non-leaf document; no leaf's Spec / Adds / Tests / Deps / Ships-when fields change.)

## Consequence

**Severity:** cosmetic

A reader of `coverage-matrix.md` who tries to look up "Phase 12b" in `plan.md` finds nothing and is left guessing whether the matrix is waiting on a missing leaf or describing a completed transition. The matrix still functions as the V18o input, but the dangling reference erodes confidence in the document and invites the next editor to invent a "Phase 12b" leaf to satisfy it.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/coverage-matrix.md`, in the preamble paragraph immediately following the heading `# Spec coverage matrix`, strike the second sentence verbatim:

> The current rows below are section-level scaffolding that pre-dates the REQ-ID assignment pass; rows below will be re-pivoted to per-REQ-ID granularity as Phase 12b assigns REQ-IDs page-by-page (see [Conventions — REQ-ID discipline](conventions.md)).

Leave the first sentence ("Every executable spec section maps to a closing leaf. The V18o gate (per [V18 — V18o](v18-cancellation.md)) enforces a stricter property in CI: every REQ-ID emitted by any spec page (per the prefix table in [`../spec.md`](../spec.md)) must have at least one mapping in this matrix.") and the closing paragraph ("If, when V18o closes, any executable spec REQ-ID lacks a matrix mapping…") untouched. Do not insert a replacement sentence; the matrix's section-level state is self-evident from inspection and any forward reference belongs on the leaf that owns the REQ-ID assignment pass — see the related "REQ-ID system referenced everywhere but no leaf creates it" finding, which creates that leaf and may re-add a forward reference here when it lands.

## Related Findings

- "REQ-ID system referenced everywhere but no leaf creates it" — co-resolve (the offending sentence promises work that has no owning leaf; the companion finding adds the leaf, this finding deletes the orphaned forward reference; both edits land in one commit but neither blocks the other)

---

# V3c missing from `Invocation from Pi` coverage row

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** V3c missing from `Invocation from Pi` coverage row
**Kind:** consistency

## Finding

The coverage matrix maps `[Invocation from Pi](../spec_topics/slash-invocation.md)` to `V16a–V16p, V18i`. That spec page contains a normative **No-params overflow** rule (`spec_topics/slash-invocation.md` §"No-params overflow"): when the loom takes no parameters and the user typed extra text after the command name, the runtime emits the system note `loom /<name>: ignoring extra arguments — this loom takes no parameters`.

The leaf that closes this rule is `V3c — Bypass binder (no-params and single-string forms)` (`plan_topics/v3-frontmatter.md`). V3c's `Spec.` field cites both `binder.md` and `slash-invocation.md` (no-params overflow) explicitly, and its `Adds.` bullet pins the exact system-note wording. `M` (`plan_topics/m-mvp.md`) ships a partial version of the same rule for the no-params MVP loom. Neither leaf is listed in the `Invocation from Pi` row — only the binder-bypass row mentions V3c.

The closing-leaf-per-spec-rule contract therefore fails for the no-params overflow rule on the `Invocation from Pi` page: a section-row matrix lookup for that page returns no leaf that asserts the overflow message.

## Plan Documents

- `plan_topics/coverage-matrix.md` — `[Invocation from Pi]` row (edited)
- `plan_topics/v3-frontmatter.md` — V3c (read-only)
- `plan_topics/m-mvp.md` — M (read-only)

## Spec Documents

- `spec_topics/slash-invocation.md` — "No-params overflow" paragraph (read-only)
- `spec_topics/binder.md` — Binder bypass section (read-only)

## Affected Leaves

**Phases:** MVP, Vertical V3

**Leaves (implementation order):**

- M — Minimal end-to-end loom — (modified)
- V3c — Bypass binder (no-params and single-string forms) — (modified)

## Consequence

**Severity:** correctness

V18o's coverage gate diffs spec REQ-IDs against matrix mappings; today the `Invocation from Pi` row claims its closing leaves are `V16a–V16p, V18i`, none of which assert the no-params overflow system note. Once REQ-IDs land on `slash-invocation.md`, the REQ-ID for the overflow rule will either appear unmapped (gate failure with a misleading "no leaf owns this rule" message — the rule is owned, just filed under the wrong row) or be silently mapped to a V16 leaf that has no business asserting it, producing a vacuous gate pass.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/coverage-matrix.md`, change the `Invocation from Pi` row from

```
| [Invocation from Pi](../spec_topics/slash-invocation.md) | V16a–V16p, V18i |
```

to

```
| [Invocation from Pi](../spec_topics/slash-invocation.md) | M (no-params overflow, partial), V3c (no-params overflow), V16a–V16p, V18i |
```

Leave the `[Slash-Command Argument Binding — bypass]` row mapping to `V3c` unchanged: V3c legitimately closes both the binder-bypass mechanism (owned by `binder.md`) and the no-params overflow message (owned by `slash-invocation.md`), and the matrix correctly cross-lists leaves that close rules on multiple spec pages elsewhere (e.g. V12a appears in both `Overview — Scope of a Loom File` and `Pi Integration Contract`). The parenthetical role tags ("no-params overflow", "no-params overflow, partial") match the existing convention used by neighbouring rows (e.g. `V13e (general), V10f (enums)`).

Edge case for the implementer: do not split this into a sub-row `[Invocation from Pi — No-params overflow]`. The `Invocation from Pi` page has no other sub-divisions in the matrix, and a one-off sub-row would obscure the fact that the same row's V16 leaves also touch `slash-invocation.md`.

## Related Findings

- "V18n missing from `Invocation` coverage row" — same-cluster (sibling row-completeness gap; edited independently in the same matrix)
- ""Phase 12b" stale reference and embedded decision-log note" — same-cluster (also edits `coverage-matrix.md`; can be co-edited but resolves independently)
- "REQ-ID system referenced everywhere but no leaf creates it" — decision-dependency (the per-REQ-ID re-pivot will eventually replace section rows with REQ-ID rows; this row-fix is still needed in the interim because the re-pivot is not scheduled)

---

# V18n missing from `Invocation` coverage row

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** V18n missing from `Invocation` coverage row
**Kind:** consistency

## Finding

The `Invocation` row in `plan_topics/coverage-matrix.md` maps `spec_topics/invocation.md` to `V15a–V15n`. V18n closes the **Invocation depth bound** rule that lives in `invocation.md` (the per-chain cap of 32 across direct `invoke`, `tools:`-registered loom calls, and `.warp` `fn` invokes, raising `loom/runtime/invoke-depth`). V18n's `Spec.` field cites `Invocation — Invocation depth bound, Failures` explicitly, and its tests assert the cap, sibling-budget independence, and the parent-side `InvokeInfraError { reason: "panic" }` surface — all properties of the Invocation spec, not of generic runtime panics.

Because V18n is listed only in the `Errors and Results — runtime panics` row (alongside V7i, V18k–V18m), the matrix violates the closing-leaf-per-spec-rule contract for the Invocation page: a reader auditing whether every Invocation rule has a closing leaf will not find one for the depth bound. Once REQ-IDs land under the `INV` prefix for the depth-bound paragraph, the V18o gate will not flag this — V18n is *somewhere* in the matrix — but the Invocation row itself will be silently incomplete and the page-to-leaf audit that the matrix is designed to support will give the wrong answer.

## Plan Documents

- `plan_topics/coverage-matrix.md` — `Invocation` row, ~line 53 (edited)
- `plan_topics/v18-cancellation.md` — V18n entry, ~line 107 (read-only)
- `plan_topics/v15-invoke.md` — V15a–V15n leaves (read-only)

## Spec Documents

- `spec_topics/invocation.md` — "Invocation depth bound" paragraph (read-only)
- `spec_topics/errors-and-results.md` — runtime panics section (read-only)

## Affected Leaves

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18n — Panic routing: `invoke` parent surface — (modified)

## Consequence

**Severity:** advisory

The plan still ships the depth-bound behaviour because V18n exists and its tests are concrete, and the V18o gate (REQ-ID-based) will pass once `INV` REQ-IDs are cited in V18n's `Tests.` bullet. What is lost is the page-to-leaf audit: anyone reading the `Invocation` row to confirm every Invocation rule has a closing leaf will conclude the depth bound is unimplemented, and reviewers walking the matrix top-down will not see V18n as part of the Invocation surface.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/coverage-matrix.md`, replace the `Invocation` row

```
| [Invocation](../spec_topics/invocation.md) | V15a–V15n |
```

with

```
| [Invocation](../spec_topics/invocation.md) | V15a–V15n, V18n (depth bound) |
```

Leave the existing `Errors and Results — runtime panics` row unchanged — V18n remains a panic-routing closing leaf as well as an Invocation closing leaf, and the matrix already permits the same leaf in multiple rows (e.g. V7i appears in both `Errors and Results — runtime panics` and the `match` patterns row's neighbourhood; V13e is split across multiple rows). Do not add a separate sub-row; the parenthetical `(depth bound)` is enough to tell a reader which Invocation rule V18n closes without fragmenting the row.

No change is required to `v18-cancellation.md` itself — V18n's `Spec.` already cites `Invocation — Invocation depth bound, Failures`, so the leaf-side traceability is correct; only the matrix-side row is missing the back-link.

## Related Findings

- "V3c missing from `Invocation from Pi` coverage row" — co-resolve (same file, same closing-leaf-per-spec-rule defect, fix in the same edit pass)
- "REQ-ID system referenced everywhere but no leaf creates it" — decision-dependency (once REQ-IDs are assigned, the matrix re-pivots to per-REQ-ID rows and this row-level fix is subsumed; until then the textual fix above stands)
- "'Phase 12b' stale reference and embedded decision-log note" — same-cluster (same file, preamble vs. row body; resolves independently)
- "Closed diagnostic registry — many codes have no asserting plan leaf" — same-cluster (also a coverage-completeness defect, but for the diagnostics registry rather than the matrix; resolves independently)

---

# `SlashCommandSource = "subagent"` does not exist in Pi

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** `` `SlashCommandSource = "subagent"` does not exist in Pi ``
**Kind:** codebase-grounding-broad

## Finding

The spec and plan both treat `"subagent"` as one of the Pi-owned slash-command sources the loom extension must check for cross-format collisions. The installed Pi SDK (`@mariozechner/pi-coding-agent/dist/core/slash-commands.d.ts`) declares the source union as exactly `type SlashCommandSource = "extension" | "prompt" | "skill"` — `"subagent"` is not an arm. Pi has no `.md`-subagent slash-command surface at all: subagents in Pi are spawned via `createAgentSession(...)`, never registered as commands enumerable through `pi.getCommands()`.

Two concrete consequences. (1) `spec_topics/pi-integration-contract.md` step 3 instructs the `session_start` handler to drop pending looms whose name collides with an entry whose `source` is `"prompt"`, `"subagent"`, or `"extension"`. The `"subagent"` arm can never match — it is unreachable code by the SDK type definition — and the actual third source the SDK exposes (`"skill"`) is missing from the list, so a loom that collides with a Pi skill silently registers and shadows the skill. (2) `spec_topics/discovery.md` (§"Slash-name collisions at the same priority", and the paragraph below it) and `spec_topics/diagnostics.md` (the `loom/load/cross-format-collision` row) both describe the cross-format collision set as `.md` prompt / `.md` subagent / another extension's command. V14q's `Adds` and `Tests` mirror that wording verbatim, including a Tests bullet that demands a fixture exercising "the same for `.md` subagent". No such fixture can be constructed, because Pi has no `.md`-subagent slash registration to collide against.

The fix is mechanical: drop `"subagent"` everywhere it appears as a slash-command source, add `"skill"` to the same lists so the SDK's actual third source is covered, and (optionally) record under future considerations that if Pi ever exposes Pi-owned subagents as slash commands, V14q's collision set widens.

## Plan Documents

- `plan_topics/v14-tool-calls.md` — V14q (Adds, Tests) (edited)
- `plan_topics/coverage-matrix.md` — `[Pi Extension Integration]` and `[Directory Convention]` rows (read-only — V14q stays the closing leaf, only its body changes)

## Spec Documents

- `spec_topics/pi-integration-contract.md` — §"Extension entry point" step 3 (edited)
- `spec_topics/discovery.md` — §"Slash-name collisions at the same priority" and the immediately following paragraph (edited)
- `spec_topics/diagnostics.md` — `loom/load/cross-format-collision` row (edited)
- `spec_topics/future-considerations.md` — Pi-API extensions list (option-dependent — only edited if the deferred-capability note is added)
- `spec_topics/overview.md` — `.md` prompts/subagents bullet at line 18 (read-only — Pi does have subagents conceptually; that sentence is fine)

## Affected Leaves

**Phases:** Vertical V14

**Leaves (implementation order):**

- V14q — Slash collision at the same priority (uniform across formats and sources) — (modified)

## Consequence

**Severity:** correctness

The spec and V14q direct an implementer to compare `pi.getCommands()` entries against a source-string set that omits `"skill"` and includes `"subagent"`. A faithful TypeScript implementation either fails to type-check (the literal `"subagent"` is not assignable to `SlashCommandSource`) or, if written loosely, silently mis-classifies: a loom shadowing a Pi skill registers without diagnostic, while a hypothetical-but-impossible "subagent" branch is dead code. The V14q tests demanding a `.md`-subagent collision fixture cannot be satisfied at all, so the leaf cannot reach `Ships when` against the live SDK.

## Solution Space

**Shape:** single

### Recommendation

Edit four spec/plan locations to align with the installed Pi SDK's `SlashCommandSource = "extension" | "prompt" | "skill"`. Replace every occurrence of `"subagent"` (or `.md subagent` / `.md subagents`) in the slash-command source-collision context with `"skill"` (or `.md skill` / `.md skills`).

1. **`spec_topics/pi-integration-contract.md`**, line 9, in the `session_start` handler bullet: change
   > drops any pending loom whose slash name collides with an existing entry whose `source` is `"prompt"`, `"subagent"`, or `"extension"`

   to

   > drops any pending loom whose slash name collides with an existing entry whose `source` is `"prompt"`, `"extension"`, or `"skill"` (the three arms of Pi's `SlashCommandSource` union, per `@mariozechner/pi-coding-agent`'s `core/slash-commands.d.ts`)

2. **`spec_topics/discovery.md`**, §"Slash-name collisions at the same priority" (line 60) and the following paragraph (line 64): replace each phrase of the form "`.md` prompt or subagent or another extension's command" / "`.md` prompt template, subagent, or extension command" / "`.md` prompts, `.md` subagents, and other extensions' commands" with the parallel form using `.md` prompt / `.md` skill / another extension's command (Pi-owned `.md` skills are the third Pi-side slash-command surface; Pi-owned subagents are not slash-command-registered and therefore cannot collide). The asymmetry rule (Pi-owned entry wins, the loom drops) is unchanged.

3. **`spec_topics/diagnostics.md`**, line 174, `loom/load/cross-format-collision` row: in the description, change "the cross-format case (`.loom` vs Pi-owned `.md` prompt / `.md` subagent / another extension's command)" to "the cross-format case (`.loom` vs Pi-owned `.md` prompt / `.md` skill / another extension's command)".

4. **`plan_topics/v14-tool-calls.md`**, V14q:
   - In `Adds.` (line 134): replace "a `.loom` and a Pi-owned `.md` prompt / `.md` subagent / another extension's command" with "a `.loom` and a Pi-owned `.md` prompt / `.md` skill / another extension's command".
   - In `Tests.` (line 135): replace "same for `.md` subagent and another extension's command" with "same for `.md` skill and another extension's command".

Optionally, add a one-bullet entry to `spec_topics/future-considerations.md` recording that if Pi ever exposes Pi-owned subagents as enumerable slash commands (i.e. extends `SlashCommandSource` to include `"subagent"`), the cross-format collision set widens to four arms; V14q's tests would gain a parallel fixture at that point. Implementer note: do not introduce a `"subagent"` literal anywhere in V14q's TypeScript — the SDK union forbids it and `tsc` will reject it.

## Related Findings

- "`resources_discover` subscription and `{}` return — no plan leaf" — same-cluster (both are Pi-API surface gaps in V14/V18f's discovery wiring; resolved independently)
- "V14n / V14o missing V14q from Deps despite citing its collision rule in Tests" — same-cluster (touches V14q's surface but resolves independently — no overlapping edit)
- "`pi.registerCommand` argument-completions slot not wired; dynamic de-registration on collision not covered" — same-cluster (lives in the same `session_start` registration code path the V14q fix touches; resolves independently)

---

# V18o closing gate ignores the diagnostic-code registry

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** Closed diagnostic registry — many codes have no asserting plan leaf
**Kind:** validation, spec-coverage

## Finding

`spec_topics/diagnostics.md` is normative on three points: (1) every author-visible diagnostic carries a code from the registry table, (2) the registry is closed (adding/removing/renaming codes is a spec change), and (3) codes are stable identifiers — part of the public surface that tests, LSP integrations, and system-note formatters bind to. The registry currently enumerates roughly 117 codes across `loom/parse/*`, `loom/load/*`, `loom/runtime/*`, with a small `loom/lex/*` overlap.

The plan's only closure mechanism is V18o's "coverage-matrix closing gate," which is REQ-ID-only: it diffs `grep -roh 'PREFIX-[0-9]\+' spec_topics/` against the same grep over `plan_topics/coverage-matrix.md`. Diagnostic codes are not REQ-IDs and are not in the matrix. A grep over `plan_topics/*.md plan.md` finds about 41 of the 117 registered codes; the missing 76 include `loom/parse/invalid-path-separator`, `loom/parse/integer-narrowing`, `loom/parse/illegal-escape`, `loom/parse/duplicate-discriminator-value`, `loom/load/case-collision`, `loom/load/invalid-slash-name`, `loom/load/manifest-invalid`, `loom/load/manifest-escapes-package`, `loom/load/unreadable`, `loom/load/unreadable-source`, `loom/load/wrong-type-source`, `loom/load/settings-unreadable`, `loom/load/settings-invalid-json`, `loom/load/missing-mode`, `loom/load/unknown-mode-value`, `loom/load/invalid-encoding`, `loom/runtime/system-note-delivery-failed`, and many more. Several of these surface in adjacent review findings as "no asserting plan leaf" defects in their own right; the systemic root cause is that nothing closes over the registry.

The consequence is that a leaf can ship a diagnostic site with the wrong code (or the right shape but with no test asserting the literal code string), and both V18o and CI will pass. The "stable identifier" guarantee in the spec then degrades to advisory at best.

## Plan Documents

- `plan_topics/v18-cancellation.md` — V18o (edited)
- `plan_topics/coverage-matrix.md` — closing-gate paragraph (edited)
- `plan_topics/conventions.md` — "REQ-ID discipline" cross-cutting rule (edited)
- `plan_topics/h3-diagnostics.md` — Tests bullets (edited)
- `plan_topics/v1-lexer.md` — Tests bullets for `loom/parse/illegal-escape`, `invalid-path-separator`, `integer-narrowing`, etc. (edited)
- `plan_topics/v3-frontmatter.md` — Tests bullets for `loom/load/missing-mode`, `unknown-mode-value`, `params-null` (edited)
- `plan_topics/v11-discriminated-unions.md` — Tests bullets for `loom/parse/duplicate-discriminator-value`, `nested-discriminator` (edited)
- `plan_topics/v12-subagent.md` — Tests bullet for `loom/runtime/subagent-dispose-failure` (edited)
- `plan_topics/v14-tool-calls.md` — Tests bullets for the `loom/load/*` discovery codes across V14k–V14q (edited)
- `plan_topics/v18-cancellation.md` — Tests bullet for `loom/runtime/system-note-delivery-failed` on V18m (edited)
- `plan.md` — leaf list if a sibling closing leaf to V18o is introduced (option-dependent)

## Spec Documents

- `spec_topics/diagnostics.md` — registry table is read-only source of truth (read-only)

## Affected Leaves

**Phases:** Horizontal, Vertical V1, Vertical V3, Vertical V11, Vertical V12, Vertical V14, Vertical V18

**Leaves (implementation order):**

- H3 — Diagnostics primitive and multi-error accumulator — (modified)
- V1a–V1e — Lexer/parser slice — (modified)
- V3a–V3c — Frontmatter slice — (modified)
- V11b — Ambiguous-candidate diagnostic — (modified)
- V11c — Missing-discriminator diagnostic — (modified)
- V11d — Explicit `by <field>` form — (modified)
- V11e — Discriminator must be top-level — (modified)
- V12a — Subagent-mode loom — (modified)
- V14k — Discovery: global `~/.pi/agent/looms/` — (modified)
- V14l — Discovery: project `.pi/looms/` — (modified)
- V14m — Discovery: package `looms/` and `pi.looms` — (modified)
- V14n — Discovery: settings file reads — (modified)
- V14o — Discovery: `--loom` CLI flag — (modified)
- V14p — Source priority and shadowing warning — (modified)
- V14q — Slash collision at the same priority — (modified)
- V18m — Panic routing: top-level surface — (modified)
- V18n — Panic routing: `invoke` parent surface — (modified)
- V18o — Per-call timeout marker / coverage-matrix closing gate — (modified)

The Tests-bullet pass across the per-site leaves is editorial in the same sense as the existing REQ-ID citation pass — it ships incrementally with each leaf and does not block earlier ones.

## Consequence

**Severity:** correctness

If the plan ships unfixed, V18o passes vacuously over the diagnostic-code surface: an implementer who emits `loom/parse/illegal_escape` (underscore instead of hyphen), or who forgets `loom/load/manifest-escapes-package` entirely, ships a release that no closing gate flags. The spec's "codes are stable identifiers — part of the public surface" guarantee then has no enforcement mechanism, and downstream consumers (LSP, system-note renderers, test harnesses) bind to whatever ad-hoc strings the runtime happens to emit. Two reasonable implementers will diverge on which codes to actually wire.

## Solution Space

**Shape:** single

### Recommendation

Extend V18o (`plan_topics/v18-cancellation.md`) with a third closure criterion alongside the existing REQ-ID gate, and distribute per-code Tests bullets to the leaves that own each diagnostic site.

Concrete edits:

1. **`plan_topics/v18-cancellation.md`, V18o, `Adds.`** — add a third bullet:

   > 3. *Diagnostic-code registry closing gate.* Every code in the registry table of [`spec_topics/diagnostics.md`](../spec_topics/diagnostics.md) is asserted as a literal string by at least one test. Implementable as a CI check that diffs the set of `` `loom/(lex|parse|type|load|runtime)/<kebab>` `` literals grepped from the registry table against the same grep over the test suite (`grep -rohE '"loom/(lex|parse|type|load|runtime)/[a-z0-9-]+"' src/ test/`); any code present in the registry but absent from tests fails the gate, and any code present in tests but absent from the registry also fails (catches typos and unregistered emissions). The registry table is the single source of truth; the constants module the H3 primitive exposes is generated from or asserted equal to it.

2. **`plan_topics/v18-cancellation.md`, V18o, `Tests.`** — append:

   > Diagnostic-code gate returns empty diff (every registry code is asserted in at least one test); a synthetic spec edit that adds an unregistered code to the registry without a corresponding test flips the check to non-zero; a synthetic test asserting an unregistered code (typo) also flips the check to non-zero.

3. **`plan_topics/v18-cancellation.md`, V18o, `Ships when.`** — change `Both criteria observable in CI.` to `All three criteria observable in CI.`

4. **`plan_topics/v18-cancellation.md`, V18o, `Deps.`** — append `H3` (the diagnostics primitive owns the constants surface the gate diffs against).

5. **`plan_topics/coverage-matrix.md`, opening paragraph** — add a sentence parallel to the existing REQ-ID one:

   > The V18o gate enforces a second closure property: every code in the registry table of [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md) is asserted as a literal string by at least one test in the suite.

6. **`plan_topics/conventions.md`, "REQ-ID discipline" bullet** — append a sentence:

   > Diagnostic codes are subject to the same closing-gate discipline: a new code added to the registry MUST land its asserting test in the same edit; the V18o gate (per [V18 — V18o](v18-cancellation.md)) treats a registry code without an asserting test as a CI failure, mirroring the REQ-ID rule.

7. **`plan_topics/h3-diagnostics.md`, `Adds.`** — replace `typed code-namespace constants (\`loom/parse/*\`, \`loom/type/*\`, \`loom/load/*\`, \`loom/runtime/*\`)` with `the closed code constants enumerated by the registry table in [\`spec_topics/diagnostics.md\`](../spec_topics/diagnostics.md), grouped by namespace`.

8. **`plan_topics/h3-diagnostics.md`, `Tests.`** — append a bullet:

   > The exported constants set equals the set of codes parsed from the registry table of [`spec_topics/diagnostics.md`](../spec_topics/diagnostics.md) (no extras, no omissions).

9. **Per-site Tests-bullet pass.** Each leaf that emits a diagnostic gains an explicit `Tests.` bullet asserting the literal code string at the emission site (e.g. V14m gains `loom/load/manifest-invalid` and `loom/load/manifest-escapes-package`; V14k–V14p gain `loom/load/case-collision`, `loom/load/invalid-slash-name`, `loom/load/unreadable*`, `loom/load/wrong-type-source`, `loom/load/settings-*`; V11d/e gain `loom/parse/duplicate-discriminator-value`, `loom/parse/nested-discriminator`; V1a gains `loom/parse/illegal-escape`, `loom/parse/invalid-path-separator`, `loom/parse/integer-narrowing`; V12a gains `loom/runtime/subagent-dispose-failure`; V18m gains `loom/runtime/system-note-delivery-failed`). This pass is editorial and ships incrementally, mirroring the existing REQ-ID citation pass; the V18o gate catches anything missed.

Edge cases the implementer must watch:

- The grep regex for the registry table must restrict to the table itself (rows starting with `` | `loom/ ``), not the whole `diagnostics.md` body, to avoid matching codes mentioned only in prose. The `grep -rohE` over `src/ test/` must restrict to quoted string literals to avoid matching code-comment mentions that are not actual emissions.
- Codes whose emission sites the spec defers (none currently — the registry is closed at V1) MUST still be tested via a parser- or load-time fixture; "deferred to a future release" hints in the registry rows (e.g. `loom/parse/match-guard-not-supported`) refer to the **feature**, not the diagnostic, and the diagnostic itself is V1.
- The H3 constants module is the single export point; tests assert against constants, not bare strings, except for the V18o gate itself which deliberately greps string literals to catch out-of-band emissions.

## Related Findings

- "Path literals forward-slash rule and `loom/parse/invalid-path-separator` — no leaf" — co-resolve (the per-site Tests-bullet pass closes this; the gate prevents recurrence)
- "`loom/parse/integer-narrowing` — no plan leaf" — co-resolve (same)
- "`loom/load/missing-mode` and `loom/load/unknown-mode-value` — no asserting leaf" — co-resolve (same)
- "UTF-8 encoding, BOM consumption, and `loom/load/invalid-encoding` — no plan leaf" — co-resolve (same)
- "Empty schema and enum body diagnostics — no test leaf" — co-resolve (same, modulo the spec-side question of whether those codes belong in the registry)
- "Type-alias cycle detection (`loom/parse/type-alias-cycle`) — no plan leaf" — same-cluster (the cited code is not in the current registry; this finding asks whether it should be — orthogonal to closure)
- "`loom/parse/non-string-discriminator` — no test leaf" — same-cluster (same: registry-membership question, not closure)
- "`loom-system-note` delivery fallback chain unasserted" — co-resolve (the `loom/runtime/system-note-delivery-failed` Tests bullet on V18m is the same edit)
- "V18o wrong diagnostic code for `timeout:` field rejection" — decision-dependency (both touch V18o; resolve V18o's existing scope before grafting on the third criterion)
- "V18o bundles per-call timeout marker with coverage-matrix CI gate" — decision-dependency (if V18o is split, the diagnostic-code gate goes with the coverage half, not the timeout-marker half)
- "V18o CI command assumes sorted input and literal `PREFIX-` prefix" — same-cluster (the new grep command this finding proposes inherits the same correctness concerns; spec the regex precisely)
- "REQ-ID system referenced everywhere but no leaf creates it" — same-cluster (both findings flag closure gates that the plan promises but does not create infrastructure for)

---

## plan_topics/h1-scaffold.md

---

# `depcheck` gate is referenced but neither installed nor self-tested

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** `depcheck` gate not set up or self-tested
**Kind:** validation

## Finding

H1's `Ships when` clause requires "`depcheck` clean" as a release gate, but `depcheck` is absent from the leaf's `Adds` bullet (no devDependency, no `npm run depcheck` script) and absent from the `Tests` bullet (no fixture proving the gate fires when an unused dependency is present). The gate therefore has no defined invocation: the literal phrase `depcheck clean` admits an interpretation in which a repo without `depcheck` installed at all is "clean" because nothing ran.

The leaf as written is also internally inconsistent — the rest of the Ships-when command is a concrete shell line (`npm run typecheck && npm run lint && npm test`), but the `depcheck` half is prose with no executable mapping. An implementer either invents a script (and the spec/plan have no record of what it should be), or treats the clause as advisory and skips it.

## Plan Documents

- `plan_topics/h1-scaffold.md` — `Adds`, `Tests`, `Ships when` (edited)
- `plan_topics/conventions.md` — leaf-format / Ships-when conventions (read-only)
- `plan.md` — H1 entry (read-only)

## Spec Documents

None — `depcheck` is a project-convention tool with no REQ-ID basis in the spec.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one adds `depcheck` as a devDep with a script and a fixture-based negative test; another reads "depcheck clean" as aspirational and ships H1 without the tool installed. Because no Tests bullet exercises the gate, the regression cannot be caught later — H1 is declared green and the dead-dep guarantee silently does not hold for the rest of the plan.

## Solution Space

**Shape:** single

### Recommendation

Edit `plan_topics/h1-scaffold.md` as follows:

- In the `Adds` bullet, append to the npm-scripts list: `depcheck` (and add `depcheck` to the devDependencies enumerated alongside Vitest / ESLint / Prettier).
- In the `Tests` bullet, add a new sub-bullet:
  > `depcheck` self-test: a fixture package under `test/fixtures/depcheck-unused/` declares an unused dependency; the test invokes `npx depcheck` against the fixture and asserts a non-zero exit and that the unused dep name appears in stdout. A second fixture with no unused deps asserts exit 0.
- Replace the `Ships when` line with: `` `npm run typecheck && npm run lint && npm test && npm run depcheck` green. ``

The negative-fixture self-test is the load-bearing change — without it, future leaves can drift `depcheck`'s configuration (e.g. a broad `ignorePatterns`) into a state where the gate passes vacuously and no one notices.

Edge case for the implementer: `depcheck` flags TypeScript-only imports and dev-only tooling inconsistently; H1 must commit a `.depcheckrc` (or `package.json` `depcheck` block) that declares Vitest, ESLint plugins, Prettier, and `@types/*` as known-used, and the self-test must run with that config so the gate's real-world behaviour is what is being validated.

## Related Findings

- "GitHub Actions workflow added but never validated" — co-resolve (the same Tests-bullet expansion can assert `depcheck` is one of the workflow's required jobs)
- "H1 scaffolds engineering hygiene without spec basis" — decision-dependency (that finding proposes dropping `depcheck` from `Ships when` entirely; if accepted, this finding's recommendation collapses to "remove the clause" instead of "wire it up" — resolve that one first)

---

# H1 ships a GitHub Actions workflow with no test that it parses or runs the right gates

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** GitHub Actions workflow added but never validated
**Kind:** validation

## Finding

H1's `Adds` field promises a "GitHub Actions workflow file." Nothing else in the leaf observes it. The Tests bullets cover only the sentinel test, the per-directory `__present` re-export, and `no-static-state.test.ts`. The `Ships when` clause runs `npm run typecheck && npm run lint && npm test` plus `depcheck` — all locally. None of these would fail if the workflow YAML is syntactically broken, omits a required job, runs the wrong scripts, or is never picked up by GitHub at all.

The horizontal phases are precisely where the per-leaf TDD ritual is supposed to install enforcement that every later leaf relies on. If H1 ships with a non-functional or partial workflow, every subsequent leaf's "Ships when" — which never re-validates CI — passes locally while CI is silently green for the wrong reasons (or silently absent). The defect is invisible until a vertical-slice leaf accidentally triggers a regression that CI was supposed to catch and doesn't.

## Plan Documents

- `plan_topics/h1-scaffold.md` — `Adds`, `Tests`, `Ships when` (edited)
- `plan_topics/conventions.md` — Per-phase TDD ritual / Cross-cutting rules (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

## Consequence

**Severity:** correctness

A reasonable implementer satisfies H1's exit gate by writing any plausible-looking workflow file; a different implementer writes one that omits `depcheck` or misnames a job. Both ship `H1-complete`. Later leaves trust that CI enforces the H1 invariants (typecheck, lint, test, no-static-state, depcheck) and write no fallback assertions; when CI is wrong, the breakage surfaces as a vertical-slice regression with no obvious cause.

## Solution Space

**Shape:** single

### Recommendation

Edit `plan_topics/h1-scaffold.md` as follows:

1. In **Adds**, replace `GitHub Actions workflow file` with `GitHub Actions workflow file at .github/workflows/ci.yml with jobs typecheck, lint, test, depcheck; actionlint as a dev-dep + npm script (npm run lint:actions)`.

2. In **Tests**, append two bullets:
   - `Workflow shape test: parses .github/workflows/ci.yml as YAML; asserts top-level on.push and on.pull_request triggers exist; asserts jobs.typecheck, jobs.lint, jobs.test, jobs.depcheck each exist and each contains a step whose run command invokes the matching npm script (npm run typecheck, npm run lint, npm test, npm run depcheck respectively).`
   - `Workflow lint test: npm run lint:actions (actionlint) exits 0 on the committed workflow; exits non-zero on a fixture workflow under test/fixtures/ci-bad/ that contains an unknown job key.`

3. In **Ships when**, change the gate to `npm run typecheck && npm run lint && npm run lint:actions && npm test && npm run depcheck` so every gate the workflow advertises is also enforced locally and the workflow itself is linted before tagging `H1-complete`.

Edge cases the implementer must watch:
- `actionlint` is a Go binary, not an npm package; install via `actionlint-installer` or pin a release archive in a `postinstall` script. The `lint:actions` npm script must fail loudly (non-zero exit, no silent skip) if the binary is absent — per the cross-cutting "no silent test skipping" rule in `conventions.md`.
- The shape test must read the YAML literally (e.g. `yaml.parse(fs.readFileSync(...))`) rather than executing the workflow; do not depend on network or GitHub APIs.
- The bad-fixture workflow exists only to prove the lint job fails on real defects; keep it under `test/fixtures/ci-bad/` so it is not picked up by GitHub Actions itself.

## Related Findings

- "`depcheck` gate not set up or self-tested" — co-resolve (same leaf, same validation-gap pattern; the recommended `Ships when` rewrite above also closes that finding when combined with its own `Adds`/`Tests` edits)
- "H1 missing mandatory Spec field" — same-cluster (same leaf, resolves independently)
- "`no-static-state.test.ts` allow-list undefined" — same-cluster (same leaf, resolves independently)

---

# `no-static-state.test.ts` allow-list is underspecified

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** `no-static-state.test.ts` allow-list undefined
**Kind:** clarity

## Finding

H1 introduces an architectural test that greps `src/` for module-top-level bindings and "fails on violation," with the parenthetical "allow only `const` of literals/frozen objects" doing all the load-bearing work. Three categories of code are left undefined and would be classified inconsistently by two reasonable implementers:

1. **What counts as a "literal"?** `const N = 42` is obviously fine; `const ARR = []` and `const OBJ = {}` are mutable shared state and almost certainly not fine; `const RE = /x/` is a regex literal whose `.lastIndex` is mutable; `const FN = () => ...` is a function expression. The bullet does not say.
2. **What counts as a "frozen object"?** A lexical `Object.freeze({...})` call at the binding site is the obvious shape, but the rule does not say whether `Object.freeze` must wrap the literal directly, whether it must be recursive (a shallow freeze still leaves nested arrays/objects mutable), or whether other forms (`as const`, `Readonly<T>` annotations, `readonly` arrays) qualify.
3. **`export` is not in the pattern.** The three regexes (`^let `, `^var `, `^const `) do not anchor `^export const `, `^export let `, or `^export var `. As written, the test silently permits any exported binding — the exact surface most likely to be abused as cross-module state.

The H1 cross-cutting rule the test is meant to enforce ("No globals, statics, singletons. All collaborators passed by constructor.") is unambiguous; the test that operationalises it is not. An implementer who reads the bullet conservatively will write a stricter checker than one who reads it permissively, and either may diverge from the convention's intent.

## Plan Documents

- `plan_topics/h1-scaffold.md` — Tests bullet for `no-static-state.test.ts` (edited)
- `plan_topics/conventions.md` — *Cross-cutting rules* → "No globals, statics, singletons" (read-only)
- `plan.md` — Horizontal phases → H1 entry (read-only)

## Spec Documents

None — the no-static-state convention is plan-level, not spec-level (no REQ-ID maps to it).

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

## Consequence

**Severity:** correctness

Two implementers writing `no-static-state.test.ts` from the current bullet will produce checkers that disagree on `const ARR = []`, `const RE = /x/`, `Object.freeze`-vs-`as const`, and exported bindings. The looser checker passes a codebase the stricter one rejects, so the architectural guarantee the H1 test exists to provide ("no module-level mutable state ever lands") becomes contingent on whichever interpretation H1's author happened to pick. Downstream leaves (everything in M and V*) inherit that interpretation as a silent precondition.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/h1-scaffold.md`, replace the third Tests bullet:

> - `no-static-state.test.ts` greps `src/` for `^let `, `^var `, `^const ` at module top-level (allow only `const` of literals/frozen objects); fails on violation.

with an explicit allow-list:

> - `no-static-state.test.ts` walks `src/**/*.ts` and inspects every module-top-level binding (any `VariableDeclaration` whose parent is `Program` or `ExportNamedDeclaration` directly under `Program`). The test uses the TypeScript compiler API rather than line-anchored regex so that `export const`, `export let`, `export var`, and indented continuations are caught. Fails on:
>   - any `let` or `var` at module top-level (regardless of `export`);
>   - any `const` (including `export const`) whose initialiser is not one of the permitted forms below.
>
>   Permitted initialiser forms for module-top-level `const`:
>   1. A literal of primitive type — string, number (incl. `bigint`), boolean, `null`, `undefined`.
>   2. A `RegExp` literal (`/.../flags`) — accepted because shared `RegExp.lastIndex` mutation is forbidden by an existing ESLint rule wired in this leaf (`require-unicode-regexp` plus `no-misleading-character-class` are unrelated; add `eslint-plugin-regexp`'s `no-useless-flag` if needed — the relevant constraint is that bindings must use `const re = /.../` and `re.exec` / `re.test` only on non-`g`/non-`y` regexes; `g`/`y` regex `const`s are forbidden).
>   3. A `TemplateLiteral` with no substitutions, or a string built from `+` of items each themselves on this list.
>   4. An `as const` expression (`<expr> as const`) where `<expr>` is itself an array literal, object literal, or tuple of items each on this list — TypeScript's `as const` produces a deeply-readonly type, so downstream mutation is a type error.
>   5. A direct `Object.freeze(<expr>)` call where `<expr>` is an object literal whose every property value is on this list, or an array literal whose every element is on this list. Shallow `Object.freeze` is acceptable because the contained values are themselves immutable by rules 1–4.
>   6. A reference to an `enum`-like exported `const` from the same package whose declaration itself satisfies this list (computed transitively, single-pass — no need for full graph closure).
>
>   Forbidden initialiser forms (non-exhaustive, listed for clarity): bare `[]` / `{}` / `new Map()` / `new Set()` / `new WeakMap()`; function or arrow-function expressions; `class` expressions; any call expression other than `Object.freeze(...)`; any identifier reference not covered by rule 6.
>
>   Tests for the test itself: a fixture directory under `test/fixtures/no-static-state/` containing `ok-*.ts` files that must pass and `bad-*.ts` files that must fail, one fixture per allow-list rule and one per forbidden form, asserted by running the checker against each fixture and comparing exit code and reported binding name.

The implementer is free to tighten rule 2 (regex) further or drop it entirely if they conclude no module-level regex is needed in V1; the recommendation lists it explicitly so the decision is recorded rather than implied. Rules 4 and 5 are deliberately both included rather than collapsed: `as const` is the idiomatic TS form for tuples and discriminated-union tag tables, while `Object.freeze` is needed for cases where the runtime guarantee (not just the type-system guarantee) is wanted.

## Related Findings

- "`depcheck` gate not set up or self-tested" — same-cluster (same H1 leaf, independent fix)
- "GitHub Actions workflow added but never validated" — same-cluster (same H1 leaf, independent fix)
- "H1 missing mandatory Spec field" — same-cluster (same H1 leaf, independent fix)
- "\"lint rule forbids `throw new Error`\" has no asserting test" — same-cluster (sibling pattern: convention named in H1/H2 but the asserting test is underspecified)

---

# H1 missing mandatory `Spec.` field

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** H1 missing mandatory Spec field
**Kind:** traceability

## Finding

`plan_topics/conventions.md` declares the leaf format as a fixed sequence of fields beginning with `**Spec.** Page(s) under ../spec_topics/ the leaf implements`. The field is mandatory — the convention does not provide for omission, and the V18o coverage gate scans plan files for `Spec.` citations to back-fill REQ-ID-to-leaf mappings.

`plan_topics/h1-scaffold.md` opens directly with `**Adds.**` and never carries a `Spec.` field. The omission is not flagged anywhere in the leaf, so a reader cannot tell whether the field is genuinely absent (infrastructure leaf, no normative spec page) or whether it was forgotten and the leaf silently implements one. The same omission appears in H2 and H4 (each tracked as a separate finding), making the irregularity systemic across the Horizontal phase rather than a one-off slip.

H1 is in fact infrastructure-only — it adds a TypeScript/Vitest/ESLint scaffold and three meta-tests (`__present`, sentinel, `no-static-state`). None of those obligations are normative spec rules; they are conventions enforced by `plan_topics/conventions.md` itself. The fix is therefore to make the absence explicit and searchable, not to invent a spec citation.

## Plan Documents

- `plan_topics/h1-scaffold.md` — leaf body, before `**Adds.**` (edited)
- `plan_topics/conventions.md` — "Leaf format" section (read-only — defines the mandatory field order)
- `plan_topics/coverage-matrix.md` — full table (read-only — confirmed H1 has no spec-rule coverage to claim)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

## Consequence

**Severity:** advisory

A reader cannot distinguish "infrastructure leaf with no spec page" from "spec citation forgotten." The V18o coverage gate scans `Spec.` lines to confirm every REQ-ID has a closing leaf; a missing field provides no signal either way and weakens the gate's auditability. No implementer is blocked, but the leaf format invariant is silently violated.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/h1-scaffold.md`, insert a new line immediately after the `# H1 — Repository scaffold and test framework` heading (before `**Adds.**`) reading exactly:

```
**Spec.** None — infrastructure leaf; no normative spec page. (Cross-cutting rules enforced here — no globals/statics/singletons, no broad catch — are defined in [`conventions.md`](./conventions.md), not in `spec_topics/`.)
```

Edge cases:
- The phrasing must remain greppable for `**Spec.**` so the V18o gate's plan-scan logic (and future coverage tooling) can distinguish "explicitly none" from "forgotten." The literal token `None` after `**Spec.**` should be the project's convention for this case; apply the same phrasing when fixing the sibling H2 and H4 findings so the three Horizontal leaves match.
- Do not add any row to `coverage-matrix.md` — H1 implements no spec page and the matrix is for spec-page-to-leaf mappings only.

## Related Findings

- "H2 missing mandatory Spec field" — co-resolve (same omission in H2; same `**Spec.** None — infrastructure leaf` phrasing applies, though H2 may also need a real spec citation if `Clock`/`RandomSource`/etc. survive the separate spec-fidelity finding)
- "H4 missing mandatory Spec field" — co-resolve (same omission in H4, but H4 actually implements `pi-integration-contract.md` obligations, so its Spec line must cite that page rather than say "None")
- "H4 \"no logic\" shims contradict load-bearing semantics in same leaf" — decision-dependency (resolution affects what H4's `Spec.` field cites, which constrains the wording chosen here for parallelism)

---

## plan_topics/h2-di-skeleton.md

---

# `Clock` and `RandomSource` DI seams have no spec basis

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** `Clock` and `RandomSource` DI seams have no spec basis
**Kind:** spec-fidelity, assumptions

## Finding

H2's **Adds** field commits the implementer to introduce ten DI seams, including `Clock` and `RandomSource`, plus in-memory fakes for each, plus negative-path tests for every fake. Neither `Clock` nor `RandomSource` corresponds to any V1 spec surface:

- The runtime never consults wall-clock time. `RuntimeEvent` (`spec_topics/pi-integration-contract.md`) carries `kind`, `code`, `loom`, `query_site`, `message`, `attempts?`, `tokens_used?` — no timestamp field. The `(kind, query_site, message, occurrence-timestamp)` deduplication key in the same page is a *consumer-side* contract; the timestamp is whatever Pi attaches when it persists the system note, not something the loom runtime emits. Per-call timeouts are deferred (`spec_topics/cancellation.md`, `future-considerations.md`); cancellation is `AbortSignal`-driven only. The chokidar 250 ms debounce is internal to chokidar.
- The runtime never generates random values. The single random-flavoured site is the synthesised `loom-direct:` UUID for code-side `toolCallId` (`spec_topics/pi-integration-contract.md` ≈ line 166), which is plain UUID synthesis (`crypto.randomUUID()`); V14c can use the platform primitive directly. The binder's "fixed seed" (`spec_topics/binder.md` `## Determinism`) is a literal constant per V16h, not a sampled value.

A grep across `plan.md` and `plan_topics/` shows zero downstream references to `Clock`, `RandomSource`, `FakeClock`, or `FakeRandom`; no later leaf consumes either seam. The leaf therefore commits time and test surface to interfaces the spec does not require and no other leaf reaches — directly violating `plan_topics/conventions.md` step 2 of the TDD ritual ("No speculative APIs").

## Plan Documents

- `plan_topics/h2-di-skeleton.md` — **Adds**, **Tests**, **Ships when** (edited)
- `plan_topics/conventions.md` — Per-phase TDD ritual (read-only; cited as the rule the current text violates)
- `plan_topics/v14-tool-calls.md` — V14c (`toolCallId` synthesis) (read-only; consulted to confirm no `RandomSource` consumer)
- `plan_topics/v16-binder.md` — V16h (binder seed) (read-only; consulted to confirm fixed seed, not a sampled value)
- `plan_topics/coverage-matrix.md` — (read-only; confirmed neither seam closes any REQ-ID)

## Spec Documents

None.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H2 — Dependency-injection skeleton with fakes — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will produce divergent H2 artefacts: one follows the **Adds** field literally and writes `Clock` / `RandomSource` interfaces, fakes, and negative-path tests; another applies `conventions.md`'s "No speculative APIs" rule and refuses. The first ships dead code that subsequent leaves must navigate around (and that the no-statics architecture test in H1 has to special-case as not-imported-from-`src/`); the second silently shrinks the leaf and leaves the plan text inaccurate. Neither outcome blocks the V18o coverage gate — these seams have no REQ-IDs to cover — so the divergence persists undetected.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/h2-di-skeleton.md`:

1. In the **Adds.** sentence, strike `` `Clock`, `RandomSource`, `` so the seam list opens with `` `FileSystem`, `DiagnosticsSink`, ... ``. The list then contains eight seams, not ten.
2. Leave the **Tests.** bullets unchanged in count — they are stated generically ("Every fake has at least one negative-path test") and read correctly against the reduced seam set.
3. Leave **Ships when.** unchanged — "Every interface has a fake" still holds, just over the smaller set.

No edits propagate beyond H2: no other leaf names `Clock`, `RandomSource`, `FakeClock`, `FakeRandom`, or `makeRuntime`'s removed parameters. If a later leaf surfaces an actual spec-driven need (a real timestamp emission site or a non-UUID random draw), that leaf adds the seam at that point with the spec citation alongside, per the same `conventions.md` "No speculative APIs" rule.

Edge case for the implementer: V14c synthesises `loom-direct:<uuid>` `toolCallId`s. Use `crypto.randomUUID()` directly at the call site; do not re-introduce a `RandomSource` seam under a different name to satisfy a perceived testability requirement — the toolCallId is opaque to assertions (V14c's tests can match `/^loom-direct:/` rather than the full UUID).

## Related Findings

- "H2 names ten DI seams but specifies zero method signatures" — co-resolve (the same H2 **Adds** edit reduces the seam set; the signatures finding then applies to the eight survivors)
- "H2 missing mandatory Spec field" — same-cluster (same leaf, independent fix)
- "`AgentSession` seam missing from H2 and H4" — same-cluster (same H2 seam list; one finding removes seams, the other adds one)
- "\"speculative APIs\" undefined" — decision-dependency (this finding is the canonical worked example of the speculative-API rule the conventions finding asks to clarify)
- "H1 scaffolds engineering hygiene without spec basis" — same-cluster (sibling spec-fidelity violation in the horizontal phases)
- "V14c: `toolCallId` suffix scheme unspecified" — decision-dependency (resolution affects whether V14c reaches for a `RandomSource` shim)
- "V16h binder seed value not specified" — same-cluster (touches the binder's fixed seed; confirms the seed is literal, not sampled)

---

# H2 declares ten DI seams without method signatures

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** H2 names ten DI seams but specifies zero method signatures
**Kind:** spec-fidelity, implementability

## Finding

H2's `Adds.` field enumerates ten collaborator seams — `Clock`, `RandomSource`, `FileSystem`, `DiagnosticsSink`, `ModelClient`, `ConversationDriver`, `ToolHost`, `SchemaValidator`, `LoomLoader`, `ExtensionAPI` — and promises an in-memory fake for each, but it does not declare a single method signature for any of them. The leaf's `Tests.` field references methods (`FakeFileSystem.readText`, `FakeDiagnosticsSink … drain`) that have no defined shape, and downstream leaves freely reach into the seams: M calls `ConversationDriver.send` and awaits an `agent_end` event; V4a calls `SchemaValidator` (compile / validate / invalidate); V5e calls `ctx.sendUserMessage` through a `PromptModeConversationDriver`; H3 mandates that *every* later phase emit through `DiagnosticsSink` (`report` / `drain` shapes); V14n threads settings reads through `FileSystem`; V18g invalidates entries on the `SchemaValidator`. No leaf — H2 included — pins the surface those calls must satisfy.

Two implementer agents picking up H2 and any downstream leaf will independently invent signatures (sync vs async, `Promise<string>` vs `Promise<Buffer>`, `report(d: Diagnostic)` vs `report(file, code, message)`, `compile(schema): Validator` vs `compile(schema): Promise<Validator>`, etc.). The mismatches surface only when the leaves are integrated, well after the H2 commit is tagged complete. The cross-cutting `no-globals` rule that H1 enforces depends on these seams being constructor-injected, but enforcement says nothing about whether the constructed objects are call-compatible.

The spec carries the *behavioural contract* for `SchemaValidator` (`spec_topics/implementation-notes.md` §Schema validation) and the Pi-side surface of `ExtensionAPI` (`spec_topics/pi-integration-contract.md`), but it does not — and is not the right place to — declare TypeScript signatures for loom's internal seams. That is the plan's job, and H2 is the only leaf positioned to do it.

## Plan Documents

- `plan_topics/h2-di-skeleton.md` — `Adds.` and `Tests.` (edited)
- `plan_topics/h3-diagnostics.md` — `Ships when.` (read-only — confirms `DiagnosticsSink` is the universal emit path)
- `plan_topics/h4-extension-shell.md` — `Adds.` (read-only — adapter shims must conform to the H2 signatures)
- `plan_topics/m-mvp.md` — `Adds.` (read-only — first downstream consumer of `ConversationDriver.send`)
- `plan_topics/v4-schemas.md` — V4a `Adds.` (read-only — first downstream consumer of `SchemaValidator`)
- `plan_topics/v5-untyped-queries.md` — V5e `Adds.` (read-only — `PromptModeConversationDriver`)
- `plan_topics/conventions.md` — `Leaf format` (read-only)

## Spec Documents

- `spec_topics/implementation-notes.md` — §Schema validation (read-only — already specifies the validator's behavioural contract; H2 should cite it rather than restate it)
- `spec_topics/pi-integration-contract.md` — Extension entry point, Conversation drive (read-only — already pins the `ExtensionAPI` surface and `ConversationDriver` semantics on the Pi side; H2 should cite it for those two seams)

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H2 — Dependency-injection skeleton with fakes — (modified)

## Consequence

**Severity:** correctness

Two implementer agents working on H2 and any downstream leaf in isolation will diverge on method names, sync/async shape, and return types. The mismatch surfaces only at integration, after H2 has been tagged complete; rework cascades into M, V4a, V5e, V14n, V18f/g, and the entire H4 adapter layer. The H1 architectural test catches static-state leaks but not interface incompatibility, so the divergence ships green until something tries to wire two leaves together.

## Solution Space

**Shape:** single

### Recommendation

Replace H2's `Adds.` field with a fenced TypeScript code block that declares the full signature of every surviving seam (after the `Clock` / `RandomSource` finding and the `AgentSession` finding are resolved — see Related Findings), then cite it from the prose. Concretely:

1. In `plan_topics/h2-di-skeleton.md`, restructure `Adds.` so it reads:

   > **Adds.** Pure-interface seams for every collaborator the runtime needs, declared below. A constructor-injection factory `makeRuntime({ ... })` that wires them. In-memory fakes for every interface in `test/fakes/` — production code never imports a fake.
   >
   > ```ts
   > // FileSystem — read/write loom + .warp + settings files; the watcher path is a separate seam.
   > interface FileSystem {
   >   readText(path: string): Promise<string>;          // rejects with FileNotFound | FileReadError
   >   writeText(path: string, contents: string): Promise<void>;
   >   exists(path: string): Promise<boolean>;
   > }
   >
   > // DiagnosticsSink — the universal emit path mandated by H3's Ships-when.
   > // `Diagnostic` is the shape introduced in H3.
   > interface DiagnosticsSink {
   >   report(d: Diagnostic): void;
   >   drain(): readonly Diagnostic[];                   // sorted (file, line, col); preserves report order on equal positions
   > }
   >
   > // SchemaValidator — behavioural contract pinned by spec_topics/implementation-notes.md §Schema validation.
   > // `LoweredSchema` is V4's lowered JSON-Schema artefact; `ValidationError` mirrors AJV's error shape.
   > interface SchemaValidator {
   >   compile(schema: LoweredSchema): CompiledValidator;
   >   invalidate(schemaHash: string): void;             // file-watcher entry point per spec
   > }
   > interface CompiledValidator {
   >   validate(value: unknown): { ok: true } | { ok: false; errors: readonly ValidationError[] };
   > }
   >
   > // ModelClient — provider-agnostic chat surface used by ConversationDriver.
   > interface ModelClient {
   >   send(req: ModelRequest): Promise<ModelResponse>;  // ModelRequest/Response shapes deferred to V5/V6
   > }
   >
   > // ConversationDriver — drives one query against a session; mode-specific implementations
   > // (PromptModeConversationDriver in V5e, SubagentModeConversationDriver in V12a) live downstream.
   > interface ConversationDriver {
   >   send(text: string, opts?: { deliverAs?: "user" | "steer" }): Promise<string>;
   > }
   >
   > // ToolHost — invokes a tool by registered name; concrete impls in H4 / V14.
   > interface ToolHost {
   >   invoke(name: string, args: unknown): Promise<unknown>;
   > }
   >
   > // LoomLoader — parses a .loom (or .warp) file into the in-memory program shape used by the runtime.
   > // `ParsedLoom` is the shape introduced in V3/V17; H2 forward-declares it as `unknown` and the
   > // downstream leaf that introduces the shape narrows the parameter type.
   > interface LoomLoader {
   >   load(path: string): Promise<ParsedLoom>;
   > }
   >
   > // ExtensionAPI — Pi's own type, re-exported from @mariozechner/pi-coding-agent. H2 does not redeclare it;
   > // its surface is fixed by spec_topics/pi-integration-contract.md (Extension entry point, Tool-registration
   > // lifetime and visibility, Conversation drive).
   > import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
   > ```

2. Add a corresponding `Tests.` bullet:

   > - Each interface above has a TypeScript-level conformance test: the in-memory fake is assigned to the interface variable, and a separate `expectType<>` assertion confirms the production adapter (when introduced in H4) matches the same interface.

3. Add the missing `**Spec.**` field per the H2-missing-Spec-field finding:

   > **Spec.** [Implementation Notes — Schema validation](../spec_topics/implementation-notes.md#runtime), [Pi Integration Contract](../spec_topics/pi-integration-contract.md). Other seams are loom-internal and have no normative spec page.

Forward references (`Diagnostic`, `LoweredSchema`, `ParsedLoom`, `ModelRequest`, `ModelResponse`, `ValidationError`) are deliberate: they pin the *method shape* H2 owns while letting the leaf that introduces the data shape (H3, V4, V3/V17, V5/V6, V4a respectively) own the data shape. The implementer of each downstream leaf narrows the placeholder type when they land their own data shape; the seam signature itself does not change.

If the `Clock` / `RandomSource` finding is accepted (drop both seams) and the `AgentSession` finding is accepted (add an `AgentSession` seam), update the code block accordingly: omit `Clock` / `RandomSource` entirely, and add an `AgentSession` interface with at least `sendUserMessage(text: string): Promise<void>`, `subscribe(handler: (event: AgentEvent) => void): Unsubscribe`, and `dispose(): Promise<void>` (signatures cribbed from `spec_topics/pi-integration-contract.md` §Conversation drive — subagent mode).

## Related Findings

- "`Clock` and `RandomSource` DI seams have no spec basis" — decision-dependency (resolution determines whether those two interfaces appear in the H2 signature block at all)
- "`AgentSession` seam missing from H2 and H4" — decision-dependency (resolution may add an eleventh interface that also needs a signature in the same block)
- "H2 missing mandatory Spec field" — co-resolve (the recommended H2 edit adds the missing `Spec.` field in the same pass)
- "H4 'typed accessor' for `ExtensionCommandContext` has no signature" — same-cluster (same defect pattern at H4; fixed independently but in the same style)
- "H4 'no-logic shims' claim contradicts registration cache and `withActiveTools`" — same-cluster (touches H4's adapter layer, which must conform to the H2 signatures this finding pins)
- "V5e: `ctx.sendUserMessage()` — method does not exist on `ExtensionCommandContext`" — same-cluster (fixing the `ConversationDriver.send` signature here exposes the V5e mis-citation)

---

# `AgentSession` seam missing from H2 and H4

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** `AgentSession` seam missing from H2 and H4
**Kind:** spec-implementability

## Finding

V12a's `Adds` declares that the runtime "spawns in-process `AgentSession` (against `FakeAgentSession` in tests) with in-memory session manager", and its `Tests` enumerate eleven distinct assertions about `AgentSession.dispose()` lifecycle (single-call, error path, panic path, cancellation path, nested deepest-first, etc.). V18d and V18n add cross-checked assertions against the same `AgentSession.dispose()` finally-block contract. The spec backs this surface in `spec_topics/pi-integration-contract.md` ("Conversation drive — subagent mode" and "Subagent session lifecycle"), where the runtime is required to call `createAgentSession({ customTools, tools, ... })` and own the returned `AgentSession` for the duration of one subagent invocation.

H2's seam list — `Clock`, `RandomSource`, `FileSystem`, `DiagnosticsSink`, `ModelClient`, `ConversationDriver`, `ToolHost`, `SchemaValidator`, `LoomLoader`, `ExtensionAPI` — has no entry that wraps `createAgentSession`, and H4's adapter list — `PiModelClient`, `PiToolHost`, `PiFileSystem`, `PiExtensionAPI` — has no production shim for it either. H2 commits to "Pure-interface seams for every collaborator the runtime will need" and "every interface has a fake", so V12a is the first leaf that needs the seam yet no upstream leaf produces it. There is no scheduled leaf anywhere in `plan_topics/` that introduces an `AgentSession` seam, a `FakeAgentSession`, or a `Pi*` adapter that calls `createAgentSession`.

The result is that V12a cannot be picked up against fakes (its `Tests` rely on `FakeAgentSession`), the H2 ban on fakes leaking into `src/` cannot be enforced for this surface, and the H4 ships-when ("`pi -e` loads the extension") leaves the `createAgentSession` adapter unbuilt — V12a would have to invent both the interface and the adapter while implementing subagent semantics.

## Plan Documents

- `plan_topics/h2-di-skeleton.md` — Adds list, Tests bullets, Ships-when (edited)
- `plan_topics/h4-extension-shell.md` — Adds list, Tests bullets (edited)
- `plan_topics/v12-subagent.md` — V12a `Adds`/`Tests`/`Deps` (read-only — already cites the seam)
- `plan_topics/v18-cancellation.md` — V18d, V18n `Tests` (read-only — already cite `AgentSession.dispose()`)
- `plan_topics/coverage-matrix.md` — `pi-integration-contract.md` rows for "Conversation drive — subagent mode" and "Subagent session lifecycle" (option-dependent — only if the closing-leaf attribution shifts)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal, Vertical V12, Vertical V18

**Leaves (implementation order):**

- H2 — Dependency-injection skeleton with fakes — (modified)
- H4 — Pi extension shell — (modified)
- V12a — `mode: subagent` accepted; AgentSession spawn — (blocked)
- V18d — `AbortSignal` before every `invoke` — (blocked)
- V18n — Panic routing: `invoke` parent surface — (blocked)

## Consequence

**Severity:** blocking

V12a, V18d, and V18n cite `AgentSession` and `FakeAgentSession` by name in their `Tests` bullets, but no upstream leaf produces either the production interface or the in-memory fake. An implementer reaching V12a must either invent an undocumented seam (diverging from the H2 charter that "every interface has a fake" and from H2's import-graph rule that fakes never leak into `src/`) or stop and back-fill H2/H4 ad hoc. The V18o coverage gate cannot detect this because the seam itself is not REQ-ID'd.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/h2-di-skeleton.md`, extend the `**Adds.**` interface list to include a subagent-spawning seam — concretely, add `SubagentSpawner` (a factory returning a `SubagentSession` handle that wraps Pi's `createAgentSession` result) to the enumeration. Add a corresponding fake `FakeSubagentSpawner` returning a `FakeAgentSession` (or `FakeSubagentSession`) handle in `test/fakes/`. Add at least two `**Tests.**` bullets:

- `FakeSubagentSpawner.spawn(...)` returns a handle whose `dispose()` is observable (call-count probe) and idempotent (second `dispose()` is a no-op, per `pi-integration-contract.md` "Subagent session lifecycle").
- `FakeSubagentSpawner` rejects with a typed error when no scripted spawn response is queued (matches H2's existing "no silent default" rule for `FakeModelClient`).

In `plan_topics/h4-extension-shell.md`, extend the `**Adds.**` adapter list to include `PiSubagentSpawner`, a no-logic shim that delegates `spawn(opts)` to `createAgentSession({ customTools, tools, model, systemPrompt, signal, ... })` and returns a handle whose `dispose()` calls `AgentSession.dispose()`. Add one `**Tests.**` bullet: "`PiSubagentSpawner` has a delegation contract test against `FakeExtensionAPI` asserting `spawn(opts)` calls the captured `createAgentSession` exactly once with the lowered `customTools` / `tools` allowlist pair (per `pi-integration-contract.md` "Conversation drive — subagent mode")."

In `plan_topics/v12-subagent.md`, update V12a's `**Deps.**` line to read `**Deps.** V3a, V5e, H2, H4` so the seam dependency is explicit.

The implementer is free to pick a different seam name (`AgentSessionFactory`, `SubagentRunner`, etc.); the rule is one factory seam and one returned handle, both fakeable, so V12a's eleven `dispose()` assertions and V18d/V18n's cross-checks have a real surface to assert against.

## Related Findings

- "H2 names ten DI seams but specifies zero method signatures" — co-resolve (the same H2 edit pass should declare the new `SubagentSpawner` interface signature in full alongside fixing the existing ten)
- "H4 \"no-logic shims\" claim contradicts registration cache and `withActiveTools`" — same-cluster (both touch H4's adapter list and the "no-logic" framing; neither blocks the other)
- "`AgentSession.dispose()` failure path unbounded" — decision-dependency (depends on the seam this finding introduces; the failure-bound rule must be wired through `SubagentSpawner` once it exists)
- "V12a missing from V14e Deps" — same-cluster (touches the same V12a leaf but resolves independently)

---

# H2 omits the mandatory `Spec.` field

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** H2 missing mandatory Spec field
**Kind:** spec-traceability

## Finding

`plan_topics/conventions.md` defines the leaf format and lists `**Spec.**` as the first mandatory field — "Page(s) under `../spec_topics/` the leaf implements." `plan_topics/h2-di-skeleton.md` opens directly with `**Adds.**` and never names a spec page (or explicitly disclaims one). H2 is a pure-infrastructure leaf — it has no normative spec citation to make — but the convention requires every leaf to surface that fact rather than silently omit the field.

The omission breaks a discoverability invariant the rest of the plan relies on: a reader (or a coverage script) can no longer distinguish "this leaf has no spec basis on purpose" from "the author forgot to fill in the field." H1 and H4 share the same defect; H3 and M correctly carry the field.

## Plan Documents

- `plan_topics/h2-di-skeleton.md` — leaf header (edited)
- `plan_topics/conventions.md` — Leaf format section (read-only — defines the mandatory field)
- `plan_topics/h1-scaffold.md` — comparison precedent (read-only)
- `plan_topics/h4-extension-shell.md` — comparison precedent (read-only)
- `plan_topics/h3-diagnostics.md` — positive precedent for the disclaimer wording (read-only)

## Spec Documents

None.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H2 — Dependency-injection skeleton with fakes — (modified)

## Consequence

**Severity:** advisory

A reader scanning leaves for spec coverage cannot tell whether H2's missing `Spec.` line is intentional or an oversight; the same ambiguity defeats any future tooling that enumerates leaves with no spec citation. The implementer can still execute H2 without the field, so no downstream code diverges — but the convention's discoverability guarantee is silently broken.

## Solution Space

**Shape:** single

### Recommendation

Insert a new line immediately after the H2 title line in `plan_topics/h2-di-skeleton.md`, before the existing `**Adds.**` line:

```
**Spec.** (none — infrastructure leaf; no normative spec page)
```

Followed by a blank line so the field reads as its own paragraph, matching the layout of `h3-diagnostics.md` and `m-mvp.md`. The literal disclaimer text is the same one proposed for H1 and H4 — keep it identical across all three so a `grep` for the disclaimer phrase finds every infrastructure leaf.

## Related Findings

- "H1 missing mandatory Spec field" — co-resolve (same edit, identical disclaimer text, in `plan_topics/h1-scaffold.md`)
- "H4 missing mandatory Spec field" — co-resolve (same edit, identical disclaimer text, in `plan_topics/h4-extension-shell.md`)

---

## plan_topics/h3-diagnostics.md

---

# H3 "lint rule forbids `throw new Error`" Ships-when has no asserting test and no implementing leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** "lint rule forbids `throw new Error`" has no asserting test
**Kind:** validation

## Finding

H3's Ships-when reads "All later phases emit through `DiagnosticsSink` exclusively (lint rule forbids `throw new Error` for spec-defined diagnostics)." That criterion is unobservable as written: nothing in the leaf's Tests bullets asserts that the rule exists, that it fires on a violating fixture, that it is enabled in `.eslintrc` at `error` severity, or that it does not over-trigger on legitimate `throw` sites (e.g. fakes, internal invariants, control-flow exceptions). The H3 gate therefore closes vacuously.

The defect compounds with an upstream gap: H1's Adds bullet enumerates the ESLint preset (`@typescript-eslint`, `no-floating-promises`, `no-globals`, `no-broad-catch`) but does not include this custom rule, and H3's Adds bullet lists `Diagnostic`, `DiagnosticsAccumulator`, the serialiser, code-namespace constants, and `MultiErrorReporter` — also no lint rule. No leaf in the plan currently *creates* the rule the Ships-when criterion depends on.

The "spec-defined diagnostics" qualifier is also undefined locally. The spec's diagnostics topic enumerates a closed registry of `loom/parse/*`, `loom/lex/*`, `loom/load/*`, `loom/type/*`, and `loom/runtime/*` codes, so the rule's positive surface is "any `throw` whose message string starts with `loom/`". The negative surface — sanctioned `throw` sites — needs to be named so the rule's allow-list is testable rather than guessed.

## Plan Documents

- `plan_topics/h3-diagnostics.md` — Adds, Tests, Ships when (edited)
- `plan_topics/h1-scaffold.md` — Adds (read-only; the rule's host config is established here but the rule itself belongs with `DiagnosticsSink` in H3)
- `plan_topics/h2-di-skeleton.md` — Adds (read-only; defines the `DiagnosticsSink` seam the rule steers traffic toward)
- `plan_topics/conventions.md` — Code conventions (read-only)

## Spec Documents

- `spec_topics/diagnostics.md` — Code registry (read-only; defines the closed set of `loom/<namespace>/*` codes the rule's positive matcher targets)

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H3 — Diagnostics primitive and multi-error accumulator — (modified)

## Consequence

**Severity:** correctness

The Ships-when gate cannot fire — there is no observable signal for "all later phases emit through `DiagnosticsSink` exclusively." Two reasonable implementers will diverge: one will silently skip the rule and call H3 done; another will hand-roll an ad-hoc `grep` check; a third will write a custom ESLint rule with an arbitrary allow-list. By V18j (multi-error rollup) and beyond, the diagnostic surface will likely contain stray `throw new Error("loom/...")` sites that bypass the sink, and the V18o coverage gate has no mechanism to detect them.

## Solution Space

**Shape:** single

### Recommendation

Edit `plan_topics/h3-diagnostics.md`:

1. Append to the **Adds.** bullet: `; custom ESLint rule "loom/no-throw-diagnostic-code" that flags any `throw` whose argument is a `new Error(...)` (or string literal) whose first segment matches `/^loom\/(parse|lex|load|type|runtime)\//`, with an allow-list for `src/diagnostics/**` (the sink's own implementation) and `test/**`; rule wired into the H1 ESLint preset at `error` severity.`

2. Replace the existing **Tests.** block by adding three bullets at the end:
   - `ESLint over a fixture file containing `throw new Error("loom/parse/binding-case-mismatch")` outside `src/diagnostics/` reports the rule's code at the offending line.`
   - `ESLint over a fixture file containing `diagnosticsSink.report({ code: "loom/parse/binding-case-mismatch", ... })` and `throw new Error("internal invariant violated")` (no `loom/` prefix) does not report the rule.`
   - `Reading `.eslintrc` (or the flat-config equivalent) confirms `loom/no-throw-diagnostic-code` is present and set to `error`.`

3. Replace the **Ships when.** line with: `H3's Tests pass; the lint rule is wired at `error` severity and is observed by the Tests bullets above. Compliance of "later phases" is enforced mechanically by the rule running in `npm run lint` (the H1 Ships-when gate), not by manual audit.`

Edge cases the implementer must handle:
- The rule's allow-list is path-based (`src/diagnostics/**`), not message-based — the sink's own implementation legitimately constructs `Error` instances carrying `loom/...` codes when synthesising fallback notifications.
- Test fixtures live under `test/fakes/` or `test/fixtures/` and are excluded from the rule via the `test/**` allow-list; the asserting test invokes ESLint programmatically against an inline fixture string, not against the repo's checked-in test files.
- The matcher is on the literal first segment of the message string. Dynamically composed messages (`throw new Error(\`loom/${ns}/foo\`)`) are out of scope for V1; document that the rule only catches static literals and that dynamic construction is the implementer's responsibility to avoid.

## Related Findings

- "Exception-handling convention weaker than CLAUDE.md" — same-cluster (both concern H1's ESLint preset and what catch/throw discipline it enforces; resolve independently)
- "`no-static-state.test.ts` allow-list undefined" — same-cluster (both add a custom lint-style check whose allow-list is unspecified; same shape of fix)
- "Closed diagnostic registry — many codes have no asserting plan leaf" — decision-dependency (a complete diagnostic-code coverage gate would subsume the positive half of this rule's matcher; if the registry-coverage gate lands first, this rule's tests can reuse its fixture set)

---

# H3 plans a serialiser to a Pi shape the spec says is unused

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** H3 plans a serialiser to a Pi shape the spec says is unused
**Kind:** spec-fidelity, codebase-grounding-broad

## Finding

`plan_topics/h3-diagnostics.md` lists, in `Adds`, "serialiser to Pi's flat `{ path, error }` shape." That shape is Pi's `LoadExtensionsResult.errors` element type, populated only while Pi is `import()`-ing an extension's entry point. `spec_topics/diagnostics.md` is explicit that this surface is **not** a loom diagnostics channel: "Pi's own `LoadExtensionsResult.errors` field is **not** used … A failure there is a bootstrap failure … orthogonal to the diagnostics defined here, which all fire after the extension is already live."

The two channels the spec actually defines are:

1. A serialised `content` string of the form `"<file>:<line>:<col>: <code>: <message>"` (with optional `"\n  hint: <hint>"` and indented related-site lines), used as the `content` of a `pi.sendMessage` call.
2. A structured `details: { diagnostics: Diagnostic[] }` payload on the same `pi.sendMessage({ customType: "loom-system-note", … }, { triggerTurn: false })` call, consumed by the renderer V18h registers and by typed downstream consumers.

H3 owns the diagnostics primitive that V18h (renderer) and V18j (multi-error rollup) build on. Building the wrong-shape serialiser at H3 either ships dead code (if the V18h author notices the mismatch and writes a second serialiser) or contaminates V18h/V18j with the wrong shape and pushes the divergence past the V18o coverage gate, which only checks that `diagnostics.md` is referenced — not that the bytes on the wire match.

## Plan Documents

- `plan_topics/h3-diagnostics.md` — Adds (edited)
- `plan_topics/h3-diagnostics.md` — Tests (edited — the "Severity round-trips" bullet inherits the wrong boundary)
- `plan_topics/v18-cancellation.md` — V18h, V18j (read-only — confirm downstream consumers expect the corrected shape)
- `plan_topics/coverage-matrix.md` — Diagnostics row (read-only — H3 already listed)

## Spec Documents

None.

## Affected Leaves

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H3 — Diagnostics primitive and multi-error accumulator — (modified)
- V18h — Custom Pi message type `loom-system-note` and renderer — (blocked)
- V18j — Multi-error rollup across file + transitive `.warp` imports + transitive `.loom` callees — (blocked)

## Consequence

**Severity:** correctness

An implementer following H3 literally builds a serialiser to a Pi-loader shape no later leaf consumes; V18h then needs a second serialiser the spec actually mandates, and the H3 work is dead. An implementer who notices the spec mismatch silently corrects the plan, and two parallel implementers diverge on which shape `DiagnosticsAccumulator` emits. The H3 Ships-when criterion ("All later phases emit through `DiagnosticsSink` exclusively") cannot be observed against either shape unambiguously.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/h3-diagnostics.md`, edit the `Adds.` bullet by striking the substring

> `serialiser to Pi's flat `{ path, error }` shape`

and inserting in its place

> `serialiser producing both the spec's line-format `content` string (`"<file>:<line>:<col>: <code>: <message>"`, with `"\n  hint: <hint>"` appended when a hint is present and indented lines appended for each related site; multi-error batches separate per-`Diagnostic` blocks with one blank line) and the structured `details: { diagnostics: Diagnostic[] }` payload, both shaped for the single `pi.sendMessage({ customType: "loom-system-note", content, display: true, details }, { triggerTurn: false })` call defined in `spec_topics/diagnostics.md` and registered by V18h`

Keep the rest of the `Adds.` bullet unchanged. In the `Tests.` block, tighten the existing "Severity round-trips" line so its boundary names the corrected serialiser (see the related "Severity round-trips" finding); the line-shape, hint-appending, related-site, and multi-error-sort bullets already align with the spec line format and need no change.

## Related Findings

- "\"Severity round-trips\" underspecified" — co-resolve (the boundary it asks H3 to name is the same `DiagnosticsAccumulator → pi.sendMessage(...)` serialiser this finding redefines)
- "H3 omits the `loom/lex/*` namespace" — same-cluster (independent edit to the same H3 `Adds.` bullet's namespace-constants list)

---

# H3's namespace-constants list invites a non-existent `loom/lex/*` namespace

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** H3 omits the `loom/lex/*` namespace
**Kind:** assumptions

## Finding

H3's `Adds` field enumerates the typed code-namespace constants the diagnostics primitive must export: `loom/parse/*`, `loom/type/*`, `loom/load/*`, `loom/runtime/*`. That list matches the namespaces actually used by codes in the spec's registry (`spec_topics/diagnostics.md`). However, the spec's own section heading for the parse/lex table reads ``### `loom/lex/*` and `loom/parse/*` — lexical and parse errors``, and the `Phase` column tags many codes as `lex` (e.g. `loom/parse/illegal-escape`, `loom/parse/literal-newline-in-string`, `loom/parse/unterminated-string`, `loom/parse/invalid-path-separator`, `loom/parse/block-comment`, plus `loom/load/invalid-encoding`).

A V1-lexer-leaf implementer reading H3 alongside the spec will reasonably ask: "If lex-phase codes exist, why is `loom/lex/*` absent from H3's constants list?" The answer is that the namespace `loom/lex/*` does not exist anywhere in the V1 registry — every `lex`-phase code routes through `loom/parse/*` (or `loom/load/invalid-encoding` for the encoding case), and the spec's section heading is a misleading anticipatory artifact. H3 currently leaves that ambiguity unresolved, so two implementers may diverge: one mints a `loom/lex/*` constant to "match the spec heading," the other follows H3 verbatim.

The fix is to make the disjunction explicit at the H3 site so no implementer has to re-derive it from the spec table.

## Plan Documents

- `plan_topics/h3-diagnostics.md` — `Adds` field, `Tests` field (edited)
- `plan.md` — read-only
- `plan_topics/v1-lexer.md` — read-only (V1a–V1e leaves emit lex-phase codes)
- `plan_topics/conventions.md` — read-only

## Spec Documents

- `spec_topics/diagnostics.md` — section heading at line 66, "Code namespaces" list (option-dependent — only edited if the fix re-titles the spec section)

## Affected Leaves

**Phases:** Horizontal, Vertical V1

**Leaves (implementation order):**

- H3 — Diagnostics primitive and multi-error accumulator — (modified)
- V1b — String literals and escapes — (read-only; emits lex-phase codes via `loom/parse/*`)
- V1c — Line comments (`//` and `///`) — (read-only; emits `loom/parse/block-comment` at lex phase)
- V1d — Identifier case rule and reserved keywords — (read-only)

## Consequence

**Severity:** advisory

Two implementers reading H3 plus the spec heading may pick different namespace prefixes for lex-phase codes (one inventing `loom/lex/*` to match the spec heading, the other following H3 verbatim). The downstream V1 lexer leaves would then emit codes that don't match the closed registry, tripping registry-rule 1 ("every author-visible diagnostic emitted by the runtime MUST carry a code from the registry"). The defect is not blocking because H3's enumeration matches the registry, but the silent ambiguity invites rework.

## Solution Space

**Shape:** single

### Recommendation

Edit `plan_topics/h3-diagnostics.md`'s `Adds` field. Replace:

> typed code-namespace constants (`loom/parse/*`, `loom/type/*`, `loom/load/*`, `loom/runtime/*`)

with:

> typed code-namespace constants (`loom/parse/*`, `loom/type/*`, `loom/load/*`, `loom/runtime/*`) — these are the four namespaces in the V1 closed registry. There is no `loom/lex/*` namespace: every `lex`-phase code in `spec_topics/diagnostics.md` routes through `loom/parse/*` (or `loom/load/invalid-encoding` for the UTF-8 / BOM case)

Then add one assertion to the `Tests` field:

> No emitted code's namespace prefix falls outside the four-element constant set above (enforced by a unit test that scans every code emitted by the test suite).

The spec heading at `spec_topics/diagnostics.md:66` (``### `loom/lex/*` and `loom/parse/*` — lexical and parse errors``) is misleading on its own terms but is a spec-side editorial issue; addressing it is out of scope for a plan-side fix. Leaving the spec heading as-is is acceptable provided H3 carries the explicit disclaimer above.

## Related Findings

- "Closed diagnostic registry — many codes have no asserting plan leaf" — same-cluster (also concerns the registry-to-leaf mapping completeness; the namespace clarification here makes that audit cleaner)
- "UTF-8 encoding, BOM consumption, and `loom/load/invalid-encoding` — no plan leaf" — same-cluster (the missing leaf emits a lex-phase code under the `loom/load/*` namespace; both findings hinge on phase ≠ namespace)

---

# H3 "Severity round-trips" test bullet does not name the boundary

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** "Severity round-trips" underspecified
**Kind:** clarity

## Finding

H3's Tests block lists `Severity round-trips.` as its final bullet, with no indication of which serialiser, payload, or transport the round-trip is asserted across. The spec defines two distinct serialised surfaces for diagnostics in `spec_topics/diagnostics.md`: a one-line string `"<file>:<line>:<col>: <code>: <message>"` carried as `content`, and a structured `Diagnostic[]` carried in `details.diagnostics` on a `loom-system-note` `pi.sendMessage` call. The line format demonstrably omits the `severity` field; the structured payload is the only surface where severity is observable. A test bullet that only says "round-trips" is therefore either trivially false (against the line format) or unstated (against the structured payload), and a separate implementer would not reliably pick the latter.

The bullet also has no anchor on what "round-trip" means operationally: emit a `Diagnostic` of each defined severity through the accumulator's serialiser and decode the resulting `details.diagnostics[*].severity` back to the input value, for both `"error"` and `"warning"` (the two values enumerated in the spec's diagnostic shape). Without that anchor the bullet does not pin behaviour the V18o coverage gate can rely on.

## Plan Documents

- `plan_topics/h3-diagnostics.md` — Tests block (edited)
- `spec_topics/diagnostics.md` — Internal diagnostic shape, Serialised content format, Persistent diagnostics (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H3 — Diagnostics primitive and multi-error accumulator — (modified)

## Consequence

**Severity:** correctness

A separate implementer reading `Severity round-trips` will either write a vacuous test (encode/decode an in-memory `Diagnostic` struct without crossing any boundary, which proves nothing about the serialiser) or test against the line format, where `severity` is not present and the assertion cannot be written without inventing a non-spec line shape. Both outcomes leave H3's Ships-when claim — that all later phases emit through `DiagnosticsSink` — without a closing test that the structured payload preserves the severity field on which downstream consumers (renderers, LSP integrations, V18j multi-error rollup) depend.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/h3-diagnostics.md`, replace the Tests bullet

> - Severity round-trips.

with

> - For each defined severity (`"error"`, `"warning"`), a `Diagnostic` value passed through the `DiagnosticsAccumulator` serialiser appears as `details.diagnostics[i].severity` on the resulting `loom-system-note` `pi.sendMessage` payload with the same string value (the line-format `content` string carries no severity field and is not asserted here).

Edge cases for the implementer: the assertion is on the structured `details.diagnostics` array, not on the `content` line string; both severity values listed in the spec shape must be exercised individually (a single-value test does not establish that the serialiser is not hard-coded); and the test fixture must construct `Diagnostic` values, not raw strings, so the round-trip crosses the actual serialiser surface rather than re-validating an in-memory struct.

## Related Findings

- "H3 plans a serialiser to a Pi shape the spec says is unused" — decision-dependency (the spec-correct serialiser surface — `loom-system-note` with `details.diagnostics` — is the boundary this bullet must name; both findings edit H3's Adds/Tests in the same pass)
- "lint rule forbids `throw new Error` has no asserting test" — same-cluster (also a Tests-bullet observability gap in H3, resolves independently)

---

## plan_topics/h4-extension-shell.md

---

# H4 missing mandatory `Spec.` field

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** H4 missing mandatory Spec field
**Kind:** traceability, placement

## Finding

`plan_topics/conventions.md` — under *Leaf format* — declares `**Spec.**` as the first mandatory field of every leaf, listing the spec page(s) the leaf implements. `plan_topics/h4-extension-shell.md` opens directly with `**Adds.**` and never names a spec page. The neighbouring horizontal leaves `h3-diagnostics.md` and `m-mvp.md` carry their `**Spec.**` lines; `h1-scaffold.md` and `h2-di-skeleton.md` are missing theirs as well (see related findings), so H4 is part of a pattern, not a one-off.

H4 is not a content-free leaf that could plausibly omit a spec citation. Its `Adds` body explicitly cites *Pi Integration Contract — Tool-registration lifetime and visibility* and lifts two normative obligations from it: the extension-scoped `Map<schema-hash, registeredToolName>` registration cache fronting `pi.registerTool`, and the `withActiveTools(loomCallableSet, fn)` snapshot/restore helper around `pi.getActiveTools` / `pi.setActiveTools`. Both clauses live in `spec_topics/pi-integration-contract.md` (the *Tool-registration lifetime and visibility* paragraph, prompt-mode subsection); the extension factory shape (`default function (pi: ExtensionAPI)` in `extensions/index.ts`, `pi.registerCommand` for the slash command) lives in the same file's *Extension entry point* paragraph.

Compounding the leak, `plan_topics/coverage-matrix.md` lists `Pi Integration Contract` as closing in `M, V12a, V14a–V14j, V18f, V18g, V18h` and `Pi Extension Integration` as closing in `M, V14k–V14q, V18f, V18h`. H4 appears in neither row even though it ships the shell those rows depend on. Once REQ-IDs land for `pi-integration-contract.md` (prefix `PIC` per the spec.md prefix table), the V18o gate will scan the matrix for every `PIC-N` and find no mapping for the registration-cache and `withActiveTools` rules — the gate will either pass vacuously (if those rules never receive REQ-IDs) or fail (if they do). Either outcome is a silent ship of normative behaviour without a closing leaf.

## Plan Documents

- `plan_topics/h4-extension-shell.md` — full leaf body (edited)
- `plan_topics/coverage-matrix.md` — `Pi Integration Contract` row and `Pi Extension Integration` row (edited)
- `plan_topics/conventions.md` — *Leaf format* (read-only — defines the obligation)
- `plan.md` — H4 leaf reference (read-only)

## Spec Documents

- `spec_topics/pi-integration-contract.md` — *Extension entry point* and *Tool-registration lifetime and visibility* (read-only)
- `spec_topics/pi-integration.md` — extension-overview bullets (read-only)

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified)

## Consequence

**Severity:** correctness

H4's normative obligations (the registration cache content-addressing rule and the `withActiveTools` `try`/`finally` semantics) are invisible to the V18o coverage gate, so the rules can ship unimplemented without CI catching it. A second implementer reading H4 in isolation has no spec anchor to consult when the `Adds` text and the spec drift; they may invent dedup semantics (identity hash, name hash, last-write-wins) or skip the snapshot/restore restoration on rejection. The leaf also breaks the convention that downstream tools (`grep '^\*\*Spec\.\*\*' plan_topics/`) use to enumerate the plan's spec coverage.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/h4-extension-shell.md`, insert immediately after the H1 title (`# H4 — Pi extension shell`) and before the existing `**Adds.**` line:

```
**Spec.** [Pi Integration Contract — Extension entry point](../spec_topics/pi-integration-contract.md), [Pi Integration Contract — Tool-registration lifetime and visibility](../spec_topics/pi-integration-contract.md), [Pi Extension Integration](../spec_topics/pi-integration.md).
```

In `plan_topics/coverage-matrix.md`:

1. Append `H4` to the leaf list of the existing `[Pi Extension Integration](../spec_topics/pi-integration.md)` row, making it read `H4, M, V14k–V14q, V18f, V18h`.
2. Add a new row immediately above the existing `[Pi Integration Contract](../spec_topics/pi-integration-contract.md)` row:

   ```
   | [Pi Integration Contract — Tool-registration lifetime and visibility](../spec_topics/pi-integration-contract.md) | H4, V12a, V14a–V14j |
   ```

   Leave the catch-all `Pi Integration Contract` row unchanged so the per-section row supplies the H4 mapping the gate will look for once `PIC` REQ-IDs land for the cache and `withActiveTools` clauses.

Implementer note: the `Tool-registration lifetime and visibility` paragraph also enumerates subagent-mode wiring (via `createAgentSession`) which H4 does *not* implement — that side of the rule is V12a's. The new matrix row is correct in citing both because they jointly close the section; H4's `Spec.` citation is honest about co-ownership rather than claiming the whole paragraph.

## Related Findings

- "H1 missing mandatory Spec field" — same-cluster (same `Spec.` omission in a horizontal leaf; resolves independently with its own spec citation)
- "H2 missing mandatory Spec field" — same-cluster (same omission in H2)
- "`AgentSession` seam missing from H2 and H4" — co-resolve (the H4 edit that adds the `Spec.` field is a natural place to also reckon with the missing `AgentSession` seam, since both are `pi-integration-contract.md` obligations)
- "H4 \"no-logic shims\" claim contradicts registration cache and `withActiveTools`" — decision-dependency (resolving the `Spec.` citation forces an honest reading of the cache + `withActiveTools` obligations, which is what makes the "no-logic shims" claim untenable)
- "Tool-registration dedup assumes no schema-hash collision" — same-cluster (touches the same registration-cache rule cited by H4's new `Spec.` field)

---

# H4 Ships-when invocation `pi -e C:\UnitySrc\pi-loom` does not resolve to a loadable entry

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** H4 Ships-when uses undocumented `pi -e <dir>` invocation
**Kind:** codebase-grounding-broad

## Finding

H4's Ships-when reads `pi -e C:\UnitySrc\pi-loom` (the project root). Pi's loader does accept directories on `-e` — `dist/core/extensions/loader.js` (`resolveExtensionEntries`) inspects the target dir for either a `package.json` whose `pi.extensions` field lists entry paths, or a top-level `index.ts`/`index.js`. Examples in the Pi tree exercise both forms (e.g. `examples/extensions/doom-overlay/` is loaded as a directory because it contains `index.ts` at its root). So the bare claim "pi -e on a directory is undocumented" is wrong.

What is broken is this specific invocation against pi-loom's actual layout. `package.json` declares `"pi": { "extensions": ["./extensions"] }`, and `./extensions` resolves to a *directory* (the parent of the file H4 adds, `extensions/index.ts`). `resolveExtensionEntries` pushes that directory verbatim into the load list without further recursion; `loadExtension` then hands it to `jiti.import(<dir>)`, which under Node-style ESM resolution does not auto-resolve to `index.ts`. The Ships-when criterion therefore depends on a fragile/likely-failing path that the implementer cannot reproduce by following the plan literally.

The fix is to align the Ships-when invocation with one of Pi's two supported, file-resolved forms — either point `-e` directly at the entry file, or point `-e` at the `extensions/` subdirectory (which `resolveExtensionEntries` will resolve to its `index.ts`), and adjust `package.json`'s manifest entry to match so `/reload` and package-style discovery agree.

## Plan Documents

- `plan_topics/h4-extension-shell.md` — `**Ships when.**` line (edited)
- `plan_topics/h4-extension-shell.md` — `**Adds.**` line (read-only — names `extensions/index.ts`, the entry file the invocation must land on)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified)

## Consequence

**Severity:** correctness

The implementer follows the literal Ships-when, runs `pi -e C:\UnitySrc\pi-loom`, and observes either an "extension does not export a valid factory" error (jiti returning nothing for a directory import) or, at best, undefined behaviour that varies with the jiti version pinned by Pi. Either they invent their own invocation off-script (defeating the purpose of a written acceptance criterion) or they declare H4 shipped against a never-actually-executed smoke. Both outcomes corrupt the H4 closure signal.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/h4-extension-shell.md`, replace the `**Ships when.**` line with:

> **Ships when.** `pi -e C:\UnitySrc\pi-loom\extensions` loads the extension (Pi's loader resolves the directory to `extensions/index.ts`) and `/loom-status` runs in a real Pi session.

(Also drop the `manual-smoke recorded in docs/manual-smoke.md` clause — that is the subject of a separate finding and should not be coupled to this fix.)

In the `**Adds.**` line, additionally specify that `package.json`'s `pi.extensions` manifest entry must be `"./extensions/index.ts"` (file path), not `"./extensions"` (directory). This keeps the directory `-e` path, the `package.json`-driven discovery path, and `/reload` auto-discovery from `.pi/extensions/` all converging on the same entry file rather than relying on jiti directory resolution.

The implementer must verify, as part of the smoke, that the `/loom-status` command appears in `/help` output of the real Pi session — that confirms the factory ran, not just that the file was located.

## Related Findings

- "`docs/manual-smoke.md` does not exist and its creation violates CLAUDE.md" — same-cluster (both edit the H4 Ships-when line; resolve independently — this finding rewrites the invocation, the other rewrites the evidence-recording clause)
- "H4 missing mandatory Spec field" — same-cluster (same leaf, different field — `Spec.` vs `Ships when.`)

---

# H4 Ships-when receipt requires creating an undeclared `docs/manual-smoke.md`

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** `docs/manual-smoke.md` does not exist and its creation violates CLAUDE.md
**Kind:** validation, codebase-grounding-broad, doc-alignment-broad

## Finding

H4's `Ships when.` reads: ``pi -e C:\UnitySrc\pi-loom` loads the extension and `/loom-status` runs in a real Pi session (manual smoke recorded in `docs/manual-smoke.md`).`` The receipt file `docs/manual-smoke.md` does not exist anywhere in the repository, is not listed in H4's `Adds.`, and is not declared by any earlier horizontal phase. Closing the H4 gate therefore forces the implementer to create a brand-new file that no leaf has authorised.

A secondary problem: H4 has no `Tests.` bullet covering the smoke at all. `Ships when.` is the only place the manual reproduction is mentioned, and the bullet body specifies neither the expected `/loom-status` output nor the format of the receipt entry, so the gate is unobservable from any leaf-internal artefact.

## Plan Documents

- `plan_topics/h4-extension-shell.md` — `Ships when.` bullet; `Adds.`; `Tests.` (edited)
- `plan_topics/conventions.md` — "Doc updates" cross-cutting rule (read-only)
- `plan.md` — H4 entry under the horizontal-phases list (read-only)

## Spec Documents

None.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified)

## Consequence

**Severity:** blocking

H4 cannot be shipped without an implementer unilaterally rewriting the gate or inventing a file format. Because every later horizontal-and-vertical phase depends on H4 being green, the ambiguity stalls the entire downstream pipeline at the first integration boundary, and the lack of a `Tests.` bullet means even an implementer willing to create the file has no specified content to put in it.

## Solution Space

**Shape:** single

### Recommendation

Declare `docs/manual-smoke.md` in H4's `Adds.` as a load-bearing project artefact with a fixed entry format, and add a `Tests.` bullet that asserts the file's most recent entry has the expected shape so the gate is observable.

**Plan edits.** In `plan_topics/h4-extension-shell.md`:
- Append to `Adds.`: `; docs/manual-smoke.md as the project's manual-integration receipt log. Each entry is one Markdown subsection with an ISO-8601 date heading, the Pi version used, the leaf ID being smoked, the exact command invoked (e.g. `pi -e C:\UnitySrc\pi-loom`), and the verbatim assistant-visible output line(s) observed. H4 creates the file with a header explaining the format and writes the first entry as part of closing the H4 gate.`
- Append to `Tests.`: `File-presence and entry-shape lint: docs/manual-smoke.md exists at the project root, contains the documented header, and its most recent entry has an ISO-8601 date heading plus a non-empty fenced block containing the literal string "pi-loom: no looms loaded yet".`
- Leave the `Ships when.` text otherwise unchanged.

**Spec edits.** None.

Edge cases for the implementer:
- The entry format is a fixed contract from H4 onward — every later leaf that records a manual smoke (M, V5e under D23, future leaves) writes entries in the same shape so the lint generalises.
- The lint asserts shape only, not output validity; whether `/loom-status` actually printed the right line is the human's responsibility at smoke time.
- The first H4 entry is written by the H4 implementer at gate-closing time, not by the file's bootstrap step — the bootstrap creates only the header.

## Related Findings

- "CHANGELOG.md / notes.md creation violates CLAUDE.md" — co-resolve (same root question; resolved together by bootstrapping `CHANGELOG.md`/`notes.md` in H1 and `docs/manual-smoke.md` in H4)
- "M Ships-when is manual-only for an entire integration slice" — same-cluster (M's manual smoke uses the same file and entry format)
- "V5e Ships-when: 'a real Pi session' is unverifiable from the leaf gate" — same-cluster (D23 may also write a `docs/manual-smoke.md` entry)
- "H4 Ships-when uses undocumented `pi -e <dir>` invocation" — co-resolve (touches the same `Ships when.` bullet; both edits land in one diff to that line)

---

# H4 PiToolHost accessor test asserts a property unobservable across `ctx.reload()`

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** H4 "no stale closure after session reload" contradicts Pi's reload lifecycle
**Kind:** codebase-grounding-broad, assumptions, clarity

## Finding

H4's final Tests bullet asserts that `PiToolHost`'s typed accessor "returns the most recent `ctx` even after a session reload (no stale closure)." This describes a property that does not exist on the object under test. Pi's reload mechanism — `/reload` invoking `ctx.reload()` — re-runs the extension factory as a fresh extension instance; the spec confirms this in [Pi Integration Contract — Tool-registration lifetime and visibility](../../spec_topics/pi-integration-contract.md): "Hot reload (the `_loom-reload` path described in **Extension entry point** step 4) drops the registration cache so a fresh extension instance starts empty." The pre-reload `PiToolHost` instance is discarded along with the rest of the previous factory closure; nothing on it is observable post-reload, so "the accessor returns the most recent `ctx`" cannot be checked on the same `PiToolHost`.

The genuine "no stale closure" hazard for this accessor is intra-instance: each slash-command invocation supplies a new `ExtensionCommandContext`, and the spec pins the retention scope at "the live host is the `ExtensionCommandContext` passed to the slash-command handler, retained for the loom's lifetime" (Pi Integration Contract, **Tool execution from loom code**). The accessor must reflect the ctx of the current handler invocation, not a captured reference from a prior invocation, and V14c's synthesised `execute(..., ctx)` argument depends on that. The test as written distracts from that real obligation and points the implementer at a scenario their fake harness cannot construct.

## Plan Documents

- `plan_topics/h4-extension-shell.md` — Tests bullet (the `PiToolHost` accessor line) (edited)
- `plan_topics/v14-tool-calls.md` — V14c (read-only; consumer of the accessor)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified)

## Consequence

**Severity:** correctness

The bullet sends an implementer to assert a behaviour that cannot be exercised against any plausible test harness (no continuous `PiToolHost` survives `ctx.reload()`), so they will either silently ship a stub assertion or invent their own scenario. Meanwhile the real invariant the accessor must satisfy — refreshing per slash-command invocation so V14c's synthesised tool-call `ctx` is the live one — goes untested.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/h4-extension-shell.md`, replace the final `**Tests.**` bullet:

> - `PiToolHost` exposes the retained `ExtensionCommandContext` to V14c via a typed accessor; the accessor returns the most recent `ctx` even after a session reload (no stale closure).

with:

> - `PiToolHost` exposes the retained `ExtensionCommandContext` to V14c via a typed accessor: within a single slash-command invocation the accessor returns the `ctx` passed to that handler; a subsequent slash-command invocation on the same extension instance updates the accessor to the new handler's `ctx` (no stale closure across invocations); outside any active invocation the accessor reports "no current ctx" rather than returning a captured reference.

The accessor signature itself is the subject of a sibling finding ("typed accessor" has no signature) and should be co-resolved on the same edit pass. Do not introduce any wording about reload, `session_shutdown`, or cross-instance retention — those events tear down the `PiToolHost` itself and are not observable on it.

## Related Findings

- "H4 \"typed accessor\" for `ExtensionCommandContext` has no signature" — co-resolve (same Tests bullet; declaring the accessor's signature and naming its lifecycle states is the same edit as removing the cross-reload claim)
- "H4 \"no-logic shims\" claim contradicts registration cache and `withActiveTools`" — same-cluster (different Tests/Adds bullets in the same leaf)
- "H4 missing mandatory Spec field" — same-cluster (same leaf, independently resolvable)

---

# H4 "no-logic shims" claim contradicts registration cache and `withActiveTools`

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** H4 "no-logic shims" claim contradicts registration cache and `withActiveTools`
**Kind:** assumptions

## Finding

H4's `Adds.` bullet describes `PiModelClient`, `PiToolHost`, `PiFileSystem`, and `PiExtensionAPI` as "adapter shims (no logic) wrapping Pi's surfaces" — and then, in the same sentence, assigns `PiExtensionAPI` two pieces of load-bearing protocol from [`spec_topics/pi-integration-contract.md` — Tool-registration lifetime and visibility](../../../spec_topics/pi-integration-contract.md): an extension-scoped `Map<schema-hash, registeredToolName>` cache fronting `pi.registerTool`, and a `withActiveTools(loomCallableSet, fn)` snapshot/restore helper. Neither is a passthrough. The cache is content-addressed by the canonical schema hash defined in `schema-subset.md`, dedupes registrations across the extension's lifetime, and is the natural site for a future `pi.unregisterTool`. The helper must hold its `pi.setActiveTools` restore inside a `try`/`finally` that survives resolve, reject, synchronous throw, panic, and cancellation; the spec calls out this finally-block invariant verbatim. H4's own `Tests.` bullets exercise both behaviours (content-addressed dedup, three-way restore on resolve/reject/throw), confirming that "no logic" is the wrong label.

The "(no logic)" parenthetical is a leftover assertion that the leaf is a thin wrapper layer. Two consequences follow. First, an implementer reading H4 sees an internal contradiction and has to guess which half is authoritative — the framing or the bullets. Second, because H4 carries no `Spec.` field (a separate finding), the registration-cache and active-set obligations are invisible to the V18o coverage gate even though `pi-integration-contract.md` plainly normatively requires them; the misleading "no logic" tag reinforces the omission by suggesting nothing in H4 needs spec traceability.

The framing also blurs the boundary between H4 (shim wiring) and the cross-cutting tool-registration protocol that V14e and V14j rely on. V14e's `Adds.` already cites the registration cache and snapshot/restore by name; V14j relies on the empty-set restoration semantics; V18g asserts the cache survives content-edit swaps. All three lean on H4 to establish the mechanism, but H4 disowns it as "no logic."

## Plan Documents

- `plan_topics/h4-extension-shell.md` — `Adds.` and `Tests.` bullets (edited)
- `plan_topics/v14-tool-calls.md` — V14e `Adds.`/`Tests.`, V14j `Adds.`/`Tests.` (read-only; cross-references to verify the mechanism is consumed elsewhere)
- `plan_topics/v18-cancellation.md` — V18g `Adds.`/`Tests.`/`Ships when` (read-only; lifetime claim "registration cache lifetime matches the extension-instance lifetime" is anchored here)
- `plan_topics/coverage-matrix.md` — Pi Integration Contract row(s) (option-dependent; the "split into a dedicated leaf" option requires adding the closing-leaf row, the "expand H4" option requires adding/widening it under H4)

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Tool-registration lifetime and visibility" subsection (read-only; spec already pins the protocol, plan must align to it)
- `spec_topics/schema-subset.md` — "Canonical schema hash" subsection (read-only; defines the hash function the cache keys on)

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one will read "(no logic)" and produce literal passthroughs, deferring the cache and snapshot/restore to V14e (which then has nothing to wrap and re-implements the protocol from scratch, violating the single-bridge invariant in `pi-integration-contract.md`); the other will read the bullets and implement the cache + helper inside `PiExtensionAPI` as the spec requires. The second is correct but the leaf gives no signal to choose between them. The contradiction also hides the registration-cache and snapshot/restore obligations from V18o's coverage gate, so a wrong implementation can ship "complete."

## Solution Space

**Shape:** single

### Recommendation

Keep all four adapter shims plus the registration cache and `withActiveTools` helper in H4 as a single leaf. Remove the "(no logic)" parenthetical, name the cache and helper as load-bearing components, and add the missing `Spec.` field that anchors them in the Pi Integration Contract. This sits naturally with D6: H4 already owns the factory-time `loom-system-note` channel registration, the cache, and `withActiveTools` — all factory-time integration plumbing co-located.

**Plan edits.**
- In `plan_topics/h4-extension-shell.md`, replace the `Adds.` opening sentence:
  - Strike: `` `PiModelClient`, `PiToolHost`, `PiFileSystem`, `PiExtensionAPI` adapter shims (no logic) wrapping Pi's surfaces. ``
  - Insert: `` `PiModelClient`, `PiToolHost`, `PiFileSystem` adapter shims that delegate directly to Pi's surfaces; `PiExtensionAPI` carries the per-mode tool-registration plumbing described below (not a passthrough). ``
- Insert a new `**Spec.**` field immediately above `**Adds.**`:
  - `**Spec.** [Pi Integration Contract — Extension entry point](../spec_topics/pi-integration-contract.md), [Pi Integration Contract — Tool-registration lifetime and visibility](../spec_topics/pi-integration-contract.md), [Schema Subset — Canonical schema hash](../spec_topics/schema-subset.md#canonical-schema-hash).`

**Spec edits.** None.

Edge cases the implementer must watch: the `Spec.` field added here must list both the Pi Integration Contract subsection and the canonical schema-hash subsection, otherwise V18o's REQ-ID gate will not see the hash-keying obligation. The "(not a passthrough)" call-out for `PiExtensionAPI` is load-bearing prose — do not strip it back to the shorter shim sentence.

## Related Findings

- "H4 missing mandatory Spec field" — co-resolve (Option A's edit adds the `Spec.` field this finding asks for; both findings close in one diff)
- "Tool-registration dedup assumes no schema-hash collision" — same-cluster (touches the same registration cache; resolves independently by adding a structural-equality fallback, but the implementer should land both edits together)
- "H4 \"typed accessor\" for `ExtensionCommandContext` has no signature" — same-cluster (also a `Tests.`-bullet precision gap inside H4; independent fix)
- "H4 \"no stale closure after session reload\" contradicts Pi's reload lifecycle" — same-cluster (also corrects an over-broad H4 `Tests.` claim; independent fix)

---

# H4 leaves the `PiToolHost` "typed accessor" for `ExtensionCommandContext` unspecified

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** H4 "typed accessor" for `ExtensionCommandContext` has no signature
**Kind:** implementability

## Finding

H4's fifth Tests bullet says `PiToolHost` "exposes the retained `ExtensionCommandContext` to V14c via a typed accessor", but neither H4 nor the `ToolHost` interface seam declared in H2 names that accessor, gives it a signature, or fixes the protocol for when it returns vs. throws vs. yields a sentinel. V14c is the sole declared consumer — it must reach through this accessor to assemble the per-call `ctx` argument forwarded into `Pi tool.execute(...)` (with `signal`, `sessionManager`, and `abort` overridden per `spec_topics/pi-integration-contract.md` "Tool execution from loom code"). Without a fixed target on the H2 seam, V14c implementers will invent their own method shape, and the H4 test bullet is unfalsifiable (no method name to assert against).

The gap also matters for the runtime's lifecycle edges. The same Tests bullet asserts the accessor "returns the most recent `ctx` even after a session reload" — a separate finding rejects that wording on lifecycle grounds, but even after that wording is fixed there remains an open question of what the accessor returns between extension-factory time and the first slash-handler invocation, and after `session_shutdown`. A typed signature with explicit "no current ctx" semantics is the only way both leaves can be tested concretely.

## Plan Documents

- `plan_topics/h4-extension-shell.md` — Adds + Tests bullets (edited)
- `plan_topics/h2-di-skeleton.md` — `ToolHost` interface seam in Adds (edited)
- `plan_topics/v14-tool-calls.md` — V14c Adds + Tests + Deps (edited)

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Tool execution from loom code" (read-only)

## Affected Leaves

**Phases:** Horizontal, Vertical V14

**Leaves (implementation order):**

- H2 — Dependency-injection skeleton with fakes — (modified)
- H4 — Pi extension shell — (modified)
- V14c — Bare `<name>(args)` call from loom code — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will produce divergent shapes (`getCommandContext()` returning `ExtensionCommandContext | undefined`, vs. `currentCtx` getter throwing on absence, vs. an event emitter, vs. a callback registered at runtime construction) and V14c will have to be rewritten to match whatever H4 picks. The H4 Tests bullet currently cannot fail — there is no name to spy on and no contract for the absent-ctx case — so the V18o coverage gate would pass vacuously for this rule.

## Solution Space

**Shape:** single

### Recommendation

Specify the accessor on the **`ToolHost` interface seam in H2** (so V14c depends only on H2, matching H4's "no-logic shims" framing) and have H4's `PiToolHost` wire the setter from inside the slash-command handler.

Edits, in order:

1. **`plan_topics/h2-di-skeleton.md`, Adds bullet.** After the `ToolHost` listing in the interface enumeration, append a parenthetical: *"`ToolHost` exposes `getCommandContext(): ExtensionCommandContext | undefined` (returns `undefined` when no slash-handler is currently retained — i.e. before the first invocation and after `session_shutdown`) and `setCommandContext(ctx: ExtensionCommandContext | undefined): void` (production callers pass a defined `ctx` on slash-handler entry; passing `undefined` clears the retained reference)."* Add one Tests bullet: *"`FakeToolHost.getCommandContext()` returns `undefined` until `setCommandContext(ctx)` is called, then returns the most recently set `ctx`; `setCommandContext(undefined)` resets it to `undefined`."*

2. **`plan_topics/h4-extension-shell.md`, Adds bullet.** Replace the trailing sentence *"`PiToolHost` retains the live `ExtensionCommandContext` reference so synthesised tool-call `ctx` arguments forward to it (V14c)."* with *"The `/loom-status` slash-command handler calls `piToolHost.setCommandContext(ctx)` on entry and `piToolHost.setCommandContext(undefined)` in a `finally`; `PiToolHost.getCommandContext()` (the H2-declared accessor) is the sole read path for V14c."*

3. **`plan_topics/h4-extension-shell.md`, Tests bullet 5.** Replace *"`PiToolHost` exposes the retained `ExtensionCommandContext` to V14c via a typed accessor; the accessor returns the most recent `ctx` even after a session reload (no stale closure)."* with *"`PiToolHost.getCommandContext()` returns `undefined` before the first slash-handler invocation; returns the handler's `ctx` while the handler is in flight; returns `undefined` again after the handler's `finally` clears it. Two sequential handler invocations expose two distinct `ctx` references in turn (no stale closure across invocations within one extension-instance lifetime)."*

4. **`plan_topics/v14-tool-calls.md`, V14c Adds bullet.** Where the current text reads *"The `ctx` argument is the live `ExtensionContext` the runtime already holds, with `signal` overridden to …"*, prefix it with *"The runtime obtains the live `ExtensionContext` via `toolHost.getCommandContext()`; if it returns `undefined` (no slash-handler currently retained — should not occur for code-side calls inside an active invocation), the call rejects with `loom/runtime/no-command-context`. "* Add the corresponding Tests bullet: *"call issued when `toolHost.getCommandContext()` returns `undefined` rejects with `loom/runtime/no-command-context`; call issued during a slash-handler reads the same `ExtensionContext` reference the handler received."* Append `H4` to V14c's `Deps`.

Edge cases the implementer must watch:
- The setter/clearer pair lives in the slash-handler's `try`/`finally`, not in the `PiToolHost` constructor — `PiToolHost` is a long-lived per-extension-instance object; the retained `ctx` is per-invocation.
- Subagent mode reads the same accessor — `pi-integration-contract.md` "Tool execution from loom code" specifies the parent handler's `ExtensionCommandContext` is forwarded for non-session members. No second accessor is needed.

## Related Findings

- "H4 'no stale closure after session reload' contradicts Pi's reload lifecycle" — co-resolve (both edit the same H4 Tests bullet; recommendation 3 above subsumes the reload-lifecycle fix)
- "H4 'no-logic shims' claim contradicts registration cache and `withActiveTools`" — same-cluster (same H4 leaf, separate Adds-vs-Tests inconsistency)
- "`docs/manual-smoke.md` does not exist and its creation violates CLAUDE.md" — same-cluster (same H4 leaf, Ships-when concern)
- "Tool-registration dedup assumes no schema-hash collision" — same-cluster (same H4 leaf, registration-cache concern)
- "V5e: `ctx.sendUserMessage()` — method does not exist on `ExtensionCommandContext`" — same-cluster (different leaf, but both findings rest on the same `ExtensionCommandContext` vs. `ExtensionAPI` distinction)

---

# Tool-registration cache dedups by hash without verifying schema equality

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** Tool-registration dedup assumes no schema-hash collision
**Kind:** risk

## Finding

H4 specifies an extension-scoped `Map<schema-hash, registeredToolName>` cache fronting `pi.registerTool`, keyed on the canonical schema hash defined in `spec_topics/schema-subset.md` (SHA-256 truncated to 16 hex chars = 64-bit slug). Both the spec (`pi-integration-contract.md` — "Tool-registration lifetime and visibility") and the H4 plan leaf treat hash equality as schema equality: a hash hit silently returns the existing `registeredToolName` without checking that the new schema is structurally identical to the cached one.

The truncated 64-bit slug was chosen for human-readable synthesised tool names (`__loom_callee_<sha12>__…`, `__loom_respond_<sha12>`), accepting a documented ~10⁻⁹ collision probability for thousands of distinct schemas per loom file. That probability is small but not zero, and the spec elsewhere takes pains to call the slug "part of the on-disk and on-wire contract." The current plan and spec describe no behaviour at all for the collision case. On collision, two distinct lowered tool schemas alias to one `registeredToolName`: the second `defineTool` is dropped, the model sees the first schema in `/tools` and during tool-loop turns, but a tool-call dispatched against that name routes to whichever `execute` Pi has bound under that registration. The failure is silent at registration time and surfaces only as confusing tool-loop errors with no actionable diagnostic.

The defensive fix is cheap (one canonical-form byte-equality check per cache hit, which is the happy-path fast-equal anyway) and turns a debug-nightmare silent failure into a named diagnostic. There is currently no `loom/runtime/*` code reserved for this case and no Tests bullet on H4 (or anywhere) that would catch an implementer who omits the check.

## Plan Documents

- `plan_topics/h4-extension-shell.md` — `Adds` bullet on the registration cache; `Tests` bullets on cache content-addressing (edited)
- `plan.md` — H4 row (read-only)

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Tool-registration lifetime and visibility" subsection (edited)
- `spec_topics/diagnostics.md` — `loom/runtime/*` table (edited)
- `spec_topics/schema-subset.md` — "Canonical schema hash" subsection (read-only; defines the cache key but is not changed)

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified)

## Consequence

**Severity:** advisory

In the happy path (no collision) two reasonable implementers ship indistinguishable behaviour. On the rare collision path one ships a silent wrong-schema-to-LLM bug with no diagnostic, the other emits a named runtime code and disambiguates the registration; only the spec/plan can force the second outcome since the V18o coverage gate cannot otherwise discover the missing check. The probability is low enough that an unfixed plan still produces a working V1, but the fix is one canonical-form bytes comparison per registration and the unfixed failure mode is a silent semantic corruption in the model's tool surface.

## Solution Space

**Shape:** single

### Recommendation

Three coordinated edits, all small. Treat the canonical-form byte sequence (the bytes the SHA-256 is computed over) as the cache value alongside the registered name, so collision detection is byte-equality of pre-hashed bytes — no extra serialisation cost on cache hit.

1. **`spec_topics/diagnostics.md`** — append a row to the `loom/runtime/*` table introduced under the "`loom/runtime/*` — runtime panics and delivery failures" heading:

   > `loom/runtime/registration-cache-collision` | E | runtime | Two distinct lowered tool `parameters` schemas produced the same canonical schema hash; the runtime refused to dedup the registration. Emitted at `pi.registerTool` time with both synthesised names, both lowered-schema canonical-form bytes (truncated for the message; full bytes in `hint`), and the colliding slug. The runtime registers the second schema under a disambiguated name (see [Pi Integration Contract — Tool-registration lifetime and visibility](./pi-integration-contract.md)) and continues. | [Pi Integration Contract — Tool-registration lifetime and visibility](./pi-integration-contract.md) | `tool-registration cache collision on slug <slug>: <name1> vs <name2>`.

2. **`spec_topics/pi-integration-contract.md`** — in the "Tool-registration lifetime and visibility" subsection, immediately after the sentence "On first encounter of a unique hash the runtime calls `pi.registerTool` once with a content-addressed name…", insert:

   > On a subsequent cache hit (a new lowered schema hashing to a slug already present in the cache), the runtime MUST verify byte-equality of the cached canonical-form schema bytes against the new entry's canonical-form bytes before reusing the registration. The hash is a 64-bit truncation of SHA-256 (per [Schema Subset — Canonical schema hash](./schema-subset.md#canonical-schema-hash)), so silent collision is statistically negligible but not impossible; treating hash equality as schema equality without verification would silently alias two distinct tool schemas to one registered name. On byte-mismatch the runtime emits `loom/runtime/registration-cache-collision`, refuses to dedup, and registers the new schema under a disambiguated name with a monotonically increasing per-slug counter (`__loom_callee_<sha12>_<n>__<post-rename-name>` for loom callees; `__loom_respond_<sha12>_<n>` for typed-query one-shot tools, starting at `n = 2`). The cache stores the canonical-form bytes alongside the registered name so the equality check is a byte comparison, not a re-serialisation.

3. **`plan_topics/h4-extension-shell.md`** — extend the existing cache `Adds` clause and add one `Tests` bullet:

   - In `Adds.`, after "an extension-scoped `Map<schema-hash, registeredToolName>` cache fronting `pi.registerTool`", insert: ", whose value carries both the registered name and the canonical-form schema bytes used to compute the hash, so cache hits verify byte-equality before reusing the registration and emit `loom/runtime/registration-cache-collision` plus a disambiguated re-registration on mismatch (per [Pi Integration Contract — Tool-registration lifetime and visibility](../spec_topics/pi-integration-contract.md))".
   - In `Tests.`, replace the existing bullet "Registration cache is content-addressed: two `defineTool(...)` calls with the same lowered `parameters` hash dedupe to one `pi.registerTool` call." with two bullets:
     - "Registration cache hit on byte-equal canonical-form schema dedupes to one `pi.registerTool` call (two `defineTool(...)` calls with structurally identical lowered `parameters` produce one registration)."
     - "Registration cache hit with byte-unequal schema (synthetic collision injected via a test-only hash override on the cache's hash function) emits exactly one `loom/runtime/registration-cache-collision` diagnostic, calls `pi.registerTool` twice, and the second registration uses the disambiguated `_2` suffix per the spec template."

## Related Findings

- "Canonical schema hash algorithm unasserted" — decision-dependency (V4f must pin the SHA-256 + 16-hex-char slug algorithm against a fixture before H4's collision-detection clause has a stable hash function to detect collisions in)
- "M assumes registration/collision plumbing not yet scheduled" — same-cluster (both concern under-specified registration-cache machinery owned by H4 and consumed by M)
- "M's collision warning lacks code/severity" — same-cluster (both concern unnamed collision diagnostics; different domain — slash-name vs. schema-hash — but the same omission pattern)
- "H4 \"no-logic shims\" claim contradicts registration cache and `withActiveTools`" — co-resolve (any rewrite of H4's cache `Adds` clause will resolve both findings in the same edit pass)

---

## plan_topics/m-mvp.md

---

# M bundles five independently-shippable concerns in one leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** M too large — five distinct concerns in one leaf
**Kind:** step-atomicity

## Finding

`plan_topics/m-mvp.md` defines a single leaf (`M`) whose `Adds.` field bundles at least five orthogonal concerns: (1) a minimal lexer + parser covering frontmatter (`mode: prompt`, `params:` absent or `{}`) and a single bare `` @`literal` `` expression-statement; (2) the runtime that walks the parsed body and drives one `ConversationDriver.send` round-trip; (3) Pi slash-command registration via `pi.registerCommand`, including the `description`-verbatim contract; (4) discovery from the two MVP roots (`~/.pi/agent/looms/`, `.pi/looms/`) plus the cross-root same-name precedence rule; and (5) the no-params overflow `loom-system-note` behaviour. The `Tests.` list carries ten heterogeneous bullets covering all five areas plus an `AbortError`-as-system-note assertion.

`plan_topics/conventions.md` defines a leaf as "the smallest feature that can ship independently *and* be tested independently." The five areas inside M satisfy that test individually: the lexer/parser is testable in isolation against fixture files, the runtime is testable against a stub `ConversationDriver`, slash-registration is testable against `FakeExtensionAPI`, discovery is testable against a fake `FileSystem`, and the overflow note is a pure string-formatting rule. They are also independently *failable* — a defect in any one currently blocks the whole leaf and forces a rebase of every downstream leaf whose `Deps.` cite `M` (V1a, V3c, V5a, V5e, V14k, V14l).

The leaf is also the load-bearing Deps target for ten downstream leaves and the closing leaf for seven coverage-matrix rows; that aggregation is what makes "M complete" the most expensive single gate in the plan and why other reviewers' findings (system-note channel ordering, `agent_end` vs `waitForIdle`, AbortError wording, registration plumbing scheduling) all collide on this one leaf.

## Plan Documents

- `plan_topics/m-mvp.md` — entire file (edited)
- `plan.md` — `## MVP phase` bullet list (edited)
- `plan_topics/coverage-matrix.md` — every row whose closing-leaf cell mentions `M` (rows for `overview.md`, `overview.md#code-and-model`, `overview.md#scope-of-a-loom-file`, `pi-integration.md`, `implementation-notes.md#runtime`, `pi-integration-contract.md`) (edited)
- `plan_topics/v1-lexer.md` — V1a `Deps.` (edited)
- `plan_topics/v3-frontmatter.md` — V3c `Deps.` (edited)
- `plan_topics/v5-untyped-queries.md` — V5a, V5e `Deps.` (edited)
- `plan_topics/v14-tool-calls.md` — V14k, V14l `Deps.` (edited)
- `plan_topics/conventions.md` — leaf-format and MVP-phase paragraphs (read-only)
- `plan_topics/h1-scaffold.md`, `plan_topics/h2-di-skeleton.md`, `plan_topics/h3-diagnostics.md`, `plan_topics/h4-extension-shell.md` — read to confirm horizontals do not move (read-only)

## Spec Documents

None. The split is purely a plan-structure change; no spec rule moves.

## Affected Leaves

**Phases:** MVP, Horizontal (read-only context), Vertical V1, Vertical V3, Vertical V5, Vertical V14

**Leaves (implementation order):**

- `M` — Minimal end-to-end loom — (removed)
- `<new>` (Ma) — Minimal lexer + parser for prompt-mode no-params loom — (added)
- `<new>` (Mb) — Minimal runtime + slash registration + two-root discovery + no-params overflow note — (added)
- `V1a` — Numeric literals — (modified — `Deps.` becomes `Ma`)
- `V3c` — Bypass binder (no-params and single-string forms) — (modified — `Deps.` `M (system-note channel)` becomes `Mb (system-note channel)`)
- `V5a` — Bare `@`literal`` query parsed — (modified — `Deps.` `M, V2` becomes `Ma, V2`)
- `V5e` — Prompt-mode conversation driver — (modified — `Deps.` `V5a, M` becomes `V5a, Mb`)
- `V14k` — Discovery: global `~/.pi/agent/looms/` — (modified — `Deps.` `M` becomes `Mb`)
- `V14l` — Discovery: project `.pi/looms/` — (modified — `Deps.` `M` becomes `Mb`)

## Consequence

**Severity:** advisory

The plan still ships if M stays unsplit; the cost is paid in implementation friction. Concretely: a defect in any one of the five sub-areas blocks the whole MVP gate and the ten downstream leaves whose `Deps.` cite M; the M test list cannot be reviewed leaf-by-leaf in the per-phase TDD ritual because its bullets span five spec topics; and several other plan-review findings (system-note dependency ordering, AbortError text, `agent_end` vs `waitForIdle`) target sub-areas inside M and would each prefer a smaller closing leaf to attach to. No implementer is *blocked* — they can sequence the work themselves — but the plan stops giving them a stable ordering and a stable atomic commit boundary.

## Solution Space

**Shape:** single

### Recommendation

Split M into `Ma` (lexer + parser surface) and `Mb` (runtime + slash registration + discovery + overflow note). This is a two-way split along the natural parser-vs-integration seam; Mb stays the recognisable "smallest end-to-end" gate the MVP framing in `conventions.md` already names.

**Plan edits.**
- `plan_topics/m-mvp.md`: rename file or replace content with two `## Ma` / `## Mb` sections. `Ma` carries: frontmatter + body parser scoped to `mode: prompt`, `params:` absent or `{}`, single `` @`literal text` `` expression-statement; the four parse-error tests (unsupported keyword, unterminated template, etc.). `Ma` `Deps.` `H1, H3`. `Ma` `Ships when.` "Minimal 4-line loom parses cleanly into the documented AST shape; rejects the documented unsupported forms." `Mb` carries the remaining `Adds.` and `Tests.` bullets. `Mb` `Deps.` `Ma, H2, H4`. `Mb` `Ships when.` keeps M's current manual-smoke text.
- `plan.md` `## MVP phase` list: replace the single `M` bullet with two bullets, both pointing at `plan_topics/m-mvp.md`.
- `plan_topics/coverage-matrix.md`: in every row whose closing-leaf cell mentions `M`, replace with `Ma, Mb` for `overview.md` and `overview.md#code-and-model`; with `Mb` for `overview.md#scope-of-a-loom-file`, `pi-integration.md`, `pi-integration-contract.md`; and with `Mb, V5e, V12a, V14c, V15a, V18a–V18n` for `implementation-notes.md#runtime`.
- `plan_topics/v1-lexer.md` V1a `Deps.`: `M` → `Ma`.
- `plan_topics/v3-frontmatter.md` V3c `Deps.`: `V3b, M (system-note channel)` → `V3b, Mb (system-note channel)`.
- `plan_topics/v5-untyped-queries.md` V5a `Deps.`: `M, V2` → `Ma, V2`. V5e `Deps.`: `V5a, M` → `V5a, Mb`.
- `plan_topics/v14-tool-calls.md` V14k, V14l `Deps.`: `M` → `Mb`.

Implementer-relevant edge cases:

- (a) the `description`-verbatim test bullet in current M moves to `Mb` (it is a slash-registration assertion, not a parser one);
- (b) the AbortError-system-note bullet moves to `Mb` and inherits the unresolved spec-text question raised by the related "M's 'AbortError' system-note path not defined in spec" finding — leave the bullet as a placeholder that V18m later tightens;
- (c) `Ma` must NOT depend on `H4` (no Pi shim required to parse a file from disk);
- (d) the cross-root precedence test bullet stays with `Mb` because it is a discovery-time check.

## Related Findings

- "M requires `loom-system-note` channel that V18h introduces" — co-resolve (the `Mb` split makes the `Deps.` on V18h or an in-scope renderer easier to state precisely)
- "M's "AbortError" system-note path not defined in spec" — same-cluster (the AbortError bullet moves to Mb's test list; spec-wording resolution is independent)
- "M assumes registration/collision plumbing not yet scheduled" — co-resolve (Mb's slash-registration scope can be stated explicitly, declaring which V14p/V14q rules it owns vs defers)
- "M Ships-when is manual-only for an entire integration slice" — same-cluster (a smaller Mb tightens the manual-smoke surface area but does not by itself replace it)
- "M's `~/.pi/agent/looms/` path expansion unspecified for Windows" — same-cluster (discovery sits in Mb under Option A or Mc under Option B; the Windows-path question lands wherever discovery lands)
- "M's collision warning lacks code/severity" — same-cluster (cross-root precedence bullet lands in Mb/Mc with the discovery work)
- "V5e: `agent_end` global listener instead of `ctx.waitForIdle()`" — co-resolve (the runtime-completion mechanism is described in M's `Adds.`; rewriting it under Mb is the natural moment to switch from `agent_end` to `await ctx.waitForIdle()`)

---

# V5e and M drive prompt-mode completion via `agent_end` instead of the spec-mandated `ctx.waitForIdle()`

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** V5e: `agent_end` global listener instead of `ctx.waitForIdle()`
**Kind:** spec-coverage, assumptions, doc-alignment-broad, clarity

## Finding

`plan_topics/v5-untyped-queries.md` V5e Adds says the `PromptModeConversationDriver` "awaits via `agent_end` listener," and V5e Tests asserts "`agent_end` listener cleaned up after each query (no leak)." `plan_topics/m-mvp.md` M Adds says the MVP runtime "calls `ConversationDriver.send` once, awaits `agent_end`." Both leaves codify the wrong completion signal.

`spec_topics/pi-integration-contract.md` (Conversation drive — prompt mode) is unambiguous: completion is awaited by `await ctx.waitForIdle()` on the `ExtensionCommandContext`, which is session-scoped and "the prompt-mode driver's authoritative completion signal." The spec then names the alternative as a hazard the runtime MUST avoid: "The runtime MUST NOT subscribe to the global `pi.on(\"agent_end\", …)` event for query completion: that event fires for every `AgentSession` in the process … with no per-session origin marker, so a global handler cross-fires across concurrent looms or sibling subagents and resolves the wait on the wrong turn." The spec also pins the side-channel for choosing between idle and steer delivery to `ctx.isIdle()`, and reads "the accumulated assistant text from the final turn — read from the command context after `waitForIdle()` resolves — is the `Ok(string)` value."

The plan as written would have an implementer build precisely the cross-firing global listener the spec forbids, and would have V5e ship a "no leak" test for a subscription that should never have existed. Subagent-mode completion is a separate path and *does* use `session.subscribe(event => event.type === "agent_end")` scoped to that `AgentSession`; the plan has fused the two surfaces.

## Plan Documents

- `plan_topics/v5-untyped-queries.md` — V5e Adds and Tests (edited)
- `plan_topics/m-mvp.md` — Adds and Tests (edited)
- `plan_topics/h2-di-skeleton.md` — `ConversationDriver` seam (read-only; informs whether the seam's contract needs a `waitForIdle` hook on the prompt-mode implementation)
- `plan_topics/conventions.md` — read-only (architectural-test conventions)

## Spec Documents

None

## Affected Leaves

**Phases:** MVP, Vertical V5

**Leaves (implementation order):**

- M — Minimal end-to-end loom — (modified)
- V5e — Prompt-mode conversation driver — (modified)

## Consequence

**Severity:** correctness

If shipped unfixed, the prompt-mode driver subscribes to a global event that fires for every `AgentSession` in the process; the first concurrent subagent or sibling loom turn that emits `agent_end` resolves the wait on the wrong turn, the user-session's accumulated assistant text is read prematurely, and `Ok(string)` returns truncated or empty. The defect is silent under single-loom smoke tests and surfaces only once V12 (subagent) lands or two prompt-mode looms overlap. V5e's "no leak" test would also lock in the wrong API shape, making later correction a contract change rather than a bugfix.

## Solution Space

**Shape:** single

### Recommendation

Edit `plan_topics/v5-untyped-queries.md` V5e:

- Replace the Adds bullet with: `PromptModeConversationDriver` issues `pi.sendUserMessage(text)` when `ctx.isIdle()` is true and `pi.sendUserMessage(text, { deliverAs: "steer" })` otherwise (the captured factory `pi: ExtensionAPI`, not `ctx`); awaits completion via `await ctx.waitForIdle()`; reads the accumulated assistant text from the command context once `waitForIdle()` resolves and returns it as `Ok(string)`. Replaces M's hard-coded driver.
- Replace the Tests bullet with: Single turn round-trips with text equal to the assistant transcript captured between `sendUserMessage` and `waitForIdle()` resolution; mid-stream send uses `deliverAs: "steer"` (selected by `ctx.isIdle() === false`); `waitForIdle()` is the only completion primitive consulted (no `pi.on`, no `session.subscribe` against the user session); transport failure → `Err({kind:"transport"})`.

Edit `plan_topics/m-mvp.md`:

- In Adds, strike "calls `ConversationDriver.send` once, awaits `agent_end`" and replace with: "calls `ConversationDriver.send` once and awaits `ctx.waitForIdle()`; the driver internally uses `pi.sendUserMessage` (via the factory-captured `pi`) and reads the assistant text from `ctx` after `waitForIdle()` resolves."

Add an architectural test under V5e Tests (and reference it from `plan_topics/conventions.md` if a generic "forbidden Pi APIs" allow-list is added there): a static scan asserts that no source file under the runtime tree contains the substring `pi.on("agent_end"` or the regex equivalent `pi\.on\(\s*["']agent_end["']`. Subagent-mode `session.subscribe(...)` against the spawned `AgentSession` remains permitted; the architectural test must scope its prohibition to `pi.on` (the global emitter), not to `subscribe` on a session handle.

If a future cancellation path needs to forward an external `agent_end` (e.g. user typed `/abort` mid-loom), V5e/M MUST state that scope explicitly and route it through the existing `loomAbort` controller rather than through query-completion semantics.

## Related Findings

- "V5e: `ctx.sendUserMessage()` — method does not exist on `ExtensionCommandContext`" — co-resolve (the same V5e Adds rewrite fixes both: `pi.sendUserMessage` for transmission, `ctx.waitForIdle()` for completion, `ctx.isIdle()` as the only `ctx`-side query)
- "M too large — five distinct concerns in one leaf" — same-cluster (the runtime concern in M carries the same `agent_end` defect; if M is split into Ma/Mb, the corrected wording lands in Mb)
- "V5e Ships-when: \"a real Pi session\" is unverifiable from the leaf gate" — same-cluster (touches V5e Ships-when, independent fix)
- "V5e \"Single turn round-trips\" meaningless" — co-resolve (the Tests rewrite above replaces that bullet with a concrete `waitForIdle`-based assertion)
- "M's \"AbortError\" system-note path not defined in spec" — same-cluster (also in M Adds/Tests; resolved independently but edits the same file)

---

# V5e Adds calls `ctx.sendUserMessage(text)`, but that method lives on `pi: ExtensionAPI`, not on `ExtensionCommandContext`

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** V5e: `ctx.sendUserMessage()` — method does not exist on `ExtensionCommandContext`
**Kind:** doc-alignment-broad

## Finding

V5e's **Adds** field in `plan_topics/v5-untyped-queries.md` says the prompt-mode driver "issues `ctx.sendUserMessage(text)` (or `{ deliverAs: "steer" }` mid-stream)". The spec at `spec_topics/pi-integration-contract.md` (Conversation drive — prompt mode) is explicit and contrary: `sendUserMessage` is **not** a method on `ExtensionCommandContext`; the call site is `pi.sendUserMessage(text)` where `pi` is the `ExtensionAPI` captured by the extension factory (`default function (pi: ExtensionAPI)`). The per-handler `ctx` is consulted only for `ctx.isIdle()` and (per the sibling V5e finding on completion signalling) `ctx.waitForIdle()`.

The two surfaces are not interchangeable. `pi: ExtensionAPI` is captured once at factory time and held for the lifetime of every loom invocation; `ctx: ExtensionCommandContext` is a per-handler argument with a deliberately narrower API. An implementer reading V5e literally would either (a) write code that fails to compile against Pi's TypeScript types, then guess at a fix, or (b) invent a wrapper on `ctx` that defeats the spec's two-surface design.

The fix is a textual correction of one bullet, plus a Tests addition that pins the rule (so future drift is caught by the suite rather than by code review).

## Plan Documents

- `plan_topics/v5-untyped-queries.md` — V5e (Adds, Tests) (edited)

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Conversation drive — prompt mode" (read-only)

## Affected Leaves

**Phases:** Vertical V5

**Leaves (implementation order):**

- V5e — Prompt-mode conversation driver — (modified)

## Consequence

**Severity:** correctness

The implementer of V5e is told to call a method that does not exist on the `ctx` surface and is told to ignore the surface that does carry it. A strict implementer will catch the mismatch against Pi's types and follow the spec; a less strict one will introduce a `ctx`-shaped shim that violates the spec's two-surface separation. Either way, downstream V5/V6/V12 leaves that wire the same driver inherit the ambiguity.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/v5-untyped-queries.md`, leaf `V5e — Prompt-mode conversation driver`:

- Replace the **Adds** clause `` `PromptModeConversationDriver` issues `ctx.sendUserMessage(text)` (or `{ deliverAs: "steer" }` mid-stream) `` with `` `PromptModeConversationDriver` issues `pi.sendUserMessage(text)` (or `pi.sendUserMessage(text, { deliverAs: "steer" })` mid-stream), where `pi: ExtensionAPI` is the reference captured by the extension factory and held by the runtime for the lifetime of each loom invocation; `ctx: ExtensionCommandContext` is consulted only for idle-state probes (`ctx.isIdle()` / `ctx.waitForIdle()`) per [Pi Integration Contract — Conversation drive — prompt mode](../spec_topics/pi-integration-contract.md). ``
- Append a Tests bullet: "Driver references the factory-captured `pi.sendUserMessage` for both initial and steer sends; an architectural test asserts no source file under the prompt-mode driver module reads `sendUserMessage` off any `ExtensionCommandContext`-typed value."

Edge case the implementer must watch: the same `pi` reference is reused across concurrent loom invocations in the same extension process, so the driver must not mutate `pi`-level state (e.g. installing global listeners) per call — that is the subject of the sibling V5e completion-signal finding and must stay consistent with the resolution there.

## Related Findings

- "V5e: `agent_end` global listener instead of `ctx.waitForIdle()`" — co-resolve (same V5e Adds bullet; both edits land in one rewrite of the driver description)
- "V5e Ships-when: \"a real Pi session\" is unverifiable from the leaf gate" — same-cluster (same leaf, independent fix to Ships-when)
- "V5e \"Single turn round-trips\" meaningless" — same-cluster (same leaf, independent fix to Tests wording)

---

# M depends on `loom-system-note` channel infrastructure that V18h introduces later

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** M requires `loom-system-note` channel that V18h introduces
**Kind:** implementability, assumptions, consistency

## Finding

M's `Tests` bullets assert the spec-verbatim text of two `loom-system-note` messages — the no-params overflow note (`/hello extra text emits the no-params overflow system note (text matches spec verbatim)`) and an `AbortError` system note. The mechanism that delivers these notes — the `customType: "loom-system-note"` channel call, the `pi.registerMessageRenderer("loom-system-note", …)` registration, and the best-effort `ctx.ui.notify` → `loom/runtime/system-note-delivery-failed` → `console.error` fallback — is currently scoped to V18h ("Custom Pi message type `loom-system-note` and renderer"). M's `Deps` field is `H1–H4` and does not list V18h; V18h sits much later in the implementation order (after V1–V17 and most of V18).

The spec is normative on the timing of the renderer registration: `spec_topics/diagnostics.md` states "The renderer MUST be registered synchronously inside the extension factory **before** the first discovery scan kicks off, so the first batch of scan diagnostics renders through the loom-specific renderer rather than as raw fallback text." M owns the first scan (`Discovery: ~/.pi/agent/looms/ and .pi/looms/ only`), so the renderer must exist by the time M ships, not at V18h.

The plan double-locates the channel: `v3-frontmatter.md` line 26 gives V3c `Deps.` of "V3b, M (system-note channel)" — that is, V3c already treats **M** as the introducer of the channel — while `v18-cancellation.md` simultaneously assigns the `customType` + renderer to **V18h** and the coverage matrix lists both M and V18h against `pi-integration-contract.md`. There is no single owning leaf, and the leaf the plan actually orders first (M) has no `Adds` text giving it the channel.

## Plan Documents

- `plan_topics/m-mvp.md` — Adds, Tests, Deps (edited)
- `plan_topics/h4-extension-shell.md` — Adds, Tests, Deps (option-dependent)
- `plan_topics/v18-cancellation.md` — V18h section; V18i `Deps`; V18m `Deps` (edited)
- `plan_topics/v3-frontmatter.md` — V3c `Deps` parenthetical (edited)
- `plan_topics/coverage-matrix.md` — `pi-integration.md` and `pi-integration-contract.md` rows naming V18h (edited)
- `plan.md` — leaf list (read-only)

## Spec Documents

None — `spec_topics/diagnostics.md`, `spec_topics/pi-integration-contract.md`, and `spec_topics/slash-invocation.md` are read-only references; the spec already gives a coherent contract.

## Affected Leaves

**Phases:** Horizontal, MVP, Vertical V3, Vertical V18

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified)
- M — Minimal end-to-end loom — (modified)
- V3c — Bypass binder (no-params and single-string forms) — (modified)
- V18h — Custom Pi message type `loom-system-note` and renderer — (modified)
- V18i — Per-`kind` formatting for prompt-mode top-level `Err` — (modified)
- V18m — Panic routing: slash-command surface — (modified)

## Consequence

**Severity:** blocking

M cannot ship as written: its `Tests.` assertions on the verbatim no-params overflow note and the AbortError note require the `loom-system-note` channel + renderer to exist, but its `Deps.` does not pull them in and they are scheduled to land much later. Two reasonable implementers will diverge — one will silently introduce the channel inside M (rendering V18h vacuous), the other will leave the test on raw `pi.sendMessage` text and the renderer-registration-before-first-scan mandate from `diagnostics.md` will be violated. The contradiction with V3c's `Deps.` parenthetical ("M (system-note channel)") makes the divergence guaranteed.

## Solution Space

**Shape:** single

### Recommendation

Hoist the `loom-system-note` channel infrastructure into H4 (extension-factory infrastructure, where the spec says it belongs) and retire V18h. The spec already says the renderer must be registered synchronously inside the extension factory before the first scan — H4 is the leaf that owns the factory, so this is the spec-natural home. Mb (the runtime/integration half of M after the D5 split) consumes the channel via H4.

**Plan edits.**
- `plan_topics/h4-extension-shell.md` — extend `Adds.` to include: "Registers `pi.registerMessageRenderer(\"loom-system-note\", …)` synchronously inside the extension factory before any discovery scan kicks off, formatting the note as a one-line dim transcript entry. Provides a `sendSystemNote(content, details?)` helper that wraps `pi.sendMessage({ customType: \"loom-system-note\", content, display: true, details }, { triggerTurn: false })` with the best-effort fallback chain `ctx.ui.notify(content, \"error\")` → `loom/runtime/system-note-delivery-failed` diagnostic → `console.error` per [Pi Integration Contract — System notes](../spec_topics/pi-integration-contract.md)." Add Tests bullets: "Renderer is registered before any discovery-scan side effect runs (asserted by ordering probe on `FakeExtensionAPI`)"; "`sendSystemNote` falls back through `ctx.ui.notify` then `loom/runtime/system-note-delivery-failed` then `console.error` when `pi.sendMessage` throws or rejects."
- `plan_topics/v18-cancellation.md` — strike the V18h section in full; renumber subsequent V18 leaves only if other leaves' `Deps` fields cite V18h. Update `V18i.Deps` from `V18h` to `H4`. Update `V18m.Deps` to replace `V18h` with `H4`.
- `plan_topics/m-mvp.md` — in the Mb sub-leaf (per D5), leave `Deps.` as `Ma, H2, H4`; rephrase Tests bullet for AbortError to "AbortError surfaces via the H4 `sendSystemNote` helper." Leave the no-params overflow text test as-is.
- `plan_topics/v3-frontmatter.md` — change V3c `Deps.` parenthetical from `V3b, Mb (system-note channel)` to `V3b, H4 (system-note channel)`.
- `plan_topics/coverage-matrix.md` — strike `V18h` from the rows for `pi-integration.md` and `pi-integration-contract.md`; add `H4` to those rows if not already present.

**Spec edits.** None.

Edge cases for the H4 implementer:

- The renderer-registration-before-first-scan ordering must be observable in tests (use a `FakeExtensionAPI` probe that records the order of `pi.registerMessageRenderer` and the first `readdir` call, not just final state).
- The `sendSystemNote` helper must apply the full three-step fallback chain; the `console.error` step exists only so the helper never throws into the slash-command handler.
- Re-entry guard: if `loom/runtime/system-note-delivery-failed` is itself emitted via the helper, the diagnostic-step fallback MUST NOT re-invoke `pi.sendMessage` (per `pi-integration-contract.md` line 162).

## Related Findings

- "M too large — five distinct concerns in one leaf" — same-cluster (both touch M's scope; resolving this finding by hoisting to H4 also reduces M's surface, which independently aids that split)
- "M's \"AbortError\" system-note path not defined in spec" — co-resolve (M's AbortError test bullet must be rewritten in the same edit; the spec uses `kind: "cancelled"`, not `AbortError`, so the rewrite both fixes the channel reference and aligns the wording)
- "M assumes registration/collision plumbing not yet scheduled" — same-cluster (separate plumbing gap in M's `Adds.`, but the same H4-vs-M ownership question)
- "`loomAbort` controller construction not assigned to any leaf" — decision-dependency (if H4 absorbs system-note plumbing per Option A, the same edit is the natural place to hoist `loomAbort` construction; resolve A first)
- "V18n missing from `Invocation` coverage row" — same-cluster (coverage-matrix edits land in the same file and should be batched)

---

# M's cancellation test bullet uses an off-spec name (`AbortError`)

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** M's "AbortError" system-note path not defined in spec
**Kind:** codebase-grounding-broad, clarity, consistency

## Finding

`plan_topics/m-mvp.md` lists the test "AbortError surfaces as a system note." The string `AbortError` is not a spec-defined term anywhere under `spec_topics/`. The cancellation surface in `spec_topics/cancellation.md` uses `Err(QueryError { kind: "cancelled", ... })`, and the user-visible top-level surface is the `cancelled` row in the per-`kind` system-note table in `spec_topics/slash-invocation.md` (verbatim text: `loom /<name> cancelled`). The per-`kind` formatter that emits that exact string lands in V18i ("Per-`kind` formatting for prompt-mode top-level `Err`"), not at M.

The bullet therefore conflates three things that the spec keeps separate: (1) the JS-platform `AbortError` name, which the spec never adopts; (2) the in-language `Result` surface (`kind: "cancelled"`); and (3) the Pi-side rendered system note (`loom /<name> cancelled`). An M-implementer reading the bullet has no way to know which of these they are supposed to assert, and is likely to invent wording that V18i's formatter will later contradict.

The defect is in the M test bullet's wording, not in M's intended scope. M genuinely needs *some* observable cancellation behaviour through the slash boundary in order to ship a working end-to-end loom; the question is what it asserts and against what spec-anchored text.

## Plan Documents

- `plan_topics/m-mvp.md` — Tests bullet "AbortError surfaces as a system note." (edited)
- `plan_topics/v18-cancellation.md` — V18i ("Per-`kind` formatting") and V18h ("`loom-system-note` channel and renderer") (read-only; cited as forward references)

## Spec Documents

- `spec_topics/cancellation.md` — Surfacing rules; `Err(QueryError { kind: "cancelled", ... })` (read-only)
- `spec_topics/slash-invocation.md` — Per-`kind` system-note table; `cancelled` row (read-only)

## Affected Leaves

**Phases:** MVP

**Leaves (implementation order):**

- M — Minimal end-to-end loom — (modified)

## Consequence

**Severity:** correctness

Two reasonable M-implementers will diverge on what to assert and what literal text to expect: one will write `expect(err.name).toBe("AbortError")` against the runtime's `Result`, another will assert the Pi-side `loom-system-note` content equals `loom /hello cancelled`, and a third will just assert that *some* `customType: "loom-system-note"` was emitted. Whichever wording is chosen at M will need to be revisited (and possibly rewritten) when V18i lands, defeating the point of writing the assertion now.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/m-mvp.md`, replace the Tests bullet

> - AbortError surfaces as a system note.

with

> - Triggering cancellation during the loom's `send` (Pi `ctx.signal` aborted, or `agent_end` reports a user-cancelled turn — see [Cancellation — slash-command entry](../spec_topics/cancellation.md)) causes the runtime to emit exactly one `pi.sendMessage` call with `customType: "loom-system-note"` and `triggerTurn: false`. M asserts only the *presence* of that note plus that the loom run terminates without throwing into Pi; the per-`kind` body text (`loom /<name> cancelled`) is pinned later by V18i and is out of scope here.

This keeps M's gate observable end-to-end, anchors every term it uses in an existing spec page (`cancellation.md` for the trigger, `pi-integration-contract.md` for the `customType`/`triggerTurn` shape, `slash-invocation.md` for the table V18i will tighten), and explicitly defers the literal-text assertion to V18i so the M assertion does not have to be rewritten when V18i lands. Edge case for the implementer: do not assert on `err.name`, `err.message`, or any `AbortError`-shaped JS value — the spec's surface at this layer is `kind: "cancelled"` on a `Result`, not a thrown JS error.

## Related Findings

- "M requires `loom-system-note` channel that V18h introduces" — co-resolve (both touch the same M test bullet; the wording change here removes the literal-text dependency on V18i, while the sibling finding addresses the missing V18h channel/renderer dependency)
- "`loomAbort` controller construction not assigned to any leaf" — same-cluster (cites the same M test bullet as evidence that controller plumbing is required at M; resolved independently by introducing/assigning the controller construction to a leaf)
- "`InvokeInfraError.reason: \"cancelled\"` absent from spec schema" — same-cluster (also a cancellation-vocabulary mismatch between plan and spec, but on the `invoke` surface rather than the slash surface)

---

# M conflates the factory and `session_start` registration phases

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** M assumes registration/collision plumbing not yet scheduled
**Kind:** implementability, assumptions, consistency

## Finding

`spec_topics/pi-integration-contract.md` (Extension entry point, steps 1–3) is explicit that the loom extension factory MUST NOT call `pi.registerCommand` synchronously: at factory time `pi.getCommands()` returns `notInitialized` (it only becomes readable when `Runner.bindCore()` fires alongside `session_start`), so cross-format collision detection cannot run there. The contract therefore mandates a two-phase split — the factory walks discovery sources and builds a *pending registration list*; a subscribed `session_start` handler then consults `pi.getCommands()`, drops any pending loom whose slash name collides with an existing prompt-template / subagent / extension entry (emitting `loom/load/cross-format-collision`), and only then calls `pi.registerCommand` on the survivors.

`plan_topics/m-mvp.md` does not reflect this split. Its `Adds.` mentions `pi.registerCommand` directly and the only collision case it tests is the cross-source-shadow case — "two files producing the same slash name across the two roots: only the project one registers; warning names both paths" — which is the V14p concern (cross-priority shadowing within loom-only sources), not the V14q cross-format check. The leaf neither states which steps of the integration contract M owns end-to-end (factory walk, pending list, `session_start` subscription, cross-source priority drop, the actual `pi.registerCommand` call) nor forward-references which steps it defers (cross-format collision to V14q; renderer registration to V18h; the further three discovery sources to V14m–V14o).

A reasonable M-implementer reading only the leaf will register commands directly from the factory, skip the `session_start` subscription entirely, and miss the cross-format collision check. The result still passes M's stated tests against `FakeExtensionAPI` (because the fake exposes no Pi-owned commands to collide with) but breaks the contract the moment the extension loads against a real Pi session that already owns `/code-review` as a prompt template.

## Plan Documents

- `plan_topics/m-mvp.md` — `Adds.` and `Tests.` (edited)
- `plan_topics/h4-extension-shell.md` — `Adds.` (option-dependent — only if any plumbing is hoisted to H4)
- `plan_topics/v14-tool-calls.md` — V14p, V14q, V14m–V14o (read-only)
- `plan_topics/coverage-matrix.md` — "Pi Extension Integration" row (read-only)

## Spec Documents

None.

## Affected Leaves

**Phases:** MVP, Vertical V14

**Leaves (implementation order):**

- M — Minimal end-to-end loom — (modified)
- V14p — Source priority and shadowing warning — (read-only — confirms cross-source ownership boundary)
- V14q — Slash collision at the same priority — (read-only — confirms cross-format ownership boundary)

## Consequence

**Severity:** correctness

Two reasonable M-implementers will diverge: one registers slash commands directly from the factory (matching the leaf's literal wording but violating the spec's explicit `notInitialized` rule), the other subscribes a `session_start` handler. Either implementation passes M's fakes-driven tests; only the latter survives the manual `Ships when` smoke against a real Pi session, and only when the user has no colliding prompt template. M's spec-coverage claim against `pi-integration-contract.md` is silently vacuous for the registration-pipeline rules.

## Solution Space

**Shape:** single

### Recommendation

Rewrite M's `Adds.` registration sentence to make the two-phase split and the deferred concerns explicit. Replace the bare "Slash command registration: …" sentence with:

> Slash command registration follows the two-phase split mandated by [Pi Integration Contract — Extension entry point](../spec_topics/pi-integration-contract.md) steps 1–3. The factory walks the two in-scope discovery sources (`~/.pi/agent/looms/` and `.pi/looms/`), parses each `.loom`, and builds a pending registration list keyed by slash name; the factory does **not** call `pi.registerCommand`. A `session_start` handler then consults `pi.getCommands()`, drops pending entries whose name collides with an entry whose `source` is `"prompt"`, `"subagent"`, or `"extension"`, and registers each survivor via `pi.registerCommand(name, { description, getArgumentCompletions, handler })`. The `description` field carries `frontmatter.description` verbatim and only that — `argument-hint` is not concatenated. M owns: factory walk over the two in-scope sources, pending list, `session_start` subscription, the cross-source priority drop between the two roots (project wins; warning names both paths), and the `pi.registerCommand` call. M defers: the cross-format collision check and its `loom/load/cross-format-collision` diagnostic to V14q; the remaining three discovery sources (package, settings, `--loom`) to V14m–V14o; the five-source priority rule beyond the project-vs-global pair to V14p; the `loom-system-note` renderer registration to V18h; the `loomAbort` controller plumbing to whichever leaf the companion findings assign it to.

Add the following bullet to `Tests.`:

> The factory invocation does **not** call `pi.registerCommand` (assert on `FakeExtensionAPI`'s register-command counter); a `session_start` handler is subscribed during the factory call; firing `session_start` on the fake then triggers the `pi.registerCommand` call. With `FakeExtensionAPI.commands` pre-populated with an entry of the same name and `source: "prompt"`, the loom does not register and a `loom/load/cross-format-collision` diagnostic is emitted (covers the M-side wiring; V14q owns the rule's full surface).

Edge cases the implementer must watch:

- The fake `ExtensionAPI` used by H2 must expose `getCommands()` returning `notInitialized` during the factory call and a populated map after `session_start` fires; if H2's fake does not yet model this, that is an H2 gap that surfaces here.
- The `session_start` handler must register the command synchronously inside its callback, not via a deferred microtask, so the first user `/hello` invocation after session start finds the command registered.
- The cross-source-shadow test ("two files across two roots") moves into the `session_start`-driven path; the warning is still emitted at load time (factory phase), but the registration-suppression observation is on the `session_start`-phase counter.

## Related Findings

- "M requires `loom-system-note` channel that V18h introduces" — co-resolve (same fix surface: enumerate which infrastructure M owns vs forward-references; the renderer registration is item (a) in the original suggested-fix list).
- "`loomAbort` controller construction not assigned to any leaf" — same-cluster (sibling plumbing-ownership gap in M; both rest on the same "M does not declare its prerequisites" theme but resolve through independent edits).
- "M's `AbortError` system-note path not defined in spec" — same-cluster (another M test that depends on later-leaf infrastructure; resolves independently via the spec's `kind: "cancelled"` contract).
- "M's Ships-when is manual-only for an entire integration slice" — same-cluster (M's verification surface; the new `session_start` test bullet recommended above is one fakes-side mitigation but does not replace the end-to-end harness that finding asks for).

---

# `loomAbort` controller construction not assigned to any leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** `loomAbort` controller construction not assigned to any leaf
**Kind:** implementability, assumptions, spec-coverage

## Finding

`spec_topics/cancellation.md` is unambiguous: every loom invocation owns a fresh `AbortController` (`loomAbort`) constructed at invocation start, and `loomAbort.signal` — never `ctx.signal` — is the single source of truth threaded through every downstream checkpoint, the synthesised `ExtensionContext.signal`, the `signal` argument to `tool.execute`, the parent signal handed to a child invoke, and the `signal` passed to `createAgentSession`. The same page mandates that the slash-command entry-point handler subscribes to Pi's `tool_call` / `tool_result` / `message_update` / `turn_end` / `agent_end` events to forward an aborted `ctx.signal` into `loomAbort.abort()`, that the runtime tolerates `ctx.signal === undefined` (Pi documents it as `undefined` in idle / non-turn contexts, which is exactly when the slash handler fires), and that all forwarding listeners are removed in a `finally` block.

No leaf in the plan introduces this controller or its forwarders. M's `Adds` bullet describes the runtime (walks the body, calls `ConversationDriver.send` once, awaits `agent_end`) but does not name `loomAbort`, the forwarder subscriptions, or the `ctx.signal === undefined` tolerance. H4's `Adds` covers adapter shims, the tool-registration cache, and `withActiveTools` but does not own per-invocation state. V14c's `Adds` already *references* `loomAbort.signal` (it overrides `ctx.signal` to `loomAbort.signal` in the synthesised `ExtensionContext`), implying the controller exists by then — but V14c is itself a consumer, not the constructor. The first leaf where the controller's existence is demanded is M, whose Tests bullet "AbortError surfaces as a system note" cannot pass without it.

The construction is per-invocation, not per-extension-instance, so it cannot live in the H4 factory. It belongs in M's runtime — the leaf that first turns a slash command into an executing loom — and M is the leaf that needs to declare ownership.

## Plan Documents

- `plan_topics/m-mvp.md` — `Adds`, `Tests`, `Spec.` (edited)
- `plan_topics/h4-extension-shell.md` — `Adds` (read-only — confirm shell is per-extension, not per-invocation)
- `plan_topics/v14-tool-calls.md` — V14c `Adds` (read-only — already names `loomAbort.signal` as override source)
- `plan_topics/v18-cancellation.md` — V18a–V18e (read-only — checkpoints assume `loomAbort.signal` exists)

## Spec Documents

None. `spec_topics/cancellation.md` and `spec_topics/pi-integration-contract.md` already specify the construction site, the forwarder set, the `ctx.signal === undefined` tolerance, and the `finally`-block listener cleanup. The fix is purely internal to the plan.

## Affected Leaves

**Phases:** MVP

**Leaves (implementation order):**

- M — Minimal end-to-end loom — (modified)

## Consequence

**Severity:** correctness

Two implementers picking up M will diverge on where `loomAbort` is constructed, which Pi events the runtime subscribes to in order to forward `ctx.signal`, and whether the slash handler tolerates `ctx.signal === undefined` at entry. One plausible misreading is to treat `ctx.signal` as the loom's signal directly, which silently breaks Esc-during-`@`-query for every downstream V18 checkpoint and produces a non-deterministic pass on M's "AbortError surfaces as a system note" test. V14c's `ctx.signal` override (`ctx.signal === loomAbort.signal`, never `undefined`) becomes untestable in a tree where the controller doesn't actually exist.

## Solution Space

**Shape:** single

### Recommendation

Extend `plan_topics/m-mvp.md` to claim ownership of the per-invocation controller and its slash-entry forwarders. Concretely:

1. **`Spec.` field — add** a citation for the cancellation contract: append `, [Cancellation — Signal source and Forwarding into loomAbort](../spec_topics/cancellation.md)` to the existing Spec list.

2. **`Adds.` field — append** a sentence (after the existing Discovery sentence, before the period that ends the bullet):

   > Per-invocation cancellation plumbing: the slash-command handler tolerates `ctx.signal === undefined` at entry, constructs a fresh `AbortController` (`loomAbort`) per invocation per [Cancellation — Signal source](../spec_topics/cancellation.md), subscribes to Pi's `tool_call`, `tool_result`, `message_update`, `turn_end`, and `agent_end` events for the duration of the run so that an aborted `ctx.signal` (or an `agent_end` reporting a user-cancelled turn) triggers `loomAbort.abort()`, and removes every subscribed listener in a `finally` block on loom return or panic. `loomAbort.signal` is the signal threaded into the prompt-mode driver's `agent_end` wait.

3. **`Tests.` field — replace** the existing single bullet `AbortError surfaces as a system note.` with four bullets covering construction, forwarder, tolerance, and cleanup:

   - `Slash handler invoked with ctx.signal === undefined runs without throwing (idle-entry tolerance).`
   - `Each invocation constructs a distinct AbortController; loomAbort.signal is always defined.`
   - `Aborting ctx.signal during the agent_end wait calls loomAbort.abort() exactly once via the forwarder; the in-flight send surfaces as the cancelled system note (exact text per V18i / V18m, asserted as "presence of customType: 'loom-system-note'" until V18i tightens — cross-reference the sibling finding on M's AbortError wording).`
   - `On loom return and on loom panic, every listener subscribed to ctx (tool_call, tool_result, message_update, turn_end, agent_end) is removed (asserted by a counting probe on the FakeExtensionAPI event bus).`

   Implementer edge case: the `agent_end` forwarder must distinguish a *user-cancelled* `agent_end` (which aborts `loomAbort`) from a *normal* `agent_end` (which simply resolves the prompt-mode wait); both paths share the same event but only the former triggers `loomAbort.abort()`.

4. **`Deps.` field — no change.** H4's `Deps. H2` already covers the adapter shims; the controller is constructed inside the M-owned slash handler and needs nothing earlier.

The alternative of moving construction into H4 is wrong: H4 is invoked once per extension load, `loomAbort` is per-invocation, and H4 has no slash-handler scope in which to subscribe forwarders.

## Related Findings

- "M's `AbortError` system-note path not defined in spec" — co-resolve (the AbortError test bullet edited here is the same one that finding rewrites for spec-fidelity wording; both edits target the same M Tests line)
- "Binder cancellation checkpoint — no plan leaf" — same-cluster (also covers a missing cancellation forwarder, but at the binder LLM call rather than the slash entry; resolves independently in V18b.1)
- "M too large — five distinct concerns in one leaf" — decision-dependency (if M splits into Ma/Mb, the per-invocation cancellation plumbing belongs in Mb alongside the runtime + slash registration, not in Ma)
- "M requires `loom-system-note` channel that V18h introduces" — same-cluster (the AbortError Tests bullet also depends on the system-note channel being available at M-time)

---

# M's integration gate is manual-only and unprotected for the rest of the plan

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** M Ships-when is manual-only for an entire integration slice
**Kind:** validation

## Finding

M's `Ships when` reads "Manual: `hello.loom` placed in `.pi/looms/`, slash `/hello` produces an assistant turn in a real Pi session." Every other M `Tests.` bullet runs against the H2 fakes (`FakeExtensionAPI`, `FakeModelClient`, etc.) — none of them exercises the actual `@mariozechner/pi-coding-agent` runtime. The only automation that crosses the `PiExtensionAPI` shim boundary is therefore zero.

M is the first leaf where the shim/runtime seam matters. From M onward, every downstream leaf (`V5e`, `V14k`–`V14q`, `V18f`–`V18i`, …) reuses the same shims and never adds an automated check against real Pi either — `V5e`'s own `Ships when` repeats the "real Pi session can run a multi-query loom" pattern with the same fakes-only Tests. A regression in any shim — wrong `pi.registerCommand` description shape, `withActiveTools` snapshot/restore not actually delegating, `session_start` handler not firing on a real `ExtensionAPI`, the `~` expansion call diverging on Windows — passes every leaf gate from M through V18 and only surfaces when a human re-runs the manual smoke.

The Pi SDK exports `createAgentSession` / `AgentSessionRuntime` from `@mariozechner/pi-coding-agent` (see `docs/sdk.md`), so loading the built extension into a real Pi runtime from a Vitest process — with a recorded or scripted provider responding to the single `send` — is feasible without spawning a subprocess. There is no infrastructure obstacle to closing the gap; the plan simply does not schedule it.

## Plan Documents

- `plan_topics/m-mvp.md` — `Ships when.` and `Tests.` (edited)
- `plan_topics/h4-extension-shell.md` — sibling slot for a new harness leaf (edited)
- `plan.md` — Horizontal phases TOC (edited)
- `plan_topics/coverage-matrix.md` — new row for the harness leaf, plus M's row (edited)
- `plan_topics/conventions.md` — `Ships when` convention may need a phrase about scripted-vs-manual gates (read-only)
- `plan_topics/v5-untyped-queries.md` — V5e shares the same anti-pattern; co-resolves once a harness exists (read-only)

## Spec Documents

None.

## Affected Leaves

**Phases:** Horizontal, MVP

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified)
- `<new>` — Pi end-to-end harness (e.g. `H4b` or `H5`) — (added)
- M — Minimal end-to-end loom — (modified)

## Consequence

**Severity:** correctness

The `PiExtensionAPI` / `PiModelClient` / `PiToolHost` / `PiFileSystem` shims have no automated test against the real `pi-coding-agent` runtime through M and the entire V1–V18 build-out. Any drift between the H2 fakes and the real Pi surface (method names, lifecycle ordering, error shapes, `session_start` semantics, `~` expansion) compiles, type-checks, and ships green; only a human running the manual smoke catches it. Two implementers will also disagree on whether M's gate is actually met when the manual smoke is skipped during a fast iteration loop.

## Solution Space

**Shape:** single

### Recommendation

Add a new horizontal harness leaf (placeholder ID `<new>`, slotted between H4 and M as e.g. `H4b` or `H5`) that builds a reusable in-process Pi end-to-end harness on top of `createAgentSession` from `@mariozechner/pi-coding-agent`, then promote M's gate from a manual smoke to a scripted assertion against that harness.

Concrete edits:

1. Create `plan_topics/h4b-pi-e2e-harness.md` (or whatever ID the implementer picks for `<new>`) with:
   - **Spec.** `[Pi Extension Integration](../spec_topics/pi-integration.md)`, `[Pi Integration Contract](../spec_topics/pi-integration-contract.md)`.
   - **Adds.** `test/integration/pi-harness.ts` exporting `createLoomTestSession({ extensionFactory, scriptedProvider })` that wires the project's `default function (pi)` factory into a real `AgentSession` via `createAgentSession`, with a scripted/recorded provider for deterministic turns; a Vitest helper `runSlash(name, argString)` that drives a slash command end-to-end and returns the resulting transcript entries.
   - **Tests.** Harness boots an empty extension and `/loom-status` (registered by H4) returns its no-op string from a real `AgentSession`; the harness tears the session down cleanly between tests; provider scripting is deterministic across runs.
   - **Deps.** H4.
   - **Ships when.** `npm test` exercises a real `AgentSession` with the project's extension factory loaded and at least one slash command round-trips.
2. Add a row to `plan_topics/coverage-matrix.md` mapping `[Pi Extension Integration](../spec_topics/pi-integration.md)` to include the new leaf alongside the existing `M, V14k–V14q, V18f, V18h`.
3. Add the new leaf to `plan.md` under `## Horizontal phases` between the H4 and MVP entries.
4. In `plan_topics/m-mvp.md`:
   - Append to `Deps.`: the new harness leaf ID.
   - Replace the `Ships when.` line with: `**Ships when.** Integration test in `test/integration/m-hello.test.ts` boots the harness, places `hello.loom` in a temp `.pi/looms/`, dispatches `/hello`, and asserts a single `assistant` turn whose text equals the scripted provider response.`
   - Append a `Tests.` bullet: `End-to-end via the Pi harness: `/hello` registered → dispatched → one `send` observed by the scripted provider → one assistant turn surfaced in the transcript.`

The same harness is then reused (without further plan edits in this finding) by `V5e`'s `Ships when`, by `V14k`–`V14q` for discovery against a real `ExtensionAPI`, and by `V18f`–`V18i` for system-note rendering — closing the corresponding "real Pi session" claims that today are unverifiable from each leaf gate.

Edge cases the implementer must watch:

- The harness must not require a real model API key. The scripted provider is wired via `createAgentSession`'s injection points (see `docs/sdk.md` and `docs/custom-provider.md`); CI must run with provider auth absent.
- `createAgentSession` runs the extension factory once per session. Tests that need `/reload` semantics must instantiate a fresh session, not reuse one.
- The `pi -e <dir>` H4 manual smoke is a separate finding; the harness does not subsume it because `pi -e` exercises Pi's CLI extension-discovery path, not just the factory invocation. Keep H4's smoke entry but stop using "manual in real Pi session" as the only gate from M onward.

## Related Findings

- "V5e Ships-when: \"a real Pi session\" is unverifiable from the leaf gate" — co-resolve (same harness closes V5e's gate)
- "`docs/manual-smoke.md` does not exist and its creation violates CLAUDE.md" — same-cluster (both are about manual-smoke gating; the harness reduces but does not eliminate the H4 manual-smoke question)
- "H4 Ships-when uses undocumented `pi -e <dir>` invocation" — same-cluster (touches H4's manual gate, but addresses CLI invocation form, not the missing automation)
- "M too large — five distinct concerns in one leaf" — decision-dependency (if M is split into Ma/Mb, the new Ships-when belongs on Mb, not Ma)
- "M requires `loom-system-note` channel that V18h introduces" — same-cluster (touches M's Tests/Deps; the harness leaf does not change Deps direction but the harness will surface this gap when run)

---

# M's `~/.pi/agent/looms/` path expansion unspecified for Windows

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** M's `~/.pi/agent/looms/` path expansion unspecified for Windows
**Kind:** implementability

## Finding

`spec_topics/discovery.md` defines the leading-`~` expansion rule **only inside two subsections** — "Settings file reads" (`~/.pi/agent/settings.json` resolves "`$HOME` on POSIX, `%USERPROFILE%` on Windows") and the `looms`-entry schema ("`~` expands against the same home directory used elsewhere in this file"). The same `~/` prefix appears unqualified in five other normative locations: the global discovery root `~/.pi/agent/looms/`, the global package roots `~/.pi/agent/npm/` and `~/.pi/agent/git/<host>/<path>/`, and the implicit reach of `--loom` CLI components. None of these sites cite an expansion API or cross-reference the settings paragraph; the phrase "the same home directory used elsewhere in this file" is itself a back-reference, not a primary definition.

This propagates into the plan. M's Tests bullet asserts `` `~/.pi/agent/looms/hello.loom` registers `/hello` `` without naming the expansion mechanism. V14k ("Discovery: global `~/.pi/agent/looms/`") inherits the same gap. V14n already specifies "`~` expanded" for its own settings paths but does not export that rule; V14o defers to V14n only for the `looms`-array resolver, not for the `--loom` flag's own components. Two implementers asked to write the global-root scanner can reasonably reach for `process.env.HOME`, `process.env.USERPROFILE`, manual concatenation, or Node's `os.homedir()` — and those answers diverge on Windows (where `HOME` is often unset under cmd/powershell, and `USERPROFILE` is the canonical source) and inside CI containers (where neither variable matches the home `os.homedir()` would compute). The result is two builds of the extension whose global discovery scans different directories on the same machine, with no leaf gate detecting the divergence.

## Plan Documents

- `plan_topics/m-mvp.md` — Tests bullet `` `~/.pi/agent/looms/hello.loom` registers `/hello` `` (edited)
- `plan_topics/v14-tool-calls.md` — V14k Tests; V14n Tests (the `~ expanded` clause); V14o Tests (the `--loom` resolver) (edited)
- `plan_topics/h2-di-skeleton.md` — `FileSystem` seam (edited — needs a `homedir()` accessor on the seam so the tests above can be deterministic; see edge case under Recommendation)
- `plan_topics/h4-extension-shell.md` — `PiFileSystem` adapter (read-only, but its delegation contract test gains a `homedir()` row)

## Spec Documents

- `spec_topics/discovery.md` — hoist the `~`-expansion rule into a single top-level normative paragraph; strike the duplicated `$HOME`/`%USERPROFILE%` parentheticals from the per-section bullets and link them back (edited)
- `spec_topics/pi-integration-contract.md` — `FakeFileSystem` / `FileSystem` interface section; add `homedir(): string` to the listed members (edited)

## Affected Leaves

**Phases:** MVP, Vertical V14, Horizontal

**Leaves (implementation order):**

- H2 — Dependency-injection skeleton with fakes — (modified)
- H4 — Pi extension shell — (modified)
- M — Minimal end-to-end loom — (modified)
- V14k — Discovery: global `~/.pi/agent/looms/` — (modified)
- V14m — Discovery: package `looms/` and `pi.looms` — (modified — `~/.pi/agent/npm/` and `~/.pi/agent/git/` roots also need the rule applied)
- V14n — Discovery: settings file reads — (modified — replace the local `~ expanded` clause with a citation to the centralised rule)
- V14o — Discovery: `--loom` CLI flag — (modified — same as V14n)

## Consequence

**Severity:** correctness

Two reasonable implementers will pick different APIs (`process.env.HOME`, `process.env.USERPROFILE`, manual concatenation, `os.homedir()`) for the unqualified `~` sites and produce builds that scan different global discovery roots on Windows and inside CI containers where the env vars and the OS-reported home directory disagree. The divergence is silent — every leaf gate from M through V14o passes against fakes that hard-code a home directory string — and only surfaces when a real user reports "my global looms don't load on Windows."

## Solution Space

**Shape:** single

### Recommendation

**Spec edit (primary).** In `spec_topics/discovery.md`, immediately after the "Discovery roots." subsection (around line 19, before "Source priority (high to low)."), insert a normative paragraph:

> **Home-directory expansion.** Wherever the loom extension reads, interprets, or emits a path beginning with `~/`, the leading `~` MUST be expanded via the `homedir()` member of the injected `FileSystem` seam (see [Pi Integration Contract — `FakeFileSystem` / `FileSystem` interface](./pi-integration-contract.md)), whose production implementation calls Node's `os.homedir()` (resolving to `$HOME` on POSIX and `%USERPROFILE%` on Windows). This rule applies uniformly to: the global discovery root `~/.pi/agent/looms/`; the global package roots `~/.pi/agent/npm/` and `~/.pi/agent/git/<host>/<path>/`; the global settings file `~/.pi/agent/settings.json`; every `~`-prefixed entry in the settings `looms` array; and every `~`-prefixed component of the `--loom` CLI flag (after splitting on `path.delimiter`). The `~user` form (tilde followed by a username) is **not** honoured — only the bare `~` followed by `/` (or end-of-string). Implementations MUST NOT read `process.env.HOME` or `process.env.USERPROFILE` directly, and MUST NOT use any platform-conditional branch — the seam is the single source of truth so that test fakes can override it.

Then strike the parenthetical "the leading `~` is expanded against the same home directory Pi uses — `$HOME` on POSIX, `%USERPROFILE%` on Windows" from line 122 of `discovery.md`, and strike the parenthetical "`~` expands against the same home directory used elsewhere in this file (`$HOME` on POSIX, `%USERPROFILE%` on Windows). Absolute paths are accepted as-is." from line 151, replacing both with a back-link to the new paragraph.

**Spec edit (seam).** In `spec_topics/pi-integration-contract.md`, the section listing the `FileSystem` interface members (referenced from `discovery.md` line 124 as `[`FakeFileSystem` / `FileSystem` interface]`), add `homedir(): string` to the listed members. The production adapter `PiFileSystem` implements it via `os.homedir()`; `FakeFileSystem` implements it via a constructor-injected string the test sets explicitly.

**Plan edits.**

- `plan_topics/h2-di-skeleton.md`, `Adds.`: append `; FileSystem includes a homedir(): string accessor — never read process.env directly` to the existing seam list. Add a Tests bullet: `FakeFileSystem.homedir() returns the constructor-injected value; production PiFileSystem.homedir() delegates to os.homedir().`
- `plan_topics/h4-extension-shell.md`, Tests: append a bullet to the existing per-shim contract row — `PiFileSystem.homedir() delegates to os.homedir() (single-call test against a spy).`
- `plan_topics/m-mvp.md`, Tests, replace the bullet `` `~/.pi/agent/looms/hello.loom` registers `/hello`. `` with `` `~/.pi/agent/looms/hello.loom` registers `/hello` (FakeFileSystem.homedir() controls the resolution; the test asserts the registered loom's discovered path is exactly `<homedir>/.pi/agent/looms/hello.loom`). ``
- `plan_topics/v14-tool-calls.md`, V14k Tests: append `~ in the global root is expanded via FileSystem.homedir() (FakeFileSystem with two distinct homedir values produces two distinct discovery paths); no fallback to process.env.HOME or process.env.USERPROFILE (a grep test against src/ asserts neither identifier appears outside the PiFileSystem adapter).`
- `plan_topics/v14-tool-calls.md`, V14m Tests: append `~/.pi/agent/npm/ and ~/.pi/agent/git/ roots are expanded via FileSystem.homedir() (FakeFileSystem with a controlled homedir scans the matching fake roots).`
- `plan_topics/v14-tool-calls.md`, V14n Tests: change the `` `~` expands `` clause to `` `~` expands via FileSystem.homedir() (per the centralised rule in discovery.md) ``.
- `plan_topics/v14-tool-calls.md`, V14o Tests: append `~-prefixed --loom components expand via FileSystem.homedir() (same rule as V14n).`

Edge case the implementer must watch: H2's `FakeFileSystem` already exists in the seam list, but its surface in the plan does not enumerate methods. The `homedir()` accessor must land in H2 (not deferred to a later leaf) because M's Tests, V14k's Tests, and the no-`process.env`-fallback grep test all depend on it. If the no-static-state allow-list (already a separate finding) lands first, the new grep assertion fits naturally inside it; otherwise V14k carries it as a standalone test.

## Related Findings

- "M too large — five distinct concerns in one leaf" — same-cluster (this finding modifies one of M's bullets; whether M is split or not, the bullet's owning leaf still receives the edit)
- "H2 names ten DI seams but specifies zero method signatures" — decision-dependency (the `FileSystem.homedir()` accessor is a concrete instance of the missing-signatures problem; resolving H2 first dictates the form of the seam-edit row above)
- "V14n malformed settings JSON degrades silently; no fallback to last-known-good" — same-cluster (touches V14n's settings-resolver area but addresses an orthogonal failure mode)
- "V14n / V14o missing V14q from Deps despite citing its collision rule in Tests" — same-cluster (V14n/V14o Deps already need attention; the `~`-rule citation can be added in the same pass)
- "V14m: scoped packages (`@scope/pkg`) not covered; `node_modules/` walk unbounded" — same-cluster (V14m also touches the global `~/.pi/agent/npm/` root that this finding's edit pulls under the centralised rule)

---

## plan_topics/v1-lexer.md

---

# UTF-8 source decoding and `loom/load/invalid-encoding` have no closing leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** UTF-8 encoding, BOM consumption, and `loom/load/invalid-encoding` — no plan leaf
**Kind:** spec-coverage

## Finding

`spec_topics/lexical.md` (Encoding bullet) requires the runtime to (a) accept only UTF-8 source files, (b) consume and discard a leading UTF-8 BOM (`EF BB BF`), and (c) emit `loom/load/invalid-encoding` with the file path and the byte offset of the first invalid byte for any other BOM, any non-UTF-8 byte sequence, or a lone surrogate. `spec_topics/diagnostics.md` registers `loom/load/invalid-encoding` as a hard error in the `lex` phase and ties its hint ("Re-save the file as UTF-8...") to that same Encoding bullet.

No leaf in `plan_topics/v1-lexer.md` covers any of this. V1a–V1e begin at numerics and assume an already-decoded character stream; `grep -n 'encoding\|UTF-8\|BOM\|invalid-encoding' plan.md plan_topics/` returns no matches. The horizontal phases (H1–H4) and the MVP leaf likewise do not introduce a source-loader. `plan_topics/coverage-matrix.md` maps `[Lexical Structure]` → `V1a–V1e`, so the gap is also invisible to a section-level reader of the matrix.

The closing leaf is missing on three counts: the parser surface (a UTF-8-only decode pass with BOM-strip), the diagnostic emission (`loom/load/invalid-encoding` with file path + first-invalid-byte offset), and the span-bookkeeping invariant in `lexical.md` ("BOM consumption ... happens *before* span recording, so column 1 of line 1 starts after the BOM").

## Plan Documents

- `plan_topics/v1-lexer.md` — new leaf inserted before V1a (edited)
- `plan_topics/coverage-matrix.md` — `[Lexical Structure]` row (edited)
- `plan_topics/v18-cancellation.md` — V18o coverage-matrix gate context (read-only)
- `plan.md` — table of contents (read-only)

## Spec Documents

None — `spec_topics/lexical.md` and `spec_topics/diagnostics.md` already define the rule and the diagnostic; the gap is on the plan side.

## Affected Leaves

**Phases:** Vertical V1

**Leaves (implementation order):**

- `<new>` — UTF-8 source decoder with BOM strip — (added)
- V1a — Numeric literals — (modified; `Deps` flips from `M` to the new leaf)

## Consequence

**Severity:** correctness

A V1 implementer reading the lexer plan ships V1a–V1e against a `string` input and never wires up byte-level decoding. The runtime then either crashes inside V8's UTF-8 string decoder with a generic exception (no `loom/load/invalid-encoding`, no path, no byte offset), or — worse, on Node's default permissive `Buffer.toString('utf8')` path — silently produces replacement characters and tokenises mojibake. The diagnostic is registered in `spec_topics/diagnostics.md` but never emitted, and once REQ-IDs land per `plan_topics/conventions.md` the missing closing leaf would either fail the V18o coverage gate or be papered over with a fictional citation.

## Solution Space

**Shape:** single

### Recommendation

Add a new leaf at the top of `plan_topics/v1-lexer.md`, positioned before `## V1a — Numeric literals`. Use a placeholder ID (the implementer will pick the next free V1 letter — likely `V1a`, with the existing leaves shifting one letter down, since leaf IDs are not yet committed):

```
## V1<new> — Source decoding (UTF-8, BOM, span baseline)

- **Spec.** [Lexical Structure](../spec_topics/lexical.md) (Encoding, Diagnostic spans), [Diagnostics](../spec_topics/diagnostics.md) (`loom/load/invalid-encoding`).
- **Adds.** Byte-to-character source decoder: UTF-8 only; a leading `EF BB BF` is consumed and discarded; any other BOM, any invalid UTF-8 byte sequence, and any lone surrogate produces `loom/load/invalid-encoding` carrying the file path and the byte offset of the first invalid byte. Span bookkeeping is initialised so that column 1 of line 1 falls *after* a stripped BOM.
- **Tests.** Plain ASCII tokenises; UTF-8 sans BOM tokenises; UTF-8 with leading BOM tokenises identically to the same source without the BOM, with no leading whitespace token and column 1 of line 1 sitting on the first post-BOM byte; UTF-16 LE BOM (`FF FE`), UTF-16 BE BOM (`FE FF`), and UTF-32 BOMs all emit `loom/load/invalid-encoding` at offset 0; a lone high surrogate mid-stream emits `loom/load/invalid-encoding` at the offending byte; an isolated UTF-8 continuation byte (e.g. `0x80`) at offset N emits `loom/load/invalid-encoding` with offset N; an overlong encoding emits `loom/load/invalid-encoding`; the diagnostic carries the absolute file path the loader was asked to read.
- **Deps.** H3 (diagnostics primitive), M.
- **Ships when.** Every `.loom` and `.warp` file passes through the decoder before any V1a–V1e tokenisation runs; non-UTF-8 inputs fail fast with `loom/load/invalid-encoding` rather than producing token-stream mojibake.
```

Then in `plan_topics/v1-lexer.md`, change the `Deps.` field of `V1a — Numeric literals` from `M.` to `V1<new>.` (or whatever ID the implementer assigns) so the decoder leaf is a hard prerequisite for the first token-emitting leaf.

In `plan_topics/coverage-matrix.md`, edit the row

```
| [Lexical Structure](../spec_topics/lexical.md) | V1a–V1e |
```

to include the new leaf (e.g. `V1<new>, V1a–V1e`) so that, post-REQ-ID-assignment, the encoding rule's REQ-ID has a recorded closing leaf and the V18o coverage-matrix gate (per `plan_topics/v18-cancellation.md` V18o) does not flag a missing mapping.

The implementer should fold the sibling rule on `lexical.md` line 6 (newline normalisation: `\r\n` → `\n`, bare `\r` → `\n`) into the same leaf — it lives in the same "before lexing" pre-pass and shares the span-baseline invariant on `lexical.md` line 8 — but the wording above scopes the `Adds.` / `Tests.` bullets to encoding only; newline normalisation is the subject of the related finding cited below.

## Related Findings

- "Newline normalisation (`\r\n`, bare `\r` → `\n`) — no plan leaf" — co-resolve (same pre-lex pass; the new leaf above should also carry the CRLF/bare-CR normalisation rule and its CRLF-tokenises-byte-identically-to-LF tests, per the suggested fix in that finding)
- "Path literals forward-slash rule and `loom/parse/invalid-path-separator` — no leaf" — same-cluster (also a `lexical.md` rule with no closing leaf, but resolves inside V1b on the path-literal token, not in the pre-lex decoder pass)

---

# Newline normalisation has no plan leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** Newline normalisation (`\r\n`, bare `\r` → `\n`) — no plan leaf
**Kind:** spec-coverage

## Finding

`spec_topics/lexical.md` mandates that every `.loom` / `.warp` source has its line endings normalised before lexing — `\r\n` → `\n` and bare `\r` → `\n` — and elevates this to **observable behaviour**: "A `.loom` checked in with CRLF line endings therefore tokenises and dedents byte-identically to the same file with LF endings; this is observable behaviour, not an implementation detail." The spec ties the rule to four downstream behaviours by name: statement separation, the literal-newline-in-regular-string parse error, `` @`...` `` newline-trim and dedent, and `///` doc-comment joining. It also pins span-recording to *after* normalisation, so a CRLF source line counts as one newline when computing diagnostic line/column.

No plan leaf claims any of this. `plan_topics/v1-lexer.md` starts at numerics (V1a) and assumes a decoded, normalised stream; V1b's "literal newline in regular string is a parse error" silently presupposes the normaliser exists; V1e's continuation rules are described in terms of `\n` only; V5c's dedent vectors are LF-only. `plan_topics/coverage-matrix.md` maps `Lexical Structure` to V1a–V1e wholesale, so the V18o REQ-ID gate will pass vacuously the moment those leaves ship.

The defect is twin to the sibling finding on UTF-8 / BOM / `loom/load/invalid-encoding` — the spec wraps both rules in the same paragraph ("decoded and normalised before lexing") and the natural fix is one pre-lex pipeline leaf that owns both passes.

## Plan Documents

- `plan_topics/v1-lexer.md` — new pre-V1a leaf (edited)
- `plan_topics/v5-untyped-queries.md` — V5c Tests bullet (edited)
- `plan_topics/coverage-matrix.md` — `Lexical Structure` row (edited)
- `plan_topics/conventions.md` — cross-cutting rules (read-only)
- `plan.md` — leaf-order section header for V1 (read-only)

## Spec Documents

- `spec_topics/lexical.md` — Source files / Newline normalisation / Diagnostic spans (read-only)
- `spec_topics/query.md` — multi-line template normative vectors (read-only)
- `spec_topics/descriptions.md` — `///` doc-comment joining (read-only)

## Affected Leaves

**Phases:** Vertical V1, Vertical V5

**Leaves (implementation order):**

- `<new>` — pre-lex source-pipeline leaf (decode + normalise) — (added)
- V1a — Numeric literals — (read-only; depends on `<new>`)
- V1b — String literals and escapes — (modified; "literal newline in regular string" must reference the normalised stream)
- V1c — Line comments (`//` and `///`) — (modified; `///` joining occurs on normalised stream)
- V1e — Statement separators and newline continuation — (modified; rule operates on normalised `\n`)
- V5c — Multi-line templates: newline-trim and dedent — (modified; Tests must add CRLF/LF byte-identical assertions)

## Consequence

**Severity:** correctness

A `.loom` checked in with CRLF endings (the Windows default, and the GitHub web-editor default) will hit `loom/parse/literal-newline-in-string` on every multi-line-looking string, mis-dedent every `` @`...` `` template, and emit diagnostic spans whose line numbers double-count CRLF — none of which is caught by any planned test. Two implementers working from the current plan will diverge: one will inline the normaliser in V1's tokeniser, one will skip it entirely because no leaf names it. The V18o coverage gate will not catch the omission because the `Lexical Structure` row already maps to V1a–V1e.

## Solution Space

**Shape:** single

### Recommendation

Bundle the fix into the pre-V1a source-pipeline leaf proposed by the sibling encoding finding (`UTF-8 encoding, BOM consumption, and loom/load/invalid-encoding`); do not create a second leaf. The two rules share a single spec paragraph ("decoded and normalised before lexing"), the same pipeline stage (pre-lex), and the same span-recording invariant (column 1 of line 1 starts after BOM consumption *and* after CRLF→LF), so splitting them produces two leaves with one Deps edge and one shared invariant.

Concrete edits (replace `<new>` with the implementer's chosen ID, e.g. `V1-pre`):

1. **`plan_topics/v1-lexer.md`** — in the new `<new>` leaf added by the encoding finding, extend the bullets:

   - **Adds.** *(append to the encoding leaf's Adds bullet)* "Newline normalisation: `\r\n` → `\n` and bare `\r` → `\n`, applied after BOM consumption and before any span recording. Every downstream rule that mentions 'newline' (statement separation in V1e, `loom/parse/literal-newline-in-string` in V1b, `` @`...` `` newline-trim and dedent in V5c, `///` doc-comment joining in V1c/V13) operates on the normalised stream."
   - **Tests.** *(append)* "CRLF source tokenises byte-identically to the LF version of the same source across the V5c dedent vectors, V1c `///` joining, and V1b `loom/parse/literal-newline-in-string`; bare-CR-only source tokenises identically to LF; mixed CRLF + bare-CR + LF in one file normalises uniformly; diagnostic line/column on a CRLF source matches the LF source byte-for-byte (CRLF counts as one newline)."
   - **Ships when.** *(extend)* "...and every downstream lexer test passes against the CRLF transform of its own input fixture."

2. **`plan_topics/v5-untyped-queries.md`** — append to V5c Tests, before the trailing-whitespace clause:
   "Plus: each of the seven normative vectors above is asserted twice — once with LF inputs, once with the CRLF transform of the same input — and the rendered output is byte-identical across the pair."

3. **`plan_topics/coverage-matrix.md`** — change the `[Lexical Structure](../spec_topics/lexical.md)` row's closing leaves from `V1a–V1e` to `<new>, V1a–V1e`, and add a per-rule row:
   `| [Lexical Structure — Newline normalisation](../spec_topics/lexical.md) | <new>, V5c |`

4. **`plan_topics/v1-lexer.md` V1b / V1c / V1e** — add a one-line reference under Spec: "Operates on the post-normalisation stream produced by `<new>`."

Edge cases the implementer must watch:
- Normalisation runs **after** BOM consumption, not before — a UTF-8 BOM followed by `\r\n` is `BOM + LF` after both passes, not `\r\n` (the BOM is bytes, not a code point with a line-ending interpretation).
- A bare `\r` at end-of-file becomes `\n` and the file has one logical newline; do not also append an implicit terminator.
- The CRLF→LF transform must happen on the byte (or pre-decode) stream, not on the token stream — `\r` inside a string-literal escape (`"\r"`) is the *escape* and must survive normalisation untouched. Concretely: normalise the source before the lexer ever sees it; the escape table in V1b processes `\r` from the literal two-character sequence `\` + `r`, which is unaffected.
- V5c's "tab-only indentation is stripped" vector must be re-run with CRLF; the trailing-whitespace-before-closing-backtick rule must also be re-run with `\r\n` before the closing backtick (which normalises to `\n` and is then handled by the existing rule).

## Related Findings

- "UTF-8 encoding, BOM consumption, and `loom/load/invalid-encoding` — no plan leaf" — co-resolve (same `<new>` pre-V1a pipeline leaf owns both passes; they share the spec paragraph and the span-recording invariant)
- "Path literals forward-slash rule and `loom/parse/invalid-path-separator` — no leaf" — same-cluster (another V1 lexer spec-coverage gap, but resolves independently against V1b)
- "Closed diagnostic registry — many codes have no asserting plan leaf" — same-cluster (umbrella finding; this leaf would close `loom/load/invalid-encoding` for the sibling and is asymptotic on the registry gate)
- "`Lexical Structure` row in coverage matrix" — n/a; the matrix row edit listed above is part of this fix, not a separate finding

---

# Path literals forward-slash rule and `loom/parse/invalid-path-separator` — no asserting leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** Path literals forward-slash rule and `loom/parse/invalid-path-separator` — no leaf
**Kind:** spec-coverage, validation

## Finding

`spec_topics/lexical.md` (the "Path literals" bullet under **Source files**) and the closed diagnostics registry in `spec_topics/diagnostics.md` jointly mandate that every path literal in source — `import "..."` (V17c), `invoke("...", ...)` (V15a), and `.loom` entries inside `tools:` (V15e) — must use forward-slash separators only. A backslash inside any such literal is the parse error `loom/parse/invalid-path-separator`. Ordinary string literals (non-path positions) keep the standard escape table, so `"\\"` remains a single backslash and is *not* affected.

A grep over `plan.md` and every file under `plan_topics/` for `invalid-path-separator`, `forward-slash`, `path literal`, and `backslash` returns zero matches. None of the three path-bearing-position leaves (V15a, V15e, V17c) `Adds` the rule or `Tests` it; the `coverage-matrix.md` row for the diagnostic is also missing. The code therefore appears in the closed registry but cannot be asserted by any leaf, and the V18o coverage gate (which counts only REQ-IDs) does not catch it.

The originally suggested home — V1b — is the wrong layer: the lexer cannot distinguish path-bearing string literals from ordinary strings, and applying the rule to all string literals would incorrectly reject `"\\"` everywhere. The rule fires at the parse position that consumes the literal, which is V15a / V15e / V17c.

## Plan Documents

- `plan_topics/v15-invoke.md` — V15a (`invoke("./path.loom", ...)` parsing) (edited)
- `plan_topics/v15-invoke.md` — V15e (`.loom` paths in `tools:`) (edited)
- `plan_topics/v17-warp.md` — V17c (`import { X } from "./y.warp"`) (edited)
- `plan_topics/v1-lexer.md` — V1b (string literals and escapes) (read-only — confirms the rule does *not* belong at the lexer layer)
- `plan_topics/coverage-matrix.md` — diagnostics rollup (edited — add a row mapping the code to its closing leaves)
- `plan_topics/v14-tool-calls.md` — V14a/V14b (read-only — these handle Pi tool short-names, not paths; no edit)
- `plan_topics/v18-cancellation.md` — V18o coverage gate (read-only — establishes that REQ-only counting cannot fire on this code)

## Spec Documents

- `spec_topics/lexical.md` — "Source files / Path literals" bullet (read-only)
- `spec_topics/diagnostics.md` — registry row for `loom/parse/invalid-path-separator` (read-only)
- `spec_topics/imports.md`, `spec_topics/invocation.md`, `spec_topics/frontmatter.md` — read-only cross-references already named by the lexical bullet

## Affected Leaves

**Phases:** Vertical V15, Vertical V17

**Leaves (implementation order):**

- V15a — `invoke("./path.loom", ...)` parsing and resolution — (modified)
- V15e — `.loom` paths in `tools:` (default basename naming) — (modified)
- V17c — `import { X } from "./y.warp"` — (modified)

## Consequence

**Severity:** correctness

A normative parse error in the closed registry has no closing leaf, so two reasonable implementers will diverge: one will ship V15a/V15e/V17c that silently accept `"./foo\\bar.loom"` (degrading to OS-dependent resolution behaviour and breaking the spec's "tokenises byte-identically across hosts" guarantee for path literals), the other will add the check ad hoc with an inconsistent error code or message. The V18o coverage gate, which counts REQ-IDs only, will not catch the omission, so the bug ships into V18 closure unobserved.

## Solution Space

**Shape:** single

### Recommendation

Add the rule to each path-bearing-position leaf (not to V1b — see Finding). Concretely:

**`plan_topics/v15-invoke.md`, V15a — `invoke("./path.loom", ...)` parsing and resolution:**

- Append to `Adds.`: `A backslash anywhere inside the path literal is rejected with loom/parse/invalid-path-separator before resolution; the literal must use forward-slash separators only.`
- Append to `Tests.`: `invoke("./a\\b.loom", ...) and invoke(".\\a/b.loom", ...) each emit loom/parse/invalid-path-separator pointing at the offending byte; invoke("./a/b.loom", ...) (forward-slash only) parses; the diagnostic fires before path resolution and before the .loom-extension check, so a malformed path with a wrong extension surfaces this code, not loom/parse/invoke-non-loom-extension.`

**`plan_topics/v15-invoke.md`, V15e — `.loom` paths in `tools:`:**

- Append to `Adds.`: `Backslash inside the .loom entry's path string is rejected with loom/parse/invalid-path-separator before resolution and before basename derivation.`
- Append to `Tests.`: `tools: ["./a\\b.loom"] and the YAML list form ["./a\\b.loom" as foo] each emit loom/parse/invalid-path-separator at the offending byte and the entry does not register; ./a/b.loom registers normally.`

**`plan_topics/v17-warp.md`, V17c — `import { X } from "./y.warp"`:**

- Append to `Adds.`: `Backslash inside the import path literal is rejected with loom/parse/invalid-path-separator before .warp-extension and resolution checks.`
- Append to `Tests.`: `import { X } from "./a\\y.warp" and import { X } from ".\\y.warp" each emit loom/parse/invalid-path-separator; ./a/y.warp resolves normally; ordinary string literals elsewhere in the file (e.g. let s = "a\\b") still parse — the diagnostic is scoped to the import path position.`

**`plan_topics/coverage-matrix.md`:** add a row mapping `loom/parse/invalid-path-separator` to its closing leaves (V15a, V15e, V17c) so the V18o gate can observe assertion coverage for this code.

Edge cases the implementer must watch:

- The diagnostic is `loom/parse/...`, not `loom/lex/...` — it fires at the parser of the path-bearing position, after the lexer has produced the string token. The lexer must keep its current behaviour of decoding `\\` to a single backslash; the parser inspects the *decoded* string and rejects any `\\` (i.e. any single backslash byte in the value).
- The carve-out about `--loom <path>` and discovery roots (named in the spec's Path literals bullet) does *not* apply here — those are OS-native paths handled outside the lexer and outside any of these three leaves.

## Related Findings

- "Closed diagnostic registry — many codes have no asserting plan leaf" — co-resolve (that finding lists `loom/parse/invalid-path-separator` explicitly among the unasserted codes; this finding closes one entry from its enumeration)
- "UTF-8 encoding, BOM consumption, and `loom/load/invalid-encoding` — no plan leaf" — same-cluster (sibling lexical-spec coverage gap from the same `lexical.md` "Source files" preamble)
- "Newline normalisation (`\r\n`, bare `\r` → `\n`) — no plan leaf" — same-cluster (third sibling from the same preamble; resolves independently)
- "`loom/parse/integer-narrowing` — no plan leaf" — same-cluster (another closed-registry parse code with no asserting leaf; resolves independently in V2c)
- "`loom/load/invoke-path-escape` — security boundary with single check site and no telemetry" — same-cluster (touches V15a/V15e path handling but a distinct concern — escape vs. separator)

---

# V1d "spec's exact-wording errors" leaves the canonical strings unquoted

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** "Spec's exact-wording errors" without inline quote
**Kind:** clarity

## Finding

`plan_topics/v1-lexer.md` V1d Tests bullet says: "mismatch produces the spec's exact-wording errors." The bullet does not name which diagnostic codes are in scope, does not quote the messages, and does not pin a spec line range. To turn that into a passing test the implementer must open `spec_topics/lexical.md`, find the identifier-rule paragraph, and decide which sentence is the canonical message — a guess each implementer will resolve slightly differently.

The canonical strings exist and live in exactly one place: `spec_topics/lexical.md` parenthesises them next to the diagnostic codes — `loom/parse/schema-case-mismatch` is "schema name must start with an uppercase letter" and `loom/parse/binding-case-mismatch` is "binding name must start with a lowercase letter or `_`". `spec_topics/diagnostics.md` rows 74–75 carry the codes only, not the rendered messages, so a reader who follows the registry instead of the lexical chapter sees no message text at all.

V1d Tests also bundles two further assertions ("every reserved keyword in identifier position is rejected"; `_` cannot be re-used as a regular identifier) whose canonical code is `loom/parse/reserved-keyword-as-identifier`, which the bullet likewise leaves unnamed.

## Plan Documents

- `plan_topics/v1-lexer.md` — V1d Tests bullet (edited)

## Spec Documents

- `spec_topics/lexical.md` — Identifiers / Reserved keywords paragraph (read-only)
- `spec_topics/diagnostics.md` — rows 74–76 (read-only)

## Affected Leaves

**Phases:** Vertical V1

**Leaves (implementation order):**

- V1d — Identifier case rule and reserved keywords — (modified)

## Consequence

**Severity:** correctness

The Tests bullet asserts a verbatim string but does not say which string. Two reasonable implementers will pin different texts (e.g. "schema names must start with an uppercase letter" vs. the spec's "schema name must start with an uppercase letter"), and one will silently lock in wrong wording behind a green test. The diagnostic codes are also unnamed, so a third implementer might assert only the message and ignore the `loom/parse/...` code entirely.

## Solution Space

**Shape:** single

### Recommendation

Rewrite the V1d **Tests.** bullet in `plan_topics/v1-lexer.md` to name each diagnostic code and quote the message verbatim from `spec_topics/lexical.md`. Replace the existing sentence "mismatch produces the spec's exact-wording errors; every reserved keyword in identifier position is rejected; `_` cannot be used as a regular identifier after binding." with:

> mismatch in schema-name position emits `loom/parse/schema-case-mismatch` with message `"schema name must start with an uppercase letter"`; mismatch in binding / parameter / fn-name / field-name position emits `loom/parse/binding-case-mismatch` with message `` "binding name must start with a lowercase letter or `_`" ``; every reserved keyword listed in [`spec_topics/lexical.md` — Reserved keywords](../spec_topics/lexical.md) used in identifier position emits `loom/parse/reserved-keyword-as-identifier`; `_` cannot be referenced as a regular identifier after binding.

Source-of-truth note for the implementer: the message strings are the parenthesised quotes in `spec_topics/lexical.md`'s "Violating either rule is a parse error: …" sentence; if the spec text is later edited, the V1d test fixture must follow.

## Related Findings

- "Plan tests cite \"spec's exact wording\" / \"verbatim\" without verifying spec owns each message string" — decision-dependency (the broader finding warns that for most diagnostics the spec does not own a canonical message string; V1d is one of the few cases where it does, so this finding can be closed independently by quoting the existing strings, but the broader audit may later prefer a single normative table both leaves cite).

---

## plan_topics/v2-expressions.md

---

# `loom/parse/integer-narrowing` has no asserting plan leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** `loom/parse/integer-narrowing` — no plan leaf
**Kind:** spec-coverage, validation

## Finding

The diagnostics registry in `spec_topics/diagnostics.md` (row 79) defines `loom/parse/integer-narrowing` as the type-error code for "`number` value used where `integer` is expected", anchored to the lexical rule that `integer` widens implicitly to `number` but the reverse must be diagnosed. The registry is closed and normative, so every code in it must be asserted by some plan leaf's Tests bullet for the V18o coverage gate to be meaningful.

A grep over `plan_topics/` for `integer-narrowing` returns zero hits. V1a tags the `integer` vs `number` token type from literal shape but performs no compatibility check. V2c covers arithmetic operators where the widening direction is *silent* (no diagnostic fires there). V2h mentions sink-driven `integer`-widens-to-`number` for array literals but no narrowing test. V4 (schema fields), V9 (function parameters), and V2a (typed `let` annotations) — the three slots where `: integer` annotations create a position that can reject a `number` source — say nothing about this code.

The diagnostic therefore has no asserting leaf. Whichever leaf first introduces the assignment-compatibility check will silently inherit responsibility for emitting it, but no Tests bullet pins the code string, the diagnostic message, or the widen-vs-narrow asymmetry. An implementer who omits the check will not fail any leaf gate; the omission only surfaces if the closed-registry CI gate proposed under a sibling finding is actually wired.

## Plan Documents

- `plan_topics/v2-expressions.md` — V2a (edited), V2c (read-only)
- `plan_topics/v9-functions.md` — V9a (option-dependent)
- `plan_topics/v4-schemas.md` — V4b (option-dependent)
- `plan_topics/v1-lexer.md` — V1a (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical V2, Vertical V4, Vertical V9

**Leaves (implementation order):**

- V2a — `let` immutable bindings — (modified)
- V4b — Object schema declaration and lowering — (option-dependent)
- V9a — Top-level `fn` declaration — (option-dependent)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on whether `let x: integer = some_number_expr` is a parse error, a runtime panic, or silently lowers. Without a Tests bullet pinning the exact code string and the widen-vs-narrow asymmetry, the diagnostic can ship unimplemented while every leaf gate passes — and the V18o REQ-ID gate does not catch it because diagnostic codes are tracked through the diagnostics-spec registry, not through REQ-IDs.

## Solution Space

**Shape:** single

### Recommendation

Distribute the assertion across all three sites that can hold an `: integer` annotation: V2a (binding), V4b (object schema field), V9a (function parameter). Each bullet asserts the same diagnostic code in its local context, with the asymmetry (widen silently / narrow rejected) documented at each site. With D11 settled (the type-compatibility relation is now defined in `type-system.md`), each test cleanly cites the relation as the source of the asymmetry.

**Plan edits.**

- `plan_topics/v2-expressions.md` § V2a — append to the **Tests** bullet:
  `let x: integer = <number-expr>` emits `loom/parse/integer-narrowing`; `let y: number = <integer-expr>` widens silently.
- `plan_topics/v4-schemas.md` § V4b — append to the **Tests** bullet:
  Constructing an object whose `: integer` field receives a `number`-typed expression emits `loom/parse/integer-narrowing`; `: number` field accepting an `integer`-typed expression widens silently.
- `plan_topics/v9-functions.md` § V9a — append to the **Tests** bullet:
  Calling `fn f(p: integer)` with a `number`-typed argument emits `loom/parse/integer-narrowing`; `fn f(p: number)` accepting an `integer`-typed argument widens silently.

**Spec edits.** None.

Use the literal code string `loom/parse/integer-narrowing` in all three Tests. The asymmetry assertion (`integer → number` widens silently) is required at each site so each test set documents both directions, not just the rejected one. Three bullets must stay in sync if the diagnostic message ever changes — cosmetic only.

## Related Findings

- "Closed diagnostic registry — many codes have no asserting plan leaf" — co-resolve (this is one of the unasserted codes that umbrella finding enumerates; resolving Option B closes the V2a/V4b/V9a slice of that gap)
- "Path literals forward-slash rule and `loom/parse/invalid-path-separator` — no leaf" — same-cluster (sibling unasserted-code finding, resolved independently at a different leaf)
- "UTF-8 encoding, BOM consumption, and `loom/load/invalid-encoding` — no plan leaf" — same-cluster (sibling unasserted-code finding)
- "Newline normalisation (`\r\n`, bare `\r` → `\n`) — no plan leaf" — same-cluster (sibling unasserted-code finding)
- "`loom/load/missing-mode` and `loom/load/unknown-mode-value` — no asserting leaf" — same-cluster (sibling unasserted-code finding)
- "Empty schema and enum body diagnostics — no test leaf" — same-cluster (sibling unasserted-code finding)
- "Type-alias cycle detection (`loom/parse/type-alias-cycle`) — no plan leaf" — same-cluster (sibling unasserted-code finding)
- "`loom/parse/non-string-discriminator` — no test leaf" — same-cluster (sibling unasserted-code finding)

---

# V2d cites wrong panic-routing leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** V2d cites wrong panic-routing leaf
**Kind:** spec-clarity

## Finding

V2d's Tests bullet in `plan_topics/v2-expressions.md` reads "index access on arrays; OOB returns runtime panic (V18o-routed); null member access panics." The cite is wrong on two counts. V18o is the per-call-timeout marker and coverage-matrix CI gate (`plan_topics/v18-cancellation.md` lines 115+); it has nothing to do with panic routing. The OOB panic *source* is V18k ("Runtime panic: array index out of bounds", lines 83+), and panic *routing* lives in V18m (slash-command surface, lines 99+) and V18n (`invoke` parent surface, lines 107+). For symmetry, "null member access panics" similarly maps to source V18l ("Runtime panic: indexed access on `null` / missing key", lines 91+).

An implementer following the V2d cite lands on a CI-gate leaf that does not describe panic semantics at all, then has to hunt the V18 file to discover the actual source/routing split.

## Plan Documents

- `plan_topics/v2-expressions.md` — V2d Tests bullet (edited)
- `plan_topics/v18-cancellation.md` — V18k, V18l, V18m, V18n, V18o sections (read-only)

## Spec Documents

None.

## Affected Leaves

**Phases:** Vertical V2

**Leaves (implementation order):**

- V2d — Member access and indexed access — (modified)

## Consequence

**Severity:** advisory

The wrong cite costs an implementer one extra hop to the V18 file but does not change what V2d must test (a panic on OOB / on null member access). No test would silently pass under the wrong code, since V2d does not assert routing semantics directly — those are V18m/V18n's job. Risk is reader friction and the chance an implementer inlines the wrong routing assumption into V2d's test scaffolding.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/v2-expressions.md`, in V2d's `**Tests.**` bullet, replace

> index access on arrays; OOB returns runtime panic (V18o-routed); null member access panics.

with

> index access on arrays; OOB returns runtime panic (source V18k; routing V18m on slash surface, V18n on `invoke` surface); null member access panics (source V18l; same routing).

No other field in V2d changes. V18k/V18l/V18m/V18n/V18o themselves are not edited.

## Related Findings

- "V18m / V18o: panic routing has no debug/verbose surface" — same-cluster (concerns the same routing leaves but addresses observability, not cross-references)
- "V18o bundles per-call timeout marker with coverage-matrix CI gate" — same-cluster (clarifying V18o's actual scope reinforces why citing it for panic routing is wrong; resolves independently)

---

# V2c division-by-zero Tests bullet collapses three IEEE-754 outcomes into one

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** V2c division-by-zero description incomplete
**Kind:** clarity

## Finding

V2c's Tests bullet says `division-by-zero produces \`Infinity\` per JS`. That is one of three outcomes. Per IEEE-754 (and `spec_topics/expressions.md:150` — *"Division by zero produces IEEE-754 `Infinity` / `-Infinity` / `NaN` per JS semantics; it does not panic."*), `x / 0` produces `Infinity` when `x` is positive, `-Infinity` when `x` is negative, and `NaN` when `x` is zero. The leaf's single-result phrasing makes a conformant implementation that returns `Infinity` uniformly look correct against the leaf gate while diverging from the spec on the negative-numerator and zero-numerator cases.

A V2c implementer reading only the leaf will write a single positive-case test, miss the sign and zero-zero cases, and ship a checker/runtime whose division semantics partially contradict the spec. The fix is to expand the bullet so it enumerates the three outcomes the spec already pins down.

## Plan Documents

- `plan_topics/v2-expressions.md` — V2c Tests bullet (edited)

## Spec Documents

- `spec_topics/expressions.md` — "Other arithmetic" section, line 150 (read-only)

## Affected Leaves

**Phases:** Vertical V2

**Leaves (implementation order):**

- V2c — Arithmetic, comparison, logical, ternary, parens — (modified)

## Consequence

**Severity:** correctness

Two reasonable V2c implementers will diverge: one returns `Infinity` for all `x / 0` (matches the leaf, fails the spec on `-1/0` and `0/0`), the other returns the full IEEE-754 trio (matches the spec). The leaf gate as written passes both. Downstream V2e (`==` on `NaN`) and any V2 expression test that exercises a negative dividend will then drift between forks.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/v2-expressions.md`, V2c **Tests.** bullet, replace the clause `division-by-zero produces \`Infinity\` per JS` with:

`division by zero follows the spec's IEEE-754 rule: positive numerator over zero produces \`Infinity\`, negative numerator over zero produces \`-Infinity\`, zero numerator over zero produces \`NaN\`; none of these panic`

Implementer notes:
- The asserting tests must cover all three numerator signs against a zero divisor; a single positive-case assertion is insufficient.
- `NaN` reflexivity (`NaN == NaN` is true under V2e's `Object.is` rule) is V2e's concern, not V2c's — V2c only needs to assert the *value* produced by the division, not equality semantics on it.
- Signed-zero divisor behaviour (`1 / -0` → `-Infinity`) is not pinned by the spec line; leave it out of the leaf to avoid over-specifying.

## Related Findings

- "V2c \"ternary type-checks both arms\" — missing assertion" — same-cluster (touches the same V2c Tests bullet but resolves independently; both fixes can land in one edit)
- "`loom/parse/integer-narrowing` — no plan leaf" — same-cluster (also proposes a V2c Tests addition; co-located but logically independent)

---

# V2c Tests bullet "ternary type-checks both arms" is not an assertion

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** V2c "ternary type-checks both arms" — missing assertion
**Kind:** clarity

## Finding

The final clause of V2c's `Tests.` bullet — "ternary type-checks both arms" — describes a checker activity, not an observable test condition. An implementer cannot tell whether the test must (a) confirm that both arms are visited by the type-check pass, (b) assert that arms of incompatible types raise a diagnostic, or (c) assert that two equal-typed arms produce that type as the ternary's result type. Each reading yields a materially different test.

The spec is unambiguous on the underlying rule: `expressions.md` §"Array construction" states that the *common-type rules for array literals* apply identically to *ternary branches*, which means the existing array diagnostics — `loom/parse/array-element-type-mismatch` (when a sink is in scope) and `loom/parse/array-no-common-type` (otherwise) — fire on incompatible arms. There is no ternary-specific diagnostic in `diagnostics.md`. The leaf must name those exact codes and assert the result-type lub, not gesture at a generic "type-check".

## Plan Documents

- `plan_topics/v2-expressions.md` — V2c Tests bullet (edited)

## Spec Documents

- `spec_topics/expressions.md` — Array construction / common-type rules (read-only)
- `spec_topics/diagnostics.md` — `loom/parse/array-element-type-mismatch`, `loom/parse/array-no-common-type` (read-only)

## Affected Leaves

**Phases:** Vertical V2

**Leaves (implementation order):**

- V2c — Arithmetic, comparison, logical, ternary, parens — (modified)

## Consequence

**Severity:** correctness

Two implementers reading "ternary type-checks both arms" will produce materially different test suites — one may write a no-op visit assertion, another may test only diagnostic emission, a third may test result-type inference. None of those alone covers the spec's actual claim, and the leaf will ship with one third of the rule asserted while the V18o coverage gate sees a check-mark.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/v2-expressions.md`, V2c, replace the trailing clause of the `Tests.` bullet (currently `; ternary type-checks both arms.`) with three explicit assertions:

> `; ternary with arms of incompatible types and no surrounding sink emits \`loom/parse/array-no-common-type\` naming both arm types; ternary with incompatible arms inside a sink (e.g. \`let x: T = c ? a : b\`) emits \`loom/parse/array-element-type-mismatch\` against the sink's type; ternary with two equal-type arms (or arms unifiable by the integer-widens-to-number rule) yields the common type as the ternary's result type, with no diagnostic.`

Edge cases the implementer must cover when writing these tests:

- The sink-vs-no-sink split mirrors the array-literal rule precisely; reuse the V2h test fixtures rather than inventing parallel ones.
- `integer`/`number` widening is part of the common-type rule (rule 2 in `expressions.md`); a ternary `cond ? 1 : 1.5` must produce `number`, not diagnose.
- `null` plus a non-`null` arm unions to `T | null` per rule 2; assert this rather than treating it as a mismatch.
- Two distinct named-schema arms with no union sink in scope must emit `loom/parse/array-no-common-type` per rule 3, identical to the array case.

## Related Findings

- "V2c division-by-zero description incomplete" — co-resolve (same Tests bullet of the same leaf; both clauses are rewritten in one edit pass)
- "`loom/parse/integer-narrowing` — no plan leaf" — same-cluster (extends the same V2c Tests bullet but with an independent assertion)

---

## plan_topics/v3-frontmatter.md

---

# `loom/load/missing-mode` and `loom/load/unknown-mode-value` have no asserting leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** `` `loom/load/missing-mode` and `loom/load/unknown-mode-value` — no asserting leaf ``
**Kind:** spec-coverage, validation

## Finding

The frontmatter contract in `spec_topics/frontmatter.md` makes `mode:` the only required field and pins two distinct normative load-time codes around it: `loom/load/missing-mode` (frontmatter omits `mode:`) and `loom/load/unknown-mode-value` (`mode:` present but the value is neither `prompt` nor `subagent`, e.g. `mode: agent`). The spec is explicit that the two cases must not collapse into a single code because the authoring intent differs. Both codes are listed `E` (error) in the closed registry in `spec_topics/diagnostics.md`, and in both cases the loom is not registered.

V3a (`plan_topics/v3-frontmatter.md`) is the leaf that owns frontmatter parsing and is the natural home for these assertions. Its Tests bullet covers the `mode: subagent` "not implemented yet" deferral, the `params: null` rejection, the `argument-hint` advisory, and the `unknown-frontmatter-field` warning shape — but it never names `loom/load/missing-mode` or `loom/load/unknown-mode-value`. M (`plan_topics/m-mvp.md`) hardcodes `mode: prompt` in its single test loom and has no negative-mode tests either. A grep across `plan.md` and `plan_topics/` finds zero mentions of either code.

The result is two normative `E`-severity registry entries with no plan-side gate. An implementer who omits the missing-mode check, omits the bad-value check, or emits a different code (e.g. reusing `unknown-frontmatter-field` for a bad `mode:` value) ships a green V3a.

## Plan Documents

- `plan_topics/v3-frontmatter.md` — V3a Tests bullet (edited)
- `plan_topics/coverage-matrix.md` — `Parameters and Frontmatter — *` rows (read-only; mode coverage is implicit in the V3a row and the row text need not change)
- `plan_topics/m-mvp.md` — Adds (read-only; MVP intentionally hardcodes `mode: prompt` and is not the right home)

## Spec Documents

None — both codes are already specified verbatim in `spec_topics/frontmatter.md` (Field contract row for `mode`) and `spec_topics/diagnostics.md` (registry rows). The fix is purely a plan-side test addition.

## Affected Leaves

**Phases:** Vertical V3

**Leaves (implementation order):**

- V3a — Frontmatter parsing — (modified)

## Consequence

**Severity:** correctness

Two distinct normative `E`-severity codes from the closed diagnostics registry have no asserting test in any leaf. A V3a implementer who silently substitutes `loom/load/unknown-frontmatter-field`, collapses missing and bad-value into one code, or simply omits the check, will pass V3a's gate while shipping a non-conforming loader. The V18o REQ-ID coverage gate does not catch this — it covers REQ-ID mappings, not registry-code presence in test bodies.

## Solution Space

**Shape:** single

### Recommendation

Append two clauses to the V3a `Tests.` bullet in `plan_topics/v3-frontmatter.md`. Insert immediately after the existing `params: null` clause and before the `argument-hint:` clause, so the new tests sit with the other load-time rejection cases:

> frontmatter omitting `mode:` → `loom/load/missing-mode` (error) and the loom is not registered; `mode: agent` (or any value other than `prompt` / `subagent`) → `loom/load/unknown-mode-value` (error) and the loom is not registered;

Edge cases the implementer must hold the line on:
- The two cases must emit distinct codes — the spec's Field-contract row for `mode` calls this out explicitly. A test that accepts either code is wrong.
- "The loom is not registered" is part of the assertion — both codes are `E` (error) per `spec_topics/diagnostics.md`, so the slash command must not appear in Pi's command list afterwards.
- `mode: subagent` already has its own test clause (the V12a deferral parse error) and stays unchanged; do not let the new `unknown-mode-value` clause swallow it.
- The diagnostic message text comes from the spec's registry; tests should pin the code string (`loom/load/missing-mode`, `loom/load/unknown-mode-value`) rather than the prose, which the spec does not pin verbatim.

## Related Findings

- "Closed diagnostic registry — many codes have no asserting plan leaf" — same-cluster (the structural CI gate that finding proposes would catch this gap, but the V3a Tests-bullet fix here resolves the specific instance independently and should land regardless).

---

# V3a frontmatter "deferred" vs "unknown" partition is unspecified

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** "Loom-specific fields" vs "unknown fields" boundary undefined
**Kind:** clarity

## Finding

V3a's Adds bullet describes two distinct warning paths for non-implemented frontmatter fields — "Unknown fields produce `loom/load/unknown-frontmatter-field` warning" and "Loom-specific fields other than `mode` and `description`/`argument-hint`/`params` are recognised but ignored with a 'not yet implemented in this leaf' warning until their implementing leaf lands" — but never enumerates which field names fall into the second bucket, never names the diagnostic code for that second warning, and never fixes its message text. The spec, by contrast, is fully resolved on all three points: `spec_topics/frontmatter.md` lists the V1 vocabulary (`description`, `argument-hint`, `mode`, `model`, `tools`, `system`, `bind_model`, `bind_context`, `bind_echo`, `coercion`, `tool_loop`, `params`), and `spec_topics/diagnostics.md` rows 154–155 register `loom/load/unknown-frontmatter-field` (W) for fields outside the V1 vocabulary and `loom/load/deferred-frontmatter-field` (W) for V1-vocabulary fields whose implementing leaf has not yet shipped.

V3a's "recognised fields" line itself is also incomplete: it omits `tool_loop`, which the spec field-contract table includes and which V13f/V6k actually implement. Under the current V3a wording an implementer reading only the plan would emit `loom/load/unknown-frontmatter-field` for `tool_loop:`, contradicting the spec.

A third, adjacent rule is missing entirely from V3a: certain reserved field names are parse-time errors rather than load-time deferred warnings. `timeout:` at frontmatter scope is `loom/parse/timeout-field-rejected` (severity error) per `spec_topics/cancellation.md` and `spec_topics/diagnostics.md` row 138. Without a third bucket called out in V3a, an implementer will route `timeout:` through `unknown-frontmatter-field` (a warning) and the loom will register, contradicting the spec.

## Plan Documents

- `plan_topics/v3-frontmatter.md` — V3a Adds and Tests bullets (edited)
- `plan_topics/v18-cancellation.md` — V18o (option-dependent — see related finding on the timeout-rejection test home)
- `plan_topics/coverage-matrix.md` — frontmatter row (read-only — verify `loom/load/deferred-frontmatter-field` is closed by V3a after the edit)

## Spec Documents

- `spec_topics/frontmatter.md` — Field contract table (read-only)
- `spec_topics/diagnostics.md` — rows for `loom/load/unknown-frontmatter-field`, `loom/load/deferred-frontmatter-field`, `loom/parse/timeout-field-rejected` (read-only)
- `spec_topics/cancellation.md` — `timeout:` rejection rule (read-only)

## Affected Leaves

**Phases:** Vertical V3, Vertical V18

**Leaves (implementation order):**

- V3a — Frontmatter parsing — (modified)
- V18o — coverage-matrix CI gate / per-call timeout marker — (option-dependent; see related finding "V18o wrong diagnostic code for `timeout:` field rejection")

## Consequence

**Severity:** correctness

Two reasonable implementers reading V3a will diverge on (a) whether `tool_loop:` warns as unknown or as deferred, (b) the exact diagnostic code emitted for `model`/`tools`/`system`/`bind_model`/`bind_context`/`bind_echo`/`coercion`, (c) the message string, and (d) whether `timeout:` warns or errors. The spec answers all four questions; V3a hides them. V3a will then ship green against any of the implementations, and the V18o coverage gate will pass vacuously on `loom/load/deferred-frontmatter-field` because no leaf asserts it.

## Solution Space

**Shape:** single

### Recommendation

Edit `plan_topics/v3-frontmatter.md`, leaf **V3a — Frontmatter parsing**, as follows.

**Adds bullet** — replace the recognised-fields list and the two warning sentences with:

> Real YAML frontmatter; the V1 vocabulary is `description`, `argument-hint`, `mode`, `model`, `tools`, `system`, `bind_model`, `bind_context`, `bind_echo`, `coercion`, `tool_loop`, `params` (the normative list in [Frontmatter — Field contract](../spec_topics/frontmatter.md)). V3a fully implements `description`, `argument-hint`, `mode`, and `params`. The remaining V1-vocabulary fields — `model`, `tools`, `system`, `bind_model`, `bind_context`, `bind_echo`, `coercion`, `tool_loop` — are recognised but not yet implemented in this leaf and emit `loom/load/deferred-frontmatter-field` (severity warning) with message `"frontmatter field '<name>' is recognised but not yet implemented in this loom version"`; the loom still registers. Fields outside the V1 vocabulary emit `loom/load/unknown-frontmatter-field` (severity warning); the loom still registers. The reserved field `timeout:` at frontmatter scope is `loom/parse/timeout-field-rejected` (severity error) per [Cancellation](../spec_topics/cancellation.md); the loom does not register. Absent `params:` and `params: {}` are equivalent and mean "no-params loom"; `params: null` is `loom/load/params-null`. `argument-hint` is parsed and stored on the AST for binder-grounding consumption (V16f); declaring `argument-hint:` without `description:` emits the advisory `loom/load/argument-hint-not-displayed`.

**Tests bullet** — append three assertions to the existing list:

> each of `model`, `tools`, `system`, `bind_model`, `bind_context`, `bind_echo`, `coercion`, `tool_loop` declared in isolation produces exactly one `loom/load/deferred-frontmatter-field` warning naming that field and the loom still registers; an unknown field name (e.g. `wibble:`) produces exactly one `loom/load/unknown-frontmatter-field` warning and the loom still registers; `timeout:` at frontmatter scope produces `loom/parse/timeout-field-rejected` (error) and the loom does not register; warning messages match the spec template verbatim.

Implementer edge cases:

- The deferred-set enumeration must be kept in lockstep with the spec field-contract table — when a later leaf (V12a, V14e, V16e, V6k, V13f) implements one of these fields, the implementing leaf removes that name from the deferred branch and routes it to its real handler. Note this lifecycle inline in V3a Adds so the maintenance contract is visible.
- `mode:` is *not* in the deferred set — it is required and has its own diagnostic codes (`loom/load/missing-mode`, `loom/load/unknown-mode-value`); see related finding.
- `timeout:` rejection at the other three scopes (per-query, per-tool-call, per-invoke) is owned by separate leaves; V3a only owns the frontmatter-scope test.

## Related Findings

- "`loom/load/missing-mode` and `loom/load/unknown-mode-value` — no asserting leaf" — same-cluster (both extend V3a Tests with frontmatter-validation diagnostics; resolve in one V3a edit pass)
- "V18o wrong diagnostic code for `timeout:` field rejection" — co-resolve (the V18o suggested fix proposes folding the `timeout:` frontmatter-scope test into V3a; this recommendation accommodates that by including the `timeout:` test in V3a Tests)
- "V18o bundles per-call timeout marker with coverage-matrix CI gate" — decision-dependency (whether V3a or a split V18o owns the frontmatter `timeout:` test depends on the V18o split decision)
- "M's collision warning lacks code/severity" — same-cluster (same pattern: a leaf names a "warning" without naming its diagnostic code or message template)

---

# M's cross-source collision warning omits diagnostic code, severity, and message template

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** M's collision warning lacks code/severity
**Kind:** clarity

## Finding

M's last Tests bullet says only "Two files producing the same slash name across the two roots: only the project one registers; warning names both paths." It names neither a diagnostic code nor a severity, and does not pin the message template. The spec already fixes all three (`loom/load/cross-source-shadow`, severity `W`, with the source-priority paragraph in `spec_topics/discovery.md` and the registry row in `spec_topics/diagnostics.md`), and a later leaf — V14p — explicitly cites `loom/load/cross-source-shadow` and asserts the warning text matches the spec verbatim.

The M leaf's **Spec** field links only `overview.md`, `pi-integration.md`, and `pi-integration-contract.md`; it does not link `discovery.md` or `diagnostics.md`. An implementer working strictly from the M leaf has no path to the registry entry, so the M test will be written against an ad-hoc code (e.g. `loom/load/duplicate-slash` or no code at all). When V14p lands and asserts the spec code, the two leaves diverge: either V14p's stricter test requires re-doing M's work, or the M-shipped behaviour silently drifts away from the spec until V14p re-grounds it.

## Plan Documents

- `plan_topics/m-mvp.md` — M leaf, Tests bullet (and optionally Spec field) (edited)
- `plan_topics/v14-tool-calls.md` — V14p (read-only; cite target)

## Spec Documents

- `spec_topics/discovery.md` — "Source priority (high to low)" paragraph (read-only)
- `spec_topics/diagnostics.md` — `loom/load/cross-source-shadow` registry row (read-only)

## Affected Leaves

**Phases:** MVP

**Leaves (implementation order):**

- M — Minimal end-to-end loom — (modified)

## Consequence

**Severity:** correctness

The M leaf, as written, lets two reasonable implementers ship two different diagnostic codes for the same event. Once V14p arrives, one of them is wrong; the M-era test passes vacuously while the spec rule (`loom/load/cross-source-shadow`, severity `W`) is violated, and downstream tooling (the diagnostic-rollup pages in V18) silently mis-classifies cross-root shadowing.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/m-mvp.md`, replace the existing Tests bullet

> Two files producing the same slash name across the two roots: only the project one registers; warning names both paths.

with

> Two files producing the same slash name across the two roots (`.pi/looms/` vs `~/.pi/agent/looms/`): only the project one registers; the other emits `loom/load/cross-source-shadow` (severity `warning`), naming both absolute paths, with the warning text matching `spec_topics/discovery.md` verbatim.

In the same file, append `[Directory Convention — Source priority](../spec_topics/discovery.md)` and `[Diagnostics registry](../spec_topics/diagnostics.md)` to the **Spec.** line so an implementer reading only the M leaf reaches the spec source for the code, severity, and message template.

Do not introduce a placeholder code; the canonical code is already normative in the spec, and a placeholder would create churn at V14p with no upside.

## Related Findings

- "M assumes registration/collision plumbing not yet scheduled" — decision-dependency (if that finding's fix has M defer the cross-source priority check entirely to V14p, M's Tests bullet would be removed instead of tightened; resolve that one first)
- "Cross-priority shadowing with no opt-out or rollback procedure" — same-cluster (also concerns `loom/load/cross-source-shadow`, but at V14p; resolves independently of M's wording)

---

## plan_topics/v4-schemas.md / v10-enums.md / v11-discriminated-unions.md

---

# Empty schema and enum body diagnostics — no test leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** Empty schema and enum body diagnostics — no test leaf
**Kind:** spec-coverage

## Finding

The spec mandates two parse diagnostics for empty body declarations:

- `spec_topics/schemas.md:19` — `schema X { }` with no fields is `loom/parse/empty-schema-body` with the verbatim message `"'X' has no fields; an empty schema cannot be validated."`
- `spec_topics/schemas.md:89` — `enum X { }` with no variants is `loom/parse/empty-enum-body` with the verbatim message `"'X' has no variants; an empty enum cannot be validated."`

The coverage matrix routes the object-form schema row to `V4b` and the enum row to `V10a`–`V10c`. Neither closing leaf asserts the empty-body case. `V4b` Tests cover trailing comma, missing field, `additionalProperties:false`, snapshot fixture, and the `by`-on-object misuse — empty body is absent. `V10a` Tests cover the variant case rule, the lowering shape, and rejection of payload-carrying variants — empty enum body is absent. As a result, both diagnostic codes are spec-mandated but unenforced by any leaf gate.

## Plan Documents

- `plan_topics/v4-schemas.md` — V4b (edited)
- `plan_topics/v10-enums.md` — V10a (edited)
- `plan_topics/coverage-matrix.md` — Schema Declarations rows (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical V4, Vertical V10

**Leaves (implementation order):**

- V4b — Object schema declaration and lowering — (modified)
- V10a — `enum X { ... }` declaration — (modified)

## Consequence

**Severity:** correctness

Two spec-mandated parse diagnostics (`loom/parse/empty-schema-body`, `loom/parse/empty-enum-body`) have no asserting leaf, so the V18o coverage gate over the closed diagnostic registry will pass vacuously for these codes. Implementers of V4b and V10a are not required to emit them, so the empty-body forms may compile to schemas that AJV either accepts trivially (objects) or rejects with an opaque internal error (`enum:[]`), neither matching the spec's user-facing diagnostic.

## Solution Space

**Shape:** single

### Recommendation

Edit `plan_topics/v4-schemas.md` — append to V4b's `Tests.` bullet:

> `schema X { }` emits `loom/parse/empty-schema-body` with message `"'X' has no fields; an empty schema cannot be validated."`

Edit `plan_topics/v10-enums.md` — append to V10a's `Tests.` bullet:

> `enum X { }` emits `loom/parse/empty-enum-body` with message `"'X' has no variants; an empty enum cannot be validated."`

Both assertions must pin the exact code string and the verbatim message text from `spec_topics/schemas.md` so the V18o gate has an observable closing test for each code. Detection is parse-time on an empty `{}` body; emission precedes lowering (so AJV's own `enum:[]` rejection is not what surfaces to the user).

## Related Findings

- "Closed diagnostic registry — many codes have no asserting plan leaf" — same-cluster (this finding is one concrete instance of that registry-level gap)
- "Type-alias cycle detection (`loom/parse/type-alias-cycle`) — no plan leaf" — same-cluster (sibling missing-diagnostic-coverage finding in the V4 area)
- "`loom/parse/non-string-discriminator` — no test leaf" — same-cluster (sibling missing-diagnostic-coverage finding in the schema/union area)
- "`loom/parse/integer-narrowing` — no plan leaf" — same-cluster (sibling missing-diagnostic-coverage finding)
- "`loom/load/missing-mode` and `loom/load/unknown-mode-value` — no asserting leaf" — same-cluster (sibling missing-diagnostic-coverage finding)
- "Path literals forward-slash rule and `loom/parse/invalid-path-separator` — no leaf" — same-cluster (sibling missing-diagnostic-coverage finding)

---

# Type-alias cycle detection has no plan leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** Type-alias cycle detection (`loom/parse/type-alias-cycle`) — no plan leaf
**Kind:** spec-coverage

## Finding

[`spec_topics/schemas.md:143`](../../../spec_topics/schemas.md) mandates a parse-time cycle detector for pure type aliases: `schema X = X`, `schema X = Y; schema Y = X`, and longer fully-aliased chains must emit `loom/parse/type-alias-cycle` with the cycle path printed (`"type-alias cycle: X → Y → X"`, mirroring the import- and invocation-cycle diagnostics). The detector is required to run "after schema-name resolution but before lowering". Cycles that pass through at least one object-schema hop remain legal — the runtime data-depth cap bounds those.

No plan leaf covers this. `V4c` (the `schema X = T` type-alias leaf) tests primitive unions only; `V4i`, `V11g`, and `V11h` cover *legal* recursion through object schemas; `V11i` covers the runtime depth cap. The two analogous cycle detectors are scheduled (`V17k` for `loom/load/import-cycle`, `V15n` for `loom/load/invocation-cycle`), but the alias counterpart is absent. A grep of `plan_topics/` and `plan.md` for `type-alias-cycle` returns zero hits, and the [`plan_topics/coverage-matrix.md`](../../../plan_topics/coverage-matrix.md) row "Schema Declarations — type alias / union" maps to `V4c` only — which does not assert the diagnostic.

A secondary, spec-side gap is worth flagging for the fixer: the closed registry table in [`spec_topics/diagnostics.md`](../../../spec_topics/diagnostics.md) does not list `loom/parse/type-alias-cycle` even though the spec narrative declares it. The plan leaf can cite `schemas.md` directly, but unless the registry table is also updated, the diagnostic-registry CI check (separately recommended in the "Closed diagnostic registry" finding) will not corroborate it.

## Plan Documents

- `plan_topics/v4-schemas.md` — V4c section and the spot for a new sibling leaf (edited)
- `plan_topics/coverage-matrix.md` — "Schema Declarations — type alias / union" row (option-dependent)
- `plan_topics/v15-invoke.md` — V15n (read-only; reference for cycle-message format)
- `plan_topics/v17-warp.md` — V17k (read-only; reference for cycle-message format)
- `plan_topics/conventions.md` — leaf-format and REQ-ID rules (read-only)

## Spec Documents

- `spec_topics/schemas.md` — type-alias cycle paragraph at line 143 (read-only; the source of truth)
- `spec_topics/diagnostics.md` — closed registry table (option-dependent; an entry for `loom/parse/type-alias-cycle` is missing and should land in the same edit if the registry is treated as closed)

## Affected Leaves

**Phases:** Vertical V4

**Leaves (implementation order):**

- V4c — Type-alias `schema X = T` for primitive unions — (modified)
- `<new>` — Type-alias cycle detector — (added)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one will infinite-loop or stack-overflow when lowering `schema X = X`; another will emit some ad-hoc parse error with the wrong code or no printed cycle path. Neither case is caught by any existing leaf's tests, and the V18o coverage gate (REQ-ID-only) will not flag it. The closed-registry diagnostic gate proposed in a sibling finding would catch the missing code only if and when both the spec registry and a leaf-level test are added.

## Solution Space

**Shape:** single

### Recommendation

Add a new sibling leaf in `plan_topics/v4-schemas.md` (placement: after V4i, taking the next free letter slot — implementer-chosen, here `<new>`). The new leaf scopes only the alias-cycle pass, mirroring the structure of `V17k` (import cycles) and `V15n` (invocation cycles).

**Plan edits.**

- In `plan_topics/v4-schemas.md`, append a new leaf:
  - **Spec.** [Schema Declarations — recursion / type-alias cycle](../spec_topics/schemas.md).
  - **Adds.** Pass that walks the type-alias graph after schema-name resolution but before lowering; rejects `schema X = ...` whose right-hand side reduces to `X` through aliases only; emits `loom/parse/type-alias-cycle` with the printed cycle path in the spec format `"type-alias cycle: X → Y → X"`. Cycles that traverse at least one object-schema hop are walk leaves and remain legal.
  - **Tests.** `schema X = X` → `loom/parse/type-alias-cycle`, message `"type-alias cycle: X → X"`; two-step `X = Y; Y = X` → diagnostic, message `"type-alias cycle: X → Y → X"`; three-step chain — diagnostic with full path; cycle that passes through one object schema → no diagnostic, lowers normally; pass runs before lowering (asserted via fixture or instrumentation).
  - **Deps.** V4c (alias surface), V4b (object schema, to identify object-hop walk leaves).
  - **Ships when.** Pure-alias cycles rejected with the documented code and printed path; cycles through object schemas remain legal.
- In `plan_topics/coverage-matrix.md`, extend the "Schema Declarations — type alias / union" row's closing-leaf set to include the new leaf ID alongside `V4c`.

**Spec edits.** Add a `loom/parse/type-alias-cycle` row to the registry table in `spec_topics/diagnostics.md` (severity `E`, stage `parse`, link to `schemas.md`).

Edge cases for the implementer to pin in tests:

- The printed path uses `→` (U+2192) and the literal prefix `"type-alias cycle: "` exactly — match the spec's quoted template byte-for-byte.
- Self-cycle `schema X = X` must still produce a non-empty path (`"X → X"`), not a degenerate one-element rendering.
- A cycle whose only object-hop is `null`-typed or otherwise non-`schema` (e.g. `schema X = X | null`) is *not* an object-schema hop — the detector must treat aliases-to-primitives-or-aliases as continuing the walk.
- The pass must run before the V4c lowering attempt — without this ordering, lowering recurses into `X = X` and stack-overflows before the diagnostic fires.
- The implementer must remember to schedule the new leaf before any leaf that exercises type aliases against potentially cyclic input — the explicit `Deps.` entry on `V4c` and on downstream leaves prevents that.

## Related Findings

- "Closed diagnostic registry — many codes have no asserting plan leaf" — same-cluster (the proposed registry-vs-tests CI gate would catch this code too; the original inventory of missing codes did not list `loom/parse/type-alias-cycle` because the registry table itself omits it)
- "Empty schema and enum body diagnostics — no test leaf" — same-cluster (V4 parse-coverage gap of the same shape)
- "`loom/parse/non-string-discriminator` — no test leaf" — same-cluster (V11 parse-coverage gap of the same shape)
- "V15n invocation-cycle message format not pinned to spec template" — same-cluster (the alias detector should pin the same `"X → Y → X"` template; co-resolve by adopting one shared message-format assertion across the three cycle leaves)

---

# `loom/parse/non-string-discriminator` has no asserting leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** `loom/parse/non-string-discriminator` — no test leaf
**Kind:** spec-coverage

## Finding

`spec_topics/schemas.md` (Discriminated unions, line 103) mandates rejection of numeric and boolean literal discriminators with the diagnostic `loom/parse/non-string-discriminator`, and explicitly states the rule "applies equally to implicit detection and to the explicit `by <field>` form." The closing-leaf row in `plan_topics/coverage-matrix.md` for "Schema Declarations — discriminated union" lists V11a–V11f, but none of those leaves' Tests bullets cite `loom/parse/non-string-discriminator`:

- V11a tests detection on string-discriminator examples and `anyOf` lowering.
- V11b/V11c test ambiguous and missing-discriminator diagnostics.
- V11d tests the explicit `by f` form and `loom/parse/by-on-object-schema` for object bodies, but not non-string tag values under `by`.
- V11e/V11f cover nested discriminators and mixed unions.

Both arms of the spec rule (implicit detection rejecting numeric/boolean tags; explicit `by` rejecting them too) are therefore unasserted. An implementation that omits the type-of-literal check, or only catches the implicit case and not the explicit-`by` case, ships green and the V18o registry-coverage gate currently has no row that would catch it.

## Plan Documents

- `plan_topics/v11-discriminated-unions.md` — V11a Tests, V11d Tests (edited)
- `plan_topics/coverage-matrix.md` — read-only (the existing row already names V11a–V11f; no row change needed)
- `plan.md` — read-only

## Spec Documents

- `spec_topics/schemas.md` — Discriminated unions paragraph (read-only — already mandates the rule and names the code)

## Affected Leaves

**Phases:** Vertical V11

**Leaves (implementation order):**

- V11a — Implicit discriminator detection — (modified)
- V11d — Explicit `by <field>` form — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one implements V11a literally and accepts `kind: 1` / `kind: true` as discriminators (lowering them to numeric/boolean `const`), the other reads the spec and rejects them. Both pass V11a, V11b, V11c. The bug only surfaces against a real provider when grammar-constrained decoding silently degrades — exactly the failure mode the spec rule was added to prevent. The V18o coverage gate cannot catch this until the registry-coverage check is REQ-ID-pivoted.

## Solution Space

**Shape:** single

### Recommendation

Edit `plan_topics/v11-discriminated-unions.md`:

1. **V11a Tests bullet** — append: "variant set with a numeric literal tag (`kind: 1` per variant) emits `loom/parse/non-string-discriminator`; same for boolean literal tags (`kind: true`); diagnostic message matches spec verbatim."

2. **V11d Tests bullet** — append: "`schema X by kind = A | B` where the named `kind` field has numeric or boolean literal values emits `loom/parse/non-string-discriminator` (the rule applies under explicit `by` exactly as under implicit detection)."

Optionally add a third assertion to V11a covering the wire-rename interaction (`kind as "Kind": 1` still emits `loom/parse/non-string-discriminator` — the rename does not interact), since the spec paragraph explicitly calls this out, but the two bullets above are the minimum required to close the coverage gap.

No new leaf is needed; the existing V11a/V11d Deps and Ships-when remain valid.

## Related Findings

- "Empty schema and enum body diagnostics — no test leaf" — same-cluster (same shape: spec-mandated parse code with no asserting leaf in V4/V10/V11)
- "Type-alias cycle detection (`loom/parse/type-alias-cycle`) — no plan leaf" — same-cluster (same shape, in the same v4/v10/v11 section of the review)
- "Closed diagnostic registry — many codes have no asserting plan leaf" — superseded-by (this finding is one specific instance of that cross-cutting registry-coverage gap; resolving the cross-cutting gate would surface this systematically, but the V11a/V11d edit closes the immediate hole independently)

---

# Depth cap is tested at one site; spec mandates four

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** Schema-subset depth enforcement missing at three of four required sites
**Kind:** spec-coverage

## Finding

`spec_topics/schema-subset.md` (Depth Enforcement) pins down four enforcement boundaries for the `depth ≤ 5` cap, all serviced by the `SchemaValidator`: (1) typed-query response validation, (2) model-driven tool-call argument validation, (3) code-driven tool-call argument validation, and (4) `params` validation at loom invocation. The walk runs **before** AJV at each site as a cheap fast-fail, and the canonical violation shape is fixed: `ValidationIssue { schema_keyword: "maxDepth", path: <JSON Pointer to first too-deep node>, message: "JSON document depth exceeds 5" }`, surfaced through whichever envelope the boundary uses (`QueryError{kind:"validation"}`, `CodeToolError{cause:"validation"}`, `InvokeInfraError{reason:"validation"}`).

`plan_topics/v11-discriminated-unions.md` V11i is the only depth-cap leaf. Its Adds say "AJV-time check on JSON document depth ≤ 5" (already understated — it is a pre-AJV walk, not an AJV-time check) and its Tests say only "Depth-5 accepted; depth-6 rejected; cap applies to data not schema graph." That wording is satisfied by a single test against any one boundary. None of V6c (typed-query response), V14e/V14f (model-driven and code-driven tool-call argument validation), V16p (binder AJV on merged `args`), or V3a (single-string-bypass safety net) carry a depth-violation test either, and the spec's `schema_keyword: "maxDepth"` literal — the only `schema_keyword` value Loom emits that is not a literal AJV keyword — is unasserted anywhere.

The cumulative gap: the V18o coverage gate can pass with three of the four boundaries silently un-policed, the `maxDepth` literal undocumented in any test fixture, and the pre-AJV ordering free to invert without a regression bell ringing.

## Plan Documents

- `plan_topics/v11-discriminated-unions.md` — V11i (edited)
- `plan_topics/v6-typed-queries.md` — V6c, V6j (option-dependent)
- `plan_topics/v14-tool-calls.md` — V14e, V14f (option-dependent)
- `plan_topics/v16-binder.md` — V16p (option-dependent)
- `plan_topics/v3-frontmatter.md` — V3a single-string bypass paragraph (option-dependent)
- `plan_topics/coverage-matrix.md` — `Schema Subset` row (read-only)

## Spec Documents

- `spec_topics/schema-subset.md` — Depth Enforcement section (read-only)
- `spec_topics/errors-and-results.md` — `ValidationIssue` shape (read-only)

## Affected Leaves

**Phases:** Vertical V11, Vertical V6, Vertical V14, Vertical V16

**Leaves (implementation order):**

- V6c — Typed-query response loop (one-shot respond tool) — (option-dependent)
- V11i — Runtime depth cap of 5 — (modified)
- V14e — Pi tool wired into `@` queries as model-callable — (option-dependent)
- V14f — `CodeToolError` variant: `validation` cause — (option-dependent)
- V16p — AJV validation of `args` post-default-merge — (option-dependent)

## Consequence

**Severity:** correctness

A reasonable implementer reads V11i and ships a depth check at exactly one boundary (most naturally the typed-query response, since that is the dominant `SchemaValidator` test surface). The other three boundaries — model-driven tool-call args, code-driven tool-call args, and `params` validation — silently accept depth-6+ payloads, and the V18o coverage matrix passes vacuously because the `Schema Subset` row points at V4g and V11i and both leaves are green. The `schema_keyword: "maxDepth"` contract (the sole non-AJV literal Loom emits) and the pre-AJV ordering can also drift undetected.

## Solution Space

**Shape:** single

### Recommendation

Keep V11i scoped to the `SchemaValidator` service in isolation (depth walk correctness, error shape, pre-AJV ordering against a synthetic boundary). Add a depth-violation Tests bullet to each of the four boundary leaves to prove the walk is actually invoked at that site. The four boundaries are owned by four different leaves with different envelopes (`QueryError`, `CodeToolError`, `InvokeInfraError`, binder system note) and different test scaffolds; centralising in V11i would couple it to four downstream leaves and push it past V16.

**Plan edits.**

- `plan_topics/v11-discriminated-unions.md`, V11i:
  - **Adds.** "`SchemaValidator` exposes a pre-AJV depth walk over post-decode JSON values: depth-5 accepted, depth-6 short-circuits at the first too-deep node and produces `ValidationIssue { schema_keyword: \"maxDepth\", path: <JSON Pointer>, message: \"JSON document depth exceeds 5\" }`. The walk is unconditionally installed at every boundary that calls `SchemaValidator.validate(...)`; per-boundary surfacing is verified in V6c, V14e, V14f, V16p."
  - **Tests.** "Service-level: depth-5 accepted, depth-6 rejected; first-too-deep node short-circuits (deeper subtrees not walked); `ValidationIssue.schema_keyword === \"maxDepth\"`; `path` is a JSON Pointer to the first too-deep node; `message` is exactly `\"JSON document depth exceeds 5\"`; the walk runs before AJV (an AJV-keyword issue against the same depth-6 payload is not produced); recursive `schema Tree` with depth-3 instance accepted (cap is on data not schema graph)."
  - **Deps.** unchanged (`V11g`).
- `plan_topics/v6-typed-queries.md`, V6c **Tests.** Append: "depth-6 response payload surfaces `Err(QueryError { kind: \"validation\", validation_errors: [{ schema_keyword: \"maxDepth\", path: <JSON Pointer>, message: \"JSON document depth exceeds 5\" }], ... })`."
- `plan_topics/v14-tool-calls.md`, V14e **Tests.** Append: "model-emitted tool-call arguments at depth 6 are rejected before the tool body runs and surface to the model as the boundary's standard validation failure with `schema_keyword: \"maxDepth\"`."
- `plan_topics/v14-tool-calls.md`, V14f **Tests.** Append: "code-side call whose constructed argument is depth-6 returns `Err(CodeToolError { cause: \"validation\", validation_errors: [{ schema_keyword: \"maxDepth\", ... }], ... })` before the tool body runs."
- `plan_topics/v16-binder.md`, V16p **Tests.** Append: "merged `args` containing a depth-6 nested value surfaces as the spec's `argument binding produced invalid args — <ajv-summary>` system note where the summary names `maxDepth`."

**Spec edits.** None.

Edge cases the implementer must watch:

- (a) The `maxDepth` literal is the only `schema_keyword` value Loom emits that is not a literal AJV keyword — `V6j` (`ValidationIssue` schema) must accept it without an enum-mismatch error.
- (b) The `params` boundary walk is a no-op for primitive-only declarations but must still be installed (per spec edge case) so future widening inherits the cap — V16p's test should construct an artificially deep value and confirm the walk fires even against a primitive-typed param schema, or V3a should grow a note that the safety net is the same `SchemaValidator` invocation.
- (c) Drift between the per-boundary assertions if the spec's error shape changes is mitigated by V11i still owning the canonical service-level shape test.

## Related Findings

- "V4a \"validation produces expected error shapes\" is not specific" — same-cluster (both findings concern under-specified validation error-shape assertions; V4a's fix to enumerate AJV keyword → `ValidationIssue` mappings should include `maxDepth` if Option A lands, or be cross-referenced from V11i if Option B lands)
- "V4i and V11g/V11h/V11i contain duplicated requirements" — same-cluster (touches V11i's Adds/Tests; resolve V4i narrowing first so this finding edits a settled V11i)
- "Empty schema and enum body diagnostics — no test leaf" — same-cluster (sibling spec-coverage gap in the V4/V10/V11 cluster; resolve independently)
- "Type-alias cycle detection (`loom/parse/type-alias-cycle`) — no plan leaf" — same-cluster (sibling spec-coverage gap in the same cluster; resolve independently)
- "`loom/parse/non-string-discriminator` — no test leaf" — same-cluster (sibling spec-coverage gap in V11; resolve independently)

---

# Canonical schema hash algorithm unasserted

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** Canonical schema hash algorithm unasserted
**Kind:** spec-coverage

## Finding

`spec_topics/schema-subset.md` (`## Canonical schema hash`) pins a precise algorithm: hash the **lowered** JSON Schema fragment serialised to a deterministic UTF-8 byte sequence (object keys sorted by Unicode code-point order, no insignificant whitespace, JSON-numeric form for numbers, RFC-8259 minimal-escape strings), take SHA-256, and use the first 16 hex characters lowercased as the slug. The spec is explicit that the recipe is "part of the on-disk and on-wire contract — changing it is a breaking change for any cached artefact, fixture snapshot, or replayable provider payload."

V4f is the leaf that introduces the slug (`__inline_<hash>`) and is the natural site for asserting the algorithm. Its current Tests bullet — *"Two identical inline schemas → one `$defs` entry; differing key order produces same hash; differing types produces different hashes"* — confirms the dedup property and key-order-independence but never pins SHA-256, the 16-hex-char truncation, the canonical-form serialiser, or the lowered-vs-source input choice. Any hash function with stable output and key-order-independence (e.g. SHA-1 first 16 chars, FNV-1a, `JSON.stringify` after key-sort with default escape rules, `crypto.createHash("sha256")` over an unsorted body) passes V4f's gates and yet violates the contract.

Downstream consumers of the slug — V6i's `__loom_respond_<slug>`, V4a's compiled-validator cache key, H4's `Map<schema-hash, registeredToolName>`, V14e's prompt-mode loom-callee dedup, V18f's hash-change re-registration — all reference "the hash" without re-asserting it. If V4f does not pin the algorithm, none of them do, and the on-disk/on-wire contract has no test gate.

## Plan Documents

- `plan_topics/v4-schemas.md` — V4f section (edited)
- `plan_topics/v4-schemas.md` — V4a section (read-only — references "lowered-schema content hash" for the AJV cache; inherits V4f's pinning transitively)
- `plan_topics/v6-typed-queries.md` — V6i section (edited — cross-reference to the V4f slug fixture)
- `plan_topics/h4-extension-shell.md` — H4 section (read-only — registration-cache key consumes the slug)
- `plan_topics/v14-tool-calls.md` — V14e section (read-only — "unique lowered-schema hash" gate consumes the slug)
- `plan_topics/v18-cancellation.md` — V18f section (read-only — "new lowered-schema hash" trigger consumes the slug)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical V4, Vertical V6

**Leaves (implementation order):**

- V4f — Inline anonymous object hoisting — (modified)
- V6i — AJV validation of typed query results (two-phase tool loop) — (modified)

## Consequence

**Severity:** correctness

Two implementers without a pinned-algorithm test would converge on a hash that satisfies dedup and key-order-independence but diverges on encoding details (SHA-1 vs SHA-256, hex-char count, `JSON.stringify` defaults vs RFC-8259 minimal-escape, sorted-input vs sorted-output, lowered vs source-AST input). The dedup tests pass; the resulting `__inline_<slug>` and `__loom_respond_<slug>` names disagree with any external fixture or replay artefact built against the spec. Because the spec explicitly designates the recipe as on-disk/on-wire contract, every cached validator entry, snapshot test, and replayable provider payload becomes implementer-dependent. The V18o coverage gate would mark the canonical-hash spec section as covered (V4f cites `schema-subset.md`) while the algorithm itself ships unverified.

## Solution Space

**Shape:** single

### Recommendation

Edit `plan_topics/v4-schemas.md`, V4f section, **Tests** bullet. Append the following sentence verbatim before the closing period:

> ; canonical hash matches a checked-in fixture snapshot pinning the full algorithm (SHA-256 over the canonical-form bytes of the **lowered** JSON Schema fragment — object keys sorted by Unicode code-point order, no insignificant whitespace, JSON-numeric form, RFC-8259 minimal-escape strings — truncated to the first 16 lowercase hex chars), with fixtures covering: a flat object schema, a nested-object schema with reordered source-level fields (asserting the emitted `$defs` entry preserves source order while the slug is invariant), a schema containing a string with characters that distinguish minimal-escape from gratuitous-`\u`-escape encoding, a schema containing an integer and a float (asserting JSON-numeric form), and a schema whose key set requires Unicode code-point ordering distinct from byte-wise lexicographic ordering.

Then edit `plan_topics/v6-typed-queries.md`, V6i section, **Tests** bullet. Append:

> ; `__loom_respond_<slug>` derives `<slug>` via the V4f canonical-hash fixture path (asserted by the same fixture-snapshot test against a representative typed-query response schema).

Implementer edge cases the V4f fixture must cover:

- **Lowered, not source.** Two source-level inline schemas that lower to byte-identical JSON Schema fragments must produce the same slug; a single source AST that lowers under a path that adds wrapper keys must produce a different slug. The fixture should include one such pair.
- **Sort vs emit order.** The canonical-form key sort applies only inside the hash function; the emitted `$defs` entry retains loom-source declaration order (per the Object emission rule in `schema-subset.md` step 3). The fixture must assert both invariants in the same test.
- **Lowercase hex.** Slugs must be lowercase; an implementer using `Buffer.toString("hex")` gets lowercase by default but `crypto.subtle` paths may not. Fixture should include at least one slug whose digest contains digits ≥ `a` to catch an uppercase regression.

## Related Findings

- "Tool-registration dedup assumes no schema-hash collision" — decision-dependency (both touch the canonical-hash plumbing; pinning the algorithm in V4f is a precondition for the collision-detection test the related finding requests in H4)
- "Schema-subset depth enforcement missing at three of four required sites" — same-cluster (adjacent V4-area spec-coverage gap; resolves independently)
- "V4a 'validation produces expected error shapes' is not specific" — same-cluster (also a V4 Tests-bullet sharpening; resolves independently)

---

# V4a Tests bullet "validation produces expected error shapes" is unfalsifiable

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** V4a "validation produces expected error shapes" is not specific
**Kind:** validation

## Finding

`plan_topics/v4-schemas.md` V4a's last Tests bullet reads `validation produces expected error shapes`. Nothing in V4a fixes what an "expected error shape" is: there is no enumeration of which AJV keywords are exercised, no assertion about the error array structure, no reference fixture, and no statement of the path format. Any test that asserts `errors.length > 0` against a single failing fixture would satisfy this wording.

The leaf's own scope makes this worse. V4a's `Adds` field commits to a specific validator behavioural contract — *one-pass multi-error reporting*, *no coercion*, *no default-filling*, *in-document `$ref` only*, *silent acceptance of any `format` keyword* — and configures AJV with `allErrors: true`. None of those four observable contract clauses appear as Tests bullets. Meanwhile the loom-shaped translation layer (`ValidationIssue` with `path` / `message` / `schema_keyword`, AJV-keyword-to-`schema_keyword` mapping, JSON-Pointer paths) is owned by V6j, which lands much later in the V6 slice.

The current bullet therefore covers neither end: it does not pin AJV's native error contract that V4a is responsible for, and it cannot pin the loom-shaped contract because that contract does not yet exist at this point in the plan.

## Plan Documents

- `plan_topics/v4-schemas.md` — V4a (edited)
- `plan_topics/v6-typed-queries.md` — V6j (read-only; cross-reference target)
- `plan_topics/conventions.md` — Leaf format / Per-phase TDD ritual (read-only)

## Spec Documents

- `spec_topics/schema-subset.md` — Lowering Algorithm (read-only)
- `spec_topics/implementation-notes.md` — Runtime / validator contract (read-only)
- `spec_topics/errors-and-results.md` — `ValidationIssue` schema (read-only)
- `spec_topics/query.md` — `ValidationIssue` shape reference (read-only)

## Affected Leaves

**Phases:** Vertical V4

**Leaves (implementation order):**

- V4a — AJV pipeline scaffold — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will produce materially different V4a deliverables: one writes a single happy-path-plus-failure smoke test against AJV's raw `errors` array; another writes a richer suite that exercises the four behavioural-contract clauses in `Adds`. The leaf's `Ships when` ("Validator service can compile and validate against arbitrary JSON Schema documents") is satisfied by both, so the divergence is not caught at the phase exit gate. Since V6j later builds on the assumption that AJV is configured for `allErrors`, returns native AJV `keyword` / `instancePath` fields, and runs without coercion or default-filling, an under-tested V4a leaves V6j to discover those misconfigurations through its own translation tests — much later, and far from where the configuration was set.

## Solution Space

**Shape:** single

### Recommendation

Replace the vague bullet with explicit, falsifiable assertions about AJV's native behaviour that V4a is directly responsible for, plus an explicit forward reference to V6j for the loom-shaped translation. V4a is the only leaf where AJV's runtime configuration is set; its Tests bullets must pin that configuration. The validator-contract clauses already enumerated in `Adds` are the natural source of those bullets — mirror the `Adds` line into `Tests`, which is the leaf format's intended discipline.

**Plan edits.** In `plan_topics/v4-schemas.md`, V4a `Tests.` field, strike `validation produces expected error shapes` and insert in its place:

- `allErrors:true returns every violation in one pass (fixture: object missing two required fields and one type-mismatched field → errors.length === 3);`
- `no coercion (string "1" against {type:"number"} fails; data unchanged);`
- `no default-filling (schema with default does not mutate input);`
- `in-document $ref resolves; cross-document $ref rejected at compile time;`
- `unknown format keyword silently accepted (e.g. {format:"uri"} compiles and validates without warning);`
- `loom-shaped error translation deferred to V6j.`

**Spec edits.** None.

Edge case for the implementer: the `unknown format keyword silently accepted` test must register `ajv-formats` (per `Adds`) and *still* assert that an unregistered format string produces no compile-time error and no validation error — silent acceptance, not silent passing of registered formats.

## Related Findings

- "Schema-subset depth enforcement missing at three of four required sites" — same-cluster (also asserts `ValidationIssue` shape specifics, but at the four enforcement sites rather than at the AJV scaffold)
- "Canonical schema hash algorithm unasserted" — same-cluster (parallel V4 specificity gap: V4f's stable-hash claim is similarly unfalsifiable)
- "V4i and V11g/V11h/V11i contain duplicated requirements" — same-cluster (touches the V4-vs-later-slice scoping question; resolves independently)

---

# V4i overlaps V11g/V11h/V11i instead of supplying the AJV-side foundation

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** V4i and V11g/V11h/V11i contain duplicated requirements
**Kind:** cruft

## Finding

V4i ("Recursive schema references") and V11g/V11h/V11i ("Self-recursive object schemas" / "Mutual recursion across schemas" / "Runtime depth cap of 5") restate the same three concerns at the same level of detail. V4i's Adds bullet names the surface forms `schema Tree { value: number, children: array<Tree> }` and `Person ↔ Animal`, and the runtime depth cap; V4i's Tests bullet then asserts a 4-deep tree validates, a 6-deep tree is rejected, and mutual recursion lowers. V11g asserts the surface `schema Tree` lowers via `$defs`/`$ref` and AJV validates a 4-deep tree; V11h asserts `Person ↔ Animal` lowers and AJV validates a representative document; V11i asserts depth-5 accepts and depth-6 rejects.

The intended division of labour is visible in V11g's Deps note (`*(V4i is the AJV side; this is the surface.)*`) — V4i is meant to land the AJV plumbing that makes recursive `$ref` and the depth cap *possible*, and V11g–V11i are meant to land the surface-syntax leaves that *use* that plumbing. As written, V4i over-reaches into surface syntax and V11g–V11i become redundant rather than additive. Either the redundancy is real (V4i is doing V11g–V11i's job too early in the plan) or the AJV-side work is missing (V4i is misnamed and there is no leaf actually proving AJV can compile a recursive `$defs` schema or run the depth walk).

## Plan Documents

- `plan_topics/v4-schemas.md` — V4i (edited)
- `plan_topics/v11-discriminated-unions.md` — V11g, V11h, V11i (read-only)
- `plan_topics/coverage-matrix.md` — Schema Subset / Schema Declarations rows that cite V4i and V11g–V11i (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical V4, Vertical V11

**Leaves (implementation order):**

- V4i — Recursive schema references — (modified)
- V11g — Self-recursive object schemas — (read-only; Deps still points at V4i)
- V11h — Mutual recursion across schemas — (read-only)
- V11i — Runtime depth cap of 5 — (read-only)

## Consequence

**Severity:** advisory

Two reasonable implementers will pick up V4i and V11g/V11h/V11i in different orders, write the same surface-syntax fixtures twice, and disagree on which leaf is "really" responsible for proving recursive `Tree` works end-to-end. Nothing fails to ship — the duplicated assertions all pass — but the V11g Deps note becomes a lie (V4i is not "the AJV side" in any distinguishable sense), the coverage-matrix rows double-count, and reviewers cannot tell at a glance which leaf to read for which behaviour.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/v4-schemas.md`, narrow V4i to AJV infrastructure only:

- **Adds.** Replace the current text with: "Validator service compiles a hand-written JSON Schema document containing recursive `$defs`/`$ref` (no surface-syntax involvement) and runs the depth-counting walk defined in [Schema Subset — Depth Enforcement](../spec_topics/schema-subset.md#depth-enforcement) before AJV at every validation site. The walk is a recursive descent over the parsed JSON value with a depth counter, short-circuiting on the first node whose depth would exceed 5."
- **Tests.** Replace the current text with: "AJV compiles a hand-authored recursive `$defs`/`$ref` document and validates a 4-deep instance; depth walk on a 6-deep instance returns the canonical depth violation (`schema_keyword: \"maxDepth\"`, JSON Pointer to first too-deep node, message `\"JSON document depth exceeds 5\"`); depth walk runs before AJV (asserted by feeding a payload that would otherwise trip an AJV error and confirming the depth error is the one returned)."
- **Spec.** Add a reference to [Schema Subset — Depth Enforcement](../spec_topics/schema-subset.md#depth-enforcement) alongside the existing two refs.
- **Ships when.** Leave as-is, but reword to: "AJV-side recursion and depth cap are exercised; surface-syntax recursive schemas can be built on top in V11g–V11i."

Leave V11g/V11h/V11i Adds/Tests untouched — they remain the canonical owners of the surface-syntax assertions. The literal `schema Tree` and `Person ↔ Animal` examples must not appear in V4i.

Edge cases the implementer should watch:

- The hand-written recursive `$defs` fixture in V4i must not be a lowered output of `schema Tree` — that would re-couple V4i to the surface syntax. Author it directly as JSON.
- If the related finding "Schema-subset depth enforcement missing at three of four required sites" is fixed by widening V11i to assert the four enforcement sites, V4i should still hold the AJV-mechanics assertion (depth walk runs before AJV; canonical error shape) so V11i can focus on site coverage rather than re-asserting mechanics.

## Related Findings

- "Schema-subset depth enforcement missing at three of four required sites" — decision-dependency (the V4i narrowing leaves V11i free to expand into the four-site coverage; both edits land in the same vertical and should be sequenced together)
- "V11g and V6d Deps fields contain rationale-only asides (cruft)" — co-resolve (once V4i is cleanly the AJV side, the V11g aside `*(V4i is the AJV side; this is the surface.)*` is redundant with the leaf division itself and can be deleted)

---

# V11g and V6d Deps fields carry rationale asides instead of bare IDs

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** V11g and V6d Deps fields contain rationale-only asides (cruft)
**Kind:** cruft

## Finding

`plan_topics/conventions.md` defines the **Deps** field as "Other leaf IDs that must be complete first." Two leaves break that contract by appending parenthetical italic prose:

- `plan_topics/v11-discriminated-unions.md` V11g: `**Deps.** V4i. *(V4i is the AJV side; this is the surface.)*` — pure rationale restating what the prior **Spec/Adds** lines already imply.
- `plan_topics/v6-typed-queries.md` V6d: `**Deps.** V6c, V9 (functions). *(Order: this leaf depends on V9a–V9e; reorder as needed.)*` — process aside addressed to the plan author, not the implementer. It also cites `V9`, which is not a leaf ID (V9 is a slice grouping; the actual leaves are V9a–V9f).

These are the only two leaves under `plan_topics/` with this pattern, so removing them restores the field to a uniform machine-readable list of leaf IDs across the whole plan.

## Plan Documents

- `plan_topics/v11-discriminated-unions.md` — V11g Deps line (edited)
- `plan_topics/v6-typed-queries.md` — V6d Deps line (edited)
- `plan_topics/conventions.md` — Per-phase template, Deps definition (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical V6, Vertical V11

**Leaves (implementation order):**

- V6d — Schema inference: enclosing return-type sink — (modified)
- V11g — Self-recursive object schemas — (modified)

## Consequence

**Severity:** cosmetic

The Deps field is the only structured DAG-edge data the plan exposes; mixing prose into it makes automated dep extraction (or even consistent reading) noisier. V6d additionally cites the slice ID `V9` instead of concrete leaf IDs, so the dep is under-specified — an implementer cannot tell whether V9f is a prerequisite. Implementers can still proceed today, hence cosmetic, but the V6d case borders on advisory.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/v11-discriminated-unions.md`, replace the V11g **Deps.** line

```
- **Deps.** V4i. *(V4i is the AJV side; this is the surface.)*
```

with

```
- **Deps.** V4i.
```

In `plan_topics/v6-typed-queries.md`, replace the V6d **Deps.** line

```
- **Deps.** V6c, V9 (functions). *(Order: this leaf depends on V9a–V9e; reorder as needed.)*
```

with

```
- **Deps.** V6c, V9a, V9b, V9c, V9d, V9e.
```

The V9 leaf range is taken from the deleted aside, which is the author's own statement of intent. No other fields on either leaf change.

## Related Findings

- "V4i and V11g/V11h/V11i contain duplicated requirements" — same-cluster (also touches V11g; that finding edits V4i's Adds/Tests, this one edits V11g's Deps line — independent edits)

---

## plan_topics/v5-untyped-queries.md

---

# V5b Tests bullet for object/array stringification leaves the canonical form unpinned

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** V5b "compact `JSON.stringify`" vague
**Kind:** clarity

## Finding

V5b Tests describes the per-type stringification table and, for `array<T>` and schema-typed objects, asserts only `compact JSON.stringify with wire-name translation`. The word *compact* is not defined as a term anywhere in the plan or spec. The spec section [`Stringification of interpolated values`](../../spec_topics/query.md#stringification-of-interpolated-values) parenthesises it as `(no pretty-printing)`, which fixes the `space` argument but leaves the replacer, the handling of `undefined`/missing fields, and the key-emission order unstated at both layers. Two implementers reading V5b alone will write different test fixtures and disagree about which of `JSON.stringify(value)`, `JSON.stringify(value, null, 0)`, or a custom serialiser the leaf calls for.

The leaf's surrounding bullets are concrete enough to test — `string` (verbatim), `integer` (`42`), `null` (`null`), enum variant (bare wire value) — but the two table rows that produce non-trivial output collapse to one hand-wavy phrase. That phrase is what the implementer has to land assertions against, and an assertion of the form "result is compact" is not checkable.

## Plan Documents

- `plan_topics/v5-untyped-queries.md` — V5b (edited)
- `plan_topics/conventions.md` — Tests-bullet convention (read-only)

## Spec Documents

- `spec_topics/query.md` — `Stringification of interpolated values` (read-only)
- `spec_topics/runtime-value-model.md` — outbound wire-name translation (read-only)

## Affected Leaves

**Phases:** Vertical V5

**Leaves (implementation order):**

- V5b — `${expr}` interpolation — (modified)

## Consequence

**Severity:** advisory

The implementer will most likely call `JSON.stringify(translatedValue)` with no second/third argument and pass the test, but the leaf does not constrain them to do so, and the resulting test will not catch a regression that adds a `space` argument, a replacer, or a custom serialiser. The leaf also stops short of pinning what the wire-translated input to `JSON.stringify` looks like for an object whose schema declares wire renames, so the test fixture is invented per-implementer.

## Solution Space

**Shape:** single

### Recommendation

Rewrite the two relevant clauses of the V5b **Tests.** bullet — currently `array<T>` and schema-typed object (compact `JSON.stringify` with wire-name translation) — to fix the call shape and pin a concrete fixture against the spec table.

In `plan_topics/v5-untyped-queries.md`, in the V5b **Tests.** bullet, replace the parenthetical

> `array<T>` and schema-typed object (compact `JSON.stringify` with wire-name translation)

with:

> `array<T>` and schema-typed object render as `JSON.stringify(translatedValue)` invoked with no `space` argument and no replacer, where `translatedValue` is the result of the outbound wire-name translation pass from [`runtime-value-model.md`](../spec_topics/runtime-value-model.md) applied recursively. Worked fixture: a schema-typed object with a wire-renamed field `loom_name → wire-name` and value `{ loom_name: "x", count: 1 }` interpolates as the literal text `{"wire-name":"x","count":1}`; a nested `array<schema>` interpolates the array form of the same. No `undefined` keys, no replacer transform, no inserted whitespace.

Do not introduce a new normative key-order rule here. Output key order is whatever `JSON.stringify` produces from the wire-translated object built by the runtime; if a deterministic order is required, that is a spec-level decision and belongs in `spec_topics/query.md` first, not in a plan Tests bullet.

## Related Findings

- "V4a \"validation produces expected error shapes\" is not specific" — same-cluster (same vague-Tests-bullet pattern in the same plan group, resolves independently)
- "V5c trailing-whitespace rule states only the negative" — same-cluster (sibling clarity gap in V5; same file, independent edit)
- "V14p \"Five-level priority from spec\" — no anchor" — same-cluster (same pattern: Tests bullet defers to spec without pinning the assertion)

---

# V5c trailing-whitespace test bullet asserts only what does not happen

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** V5c trailing-whitespace rule states only the negative
**Kind:** clarity

## Finding

V5c's `Tests` bullet enumerates seven normative vectors from `query.md`'s "Dedent and newline-trim — normative behaviour" table and then appends a single addendum: *"a trailing `\n` followed by whitespace before the closing backtick is **not** newline-trimmed."* The clause locks down the negative — newline-trim does not fire — but says nothing about the rendered output, leaving the implementer free to satisfy the test with any post-dedent string. Two reasonable test authors could pass this bullet by checking different things (e.g. that the input survives unchanged into pre-dedent vs. asserting nothing at all about what dedent then produces), and neither would catch a regression in the actual rendered text.

The spec is unambiguous on the positive outcome. `spec_topics/query.md` line 125 states: *"the trailing whitespace-only line is then handled by dedent's whitespace-only-line normalisation (it does not contribute to the common prefix and is rendered as an empty line)."* That sentence pins both halves of the behaviour — survival into the pre-dedent string and the empty-line normalisation that follows — and the V5c bullet should mirror it so the test it produces actually exercises the rendered output.

## Plan Documents

- `plan_topics/v5-untyped-queries.md` — V5c Tests bullet (edited)

## Spec Documents

- `spec_topics/query.md` — "Dedent and newline-trim — normative behaviour", final paragraph (read-only)

## Affected Leaves

**Phases:** Vertical V5

**Leaves (implementation order):**

- V5c — Multi-line templates: newline-trim and dedent — (modified)

## Consequence

**Severity:** advisory

The spec covers the positive behaviour clearly, so an implementer who follows the spec link will likely write the right test anyway. The risk is that the leaf's standalone Tests bullet can be satisfied by an assertion that only checks the negation, leaving the rendered-output behaviour for trailing-whitespace templates unpinned in the V5c gate.

## Solution Space

**Shape:** single

### Recommendation

In `plan_topics/v5-untyped-queries.md`, V5c `Tests.` bullet, replace the trailing clause

> Plus: a trailing `\n` followed by whitespace before the closing backtick is *not* newline-trimmed.

with

> Plus: a template ending `\n    only\n  ` (newline, content, newline, trailing spaces, closing backtick) preserves both the final `\n` and the trailing spaces in the pre-dedent string; dedent then normalises the whitespace-only trailing line to empty (it does not contribute to the common prefix), so the rendered output is `"only\n"`.

This pins newline-trim's no-op (the final `\n` survives because it is not immediately before the closing backtick), the survival of the trailing whitespace into the pre-dedent string, and the dedent-stage normalisation of whitespace-only lines — matching `query.md`'s normative paragraph at line 125.

## Related Findings

- "Newline normalisation (`\r\n`, bare `\r` → `\n`) — no plan leaf" — same-cluster (also proposes extending V5c Tests; both edits land in the same Tests bullet block)

---

# Discarded-query runtime emission and `${expr}` panic propagation are unleafed

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** Discarded-query operator-facing observability and `let _ =` interaction — no plan leaf
**Kind:** spec-coverage

## Finding

[Query — Observability of discarded results](../../../spec_topics/query.md) gives the discard form (`let _ = @`...`` and the equivalent `void`-tail-expression form) a precise three-part observability contract:

1. An `Err` from a discarded query of any **always-log** kind (per [Pi Integration Contract — Runtime event channel](../../../spec_topics/pi-integration-contract.md)) is preserved as a runtime event on the `loom-system-note` channel with `display: false`, carrying the same `kind` / `code` / `message` / `attempts` / `tokens_used` payload it would have carried at the user-facing surface, plus the source location of the discarding `let _ =`.
2. The event fires **exactly once per discarded `Err`**, regardless of how many tool-call iterations or schema-validation coercion follow-ups the underlying query consumed. `Ok` discards produce no event.
3. A panic raised inside a `${expr}` interpolation propagates **before** the `let _ =` binding completes — the discard form does not contain it.

No leaf in `plan_topics/` asserts any of those three properties. V5f covers only the parse-time half of the discard contract (bare `@` rejected, `let _ = @` accepted, void-tail `@` accepted). V9d covers void-tail discards at the type layer but not the runtime channel. V18h adds the `loom-system-note` `customType` and renderer but says nothing about which authorial sites must emit through it. V18i covers the `display: true` per-kind formatter for top-level `Err` in prompt mode — the opposite branch of the `display: true` / `display: false` switch this finding is about. A `grep -rn 'display: false\|always-log\|RuntimeEvent\|once per occurrence' plan_topics/` returns zero matches.

## Plan Documents

- `plan_topics/v5-untyped-queries.md` — V5f (edited)
- `plan_topics/v18-cancellation.md` — new sibling leaf to V18h/V18i covering the always-log runtime event channel (edited)
- `plan_topics/v9-functions.md` — V9d (read-only; the void-tail discard's runtime emission is asserted from the new V18 leaf, not V9d)
- `plan_topics/coverage-matrix.md` — `Query — untyped` row and `Pi Integration Contract` row (edited; the new V18 leaf must be added to both)
- `plan_topics/conventions.md` — read-only

## Spec Documents

None.

## Affected Leaves

**Phases:** Vertical V5, Vertical V18

**Leaves (implementation order):**

- V5f — Bare expression-statement query is parse error — (modified)
- `<new>` — Always-log runtime event channel (sibling to V18h/V18i, sequenced after V18h and V18i and before V18o) — (added)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on the discard semantics. One will read "true discard at the user-facing surface" and wire `let _ =` to swallow the `Err` entirely, producing zero events — silently masking transport, tool, and binder failures from operators. Another will emit on every `?`-rethrow and every coercion follow-up, multiplying events. The `void`-tail-form contract is even more likely to be missed because V9d's "discards silently" wording reads as discharging the obligation. Without leaf-level Tests pinning the once-per-occurrence rule, the source-location field, and the panic-propagates-through-discard rule, the operator-facing observability layer ships broken in a way that only manifests as a missing log entry — the worst class of bug to triage.

## Solution Space

**Shape:** single

### Recommendation

**Edit 1 — `plan_topics/v5-untyped-queries.md`, V5f, append to Tests bullet (single sentence):**

> A panic raised inside `${expr}` (e.g. OOB index, null-access, non-exhaustive `match`) inside a `let _ = @\`...\`` propagates out of the discard form rather than being absorbed; assert via a synthetic `${arr[i]}` with `i` out of bounds and a synthetic `${match x { … }}` whose value falls outside the arms.

**Edit 2 — `plan_topics/v18-cancellation.md`, the new always-log runtime event channel leaf added by the sibling finding "Runtime event channel / always-log set wholly absent from the plan".** That leaf is the structural home for runtime emission semantics and must include the following discard-specific Tests bullets in addition to the always-log set / `?`-propagation / payload coverage the sibling specifies:

> - `let _ = @\`...\`` whose query returns `Err` of an always-log kind emits exactly one `loom-system-note` with `display: false`, `details: { event: RuntimeEvent }` whose `kind` / `code` / `message` match the `Err` and whose `query_site` resolves to the source location of the `let _ =` (not of the inner `@`-template).
> - The `void`-tail-expression form (`fn f() -> void { @\`...\` }`) emits the same event with the same `display: false` shape; the `query_site` resolves to the tail expression's source location.
> - `let _ = @\`...\`` whose query returns `Ok` emits zero events.
> - A discarded `Err` whose underlying query consumed N tool-call iterations and M schema-validation coercion follow-ups still emits exactly one event (assert with N=3, M=2 against fakes); the `attempts` field on the terminal event reflects the coercion count.
> - The four excluded kinds (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`) do not emit through the discard form either — discarding does not promote them into the always-log set.

**Edit 3 — `plan_topics/coverage-matrix.md`:** add the new V18 leaf to the `Query — failure modes (\`QueryError\`)` row and the `Pi Integration Contract` row. The `Query — untyped` row already cites V5f and needs no change.

**Edit 4 — `plan_topics/v18-cancellation.md`, V18m Deps:** add the new always-log leaf so panic-routing tests can rely on the runtime event preceding the user-facing system note (per [Pi Integration Contract — Runtime event channel](../../../spec_topics/pi-integration-contract.md): "panics emit through the existing `details: { diagnostics: [...] }` shape … **before** the panic system note is rendered").

Implementer edge cases to watch:

- The `query_site` location for the void-tail form must point at the tail expression itself, not at the enclosing function header — operators reading the log need the call site, not the declaration site.
- The deduplication key from spec is `(kind, query_site, message)`; a discard inside a `for` loop firing the same `transport` failure twice is two distinct occurrences (different iteration, same site) — assert this is two events, not one.
- The panic-through-discard test must assert the panic surfaces at the discard's enclosing frame's panic-routing surface (V18m or V18n depending on origin), not that it becomes a `RuntimeEvent`.

## Related Findings

- "Runtime event channel / always-log set wholly absent from the plan" — co-resolve (the new V18 leaf created there is the home for Edits 2–4 above; this finding contributes the discard-specific Tests bullets and the panic-propagation rider on V5f)
- "`loom-system-note` delivery fallback chain unasserted" — same-cluster (touches the same `loom-system-note` channel; the fallback chain must apply to `display: false` discard events too, but resolves independently)
- "V18i per-kind formatter: catch-all row, `last_tool_name=null`, chain recursion unasserted" — same-cluster (V18i is the `display: true` branch of the same channel; resolves independently)
- "M requires `loom-system-note` channel that V18h introduces" — same-cluster (an ordering issue on the same channel infrastructure, independent of discard semantics)

---

# `ContextOverflowError` provider-error mapping has no closing leaf

**Source:** docs/reviews/plan-review/plan-20260505-083349.md
**Original heading:** Provider error mapping for `ContextOverflowError` — no test leaf
**Kind:** spec-coverage

## Finding

V5g introduces the `context_overflow` variant of `QueryError` but its Tests bullet asserts only that the variant is constructible and that `match`-on-`kind` works. Nothing in V5g — or anywhere else under `plan_topics/` — exercises the runtime path that *produces* a `ContextOverflowError` from a provider response. A `grep -rn 'context_overflow\|ContextOverflow\|overflow' plan_topics/` returns mentions only in V5g's union declaration, V13f's coercion-short-circuit rule, and V13f's compositional Tests; no leaf maps a provider error envelope to the variant.

The spec, by contrast, is dense with normative detection rules. `pi-integration-contract.md` carries a four-row "Provider error mapping" table giving the exact overflow signature for `anthropic-messages`, `openai-completions`, `mistral`, and `amazon-bedrock`, plus the rule that "every other 4xx/5xx response and every network-level failure maps to `TransportError`." `query.md`'s "Detection of `ContextOverflowError`" section adds three further rules: HTTP 200 with an error envelope must be recognised by inspecting the body (not status alone); recognised payloads with no token-count fields surface `tokens_used: null, tokens_limit: null`; and a streamed response truncated mid-emission because the *output* hit the context boundary classifies as `context_overflow` at end-of-stream (not `validation`), with `raw_response` set to the partial text.

None of these detection rules has a closing leaf. The coverage matrix row "[Pi Integration Contract] → M, V12a, V14a–V14j, V18f, V18g, V18h" lists no leaf that asserts the provider-mapping table, so the V18o gate would pass vacuously.

## Plan Documents

- `plan_topics/v5-untyped-queries.md` — `## V5g — QueryError union — initial variants` and a new sibling section (edited)
- `plan_topics/coverage-matrix.md` — `Pi Integration Contract` row (edited)
- `plan.md` — vertical-slice index (read-only)

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Provider error mapping" table (read-only)
- `spec_topics/query.md` — "Detection of `ContextOverflowError`" section (read-only)
- `spec_topics/errors-and-results.md` — `ContextOverflowError` schema (read-only)

## Affected Leaves

**Phases:** Vertical V5

**Leaves (implementation order):**

- V5g — `QueryError` union — initial variants — (modified)
- `<new>` — Provider error mapping for `ContextOverflowError` — (added)

## Consequence

**Severity:** correctness

Two reasonable implementers of V5g will produce divergent runtimes: one will wire the four per-provider signatures into the response-classifier; the other will ship V5g with `context_overflow` constructible but never produced (the variant is dead code until some later leaf adds detection — and no later leaf does). Worse, the V18o coverage gate cannot catch this: the spec's "Provider error mapping" rule has no asserting leaf, so the matrix mechanically reports green while the runtime silently classifies every overflow as `transport`.

## Solution Space

**Shape:** single

### Recommendation

Add a new leaf `<new>` (suggested ID `V5g.1`) to `plan_topics/v5-untyped-queries.md` immediately after V5g, with the following body:

- **Spec.** [Pi Integration Contract — Provider error mapping](../spec_topics/pi-integration-contract.md), [Query — Detection of `ContextOverflowError`](../spec_topics/query.md).
- **Adds.** Provider-error classifier mapping recognised overflow envelopes to `ContextOverflowError`; all other 4xx/5xx and network-level failures map to `TransportError`. Classifier inspects response body for the HTTP-200-with-error-envelope case. Token counts populated from provider payload digits when present, `null` otherwise. End-of-stream classification step runs even on mid-stream truncation; partial assistant text captured in `raw_response`.
- **Tests.** One Tests bullet per provider signature (synthesised provider error matching the spec table → `ContextOverflowError` with provider-supplied `tokens_used`/`tokens_limit` when the envelope carries them, both `null` for `mistral` and `amazon-bedrock`); HTTP 200 with `openai-completions` `error.code: "context_length_exceeded"` body envelope recognised (not classified as success); recognised overflow payload lacking digits → `tokens_used: null, tokens_limit: null`; mid-stream truncation triggered by output hitting the context boundary → `Err({kind: "context_overflow", raw_response: "<partial>", ...})` at end-of-stream (not `validation`); a non-overflow 4xx and a generic 5xx → `TransportError`.
- **Deps.** V5g.
- **Ships when.** Every V1-supported provider's overflow envelope round-trips to `ContextOverflowError`; non-overflow provider failures fall through to `TransportError`.

Edits to existing files:

- `plan_topics/v5-untyped-queries.md` — insert the new section between V5g and V5f's sibling order point per the conventions; do not edit V5g's own Tests bullet (V5g remains the union-shape leaf, the new leaf is the detection leaf).
- `plan_topics/coverage-matrix.md` — append the new leaf ID to the `[Pi Integration Contract]` row: `M, V12a, V14a–V14j, V18f, V18g, V18h, <new>`.

Edge cases the implementer must watch:

- The four signatures are version-coupled to `@mariozechner/pi-ai`; the spec mandates re-validation on each upgrade. Tests must use synthesised envelopes shaped exactly per the table, not live provider calls.
- The `openai-completions` row covers both the HTTP 400 form and the HTTP 200 envelope form — both must be asserted.
- Mid-stream classification interacts with cancellation; this leaf scopes to overflow-truncation only. Cancellation-mid-stream is V18a–V18e.

## Related Findings

- "`ModelToolError` forward-referenced in plan but no leaf implements it" — same-cluster (sibling defect: a `QueryError` variant declared by V5g's union but never produced by any leaf; same shape of fix — add a detection leaf)
- "QueryError variant names inconsistently use wire kind strings vs. type names" — same-cluster (touches V5g's leaf prose; resolve independently)
- "Runtime event channel / always-log set wholly absent from the plan" — decision-dependency (the always-log set excludes `context_overflow`; the new leaf's Tests must assert zero `RuntimeEvent` emissions when an overflow is detected, which presumes that finding's leaf exists)
- "Closed diagnostic registry — many codes have no asserting plan leaf" — same-cluster (same class of coverage gap, distinct surface)
