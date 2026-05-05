# pi-loom — Consolidated Plan Review

_Generated: 2026-05-05T08:11:29Z_
_Source: docs/reviews/plan-review/plan-20260505-083349.md_
_21 findings retained, 3 false positives dropped, 0 persistent failures_

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

