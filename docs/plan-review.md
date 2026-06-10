# Triaged Plan Review — plan

_Generated: 2026-06-10T06:20:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T32) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blockers, 0 high, 2 medium retained; 18 low discarded; 3 low findings merged into 1 medium finding; 5 NIT dropped; 0 false dropped. One verbatim duplicate (a re-pasted V6b finding under the V11d section) was de-duplicated into T12._

---

# T01 — Slice-ordering narrative overpromises DAG order and hides the V9/V11 interleave and the V9h→V18c backward edge

**Original headings:**
- Slice numbering is not a valid topological order
- V9 / V11 interleave obscured by slice grouping
- V9h → V18c reaches the final slice from mid-plan

**Original section:** plan.md — slice ordering & narrative
**Kind:** ordering
**Importance:** medium
**Score:** 20
**MustFix:** false

## Finding

`plan.md`'s "Vertical slices" intro (line 46) states "Order slices by their dependency DAG; non-linear deps are stated in each leaf's **Deps** field." Read literally this asserts the numeric slice sequence (`V1` → `V18`, and the lettered leaves within) is a topological order of the dependency DAG. It is not: many leaves declare a dependency on a higher-numbered slice — confirmed backward edges include `V1a` → `V7a`, `V4e` → `V9a`/`V6a`/`V11f`, `V2b`/`V2c` → `V5d`, and the longest reach, `V9h` → `V18c` (session-only degraded state depending on the very last leaf of the last slice). `conventions.md` §3 is already more honest about the same fact ("**roughly** ordered by their dependency DAG", "Reorder freely as long as the deps DAG is respected"); the flat imperative in `plan.md` is more absolute than reality and than its own conventions page.

Two specific, counterintuitive cases compound the general claim. (a) **V9/V11 interleave:** the index lists `V9 — Extension host integration` (`V9a`…`V9j`) as a contiguous block immediately followed by `V11 — Binder`, but the leaf `Deps` interleave the two — `V11a` depends on `V9b` and is itself a prerequisite of `V9c`/`V9i`/`V9j`, so `V11a` lands between `V9b` and the rest of V9, not after all of V9. (b) **V9h → V18c:** `V9h` (and therefore `V9g`) cannot be picked up until the entire `V18` SDK-gate cluster has landed, the longest backward edge in the plan, while the narrative presents `V9` long before `V18`.

Nothing breaks at build time: the DAG is acyclic and the canonical pick-next rule is dep-driven (How-to-use step 3 — "Pick the next leaf whose **Deps** are satisfied"), not numeric. The defect is editorial: a reader sequencing by slice number is misled by the backward edges and by the contiguous-block presentation.

## Plan Documents

- `docs/plan.md` — "Vertical slices" intro (line 46); `### V9 — Extension host integration` and `### V11 — Binder` section headers; the `### V9` / `### V18` section ordering (edited)
- `docs/plan_topics/conventions.md` — §3 "Vertical slices" / slice-ordering rule ("Slices are roughly ordered by their dependency DAG") (read-only — the canonical, already-correct wording the fix aligns to)
- `docs/plan_topics/V9h-degraded-unknown-reason.md`, `docs/plan_topics/V9g-session-shutdown.md`, `docs/plan_topics/V18a-capability-inventory.md`, `docs/plan_topics/V18b-inventory-audit.md`, `docs/plan_topics/V18c-version-bump-checklist.md` — `Deps.` fields establishing the backward edges (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** V9 (Extension host integration), V11 (Binder), V18 (Build-time SDK gates)

**Leaves (implementation order):**

None — the fix is confined to cross-cutting `plan.md` prose and the `### V9` / `### V11` section headers. The backward-edge leaves (`V1a`, `V2b`, `V2c`, `V4e`, `V9c`, `V9g`, `V9h`, `V9i`, `V9j`, `V11a`, `V11b`, `V18a`–`V18c`, et al.) are read to establish the inconsistency; their `Deps` fields are correct and unchanged by the recommended fix.

## Consequence

**Severity:** cosmetic

A reader who trusts the "Order slices by their dependency DAG" claim and sequences by slice number hits unsatisfied `Deps` (e.g. starting `V9c`/`V9i`/`V9j` before `V11a`, or `V9h`/`V9g` before the `V18` cluster). Build correctness is not at risk because the dep-driven pick-next rule (How-to-use step 3) governs actual ordering; the harm is reader confusion, wasted sequencing effort, and an internal contradiction between `plan.md` and `conventions.md`.

## Issue introduction

**Verdict:** multi-commit-interaction (partial — violating evidence is untracked)
**Introducing commits:** `15f69aa` ("pi-loom plan: finish scaffold/template re-pivot from commit 657ee76", 2026-05-26) for the contradictory `plan.md` DAG-ordering prose claim.
**History:** The plan corpus is git-tracked, but only `plan.md`, `conventions.md`, `coverage-matrix.md`, and `leaf-template.md` are committed — the per-leaf files under `docs/plan_topics/` (`V9*`, `V11*`, `V18*`, etc.) are currently untracked, so the backward-edge `Deps` that demonstrate the violation cannot be dated. On the tracked side: the initial plan (`288f191`) described slice grouping only as "editorial only," with no DAG-ordering claim; the absolute claim "Order slices by their dependency DAG" was added to `plan.md` at `15f69aa`, where `conventions.md` already carried the softer, correct "roughly ordered … Reorder freely" wording. The current per-leaf-file plan structure (including the V9/V11 interleave and the `V9h`→`V18c` edge) was authored wholesale in the present uncommitted rewrite. The contradiction therefore emerges from the `15f69aa` prose change interacting with later (untracked) leaf authoring; the V9/V11 and `V9h`→`V18c` halves are co-original with the current structure and have no separate introducing commit.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan.md`, strike the sentence "Order slices by their dependency DAG; non-linear deps are stated in each leaf's **Deps** field." from the "Vertical slices" intro (line 46) and replace it with wording matching the already-correct framing in `conventions.md` §3: slice numbering is an editorial grouping that only roughly tracks the dependency DAG; the canonical build order is dep-driven (pick the next leaf whose **Deps** are satisfied — How-to-use step 3), not numeric; and backward / non-linear cross-slice dependencies are expected and are declared per-leaf in each leaf's **Deps** field.

Add the two specific signposts at the exact spots a reader is misled:

- Under `### V9 — Extension host integration`, a note that V9 and V11 interleave — naming the actual seam leaves (`V9b → V11a → V9j`/`V9i`/`V9c`), so `V11a` is flagged as a mid-V9 prerequisite — and a note that `V9h` (and therefore `V9g`) depend on `V18c` from the `V18` SDK-gate slice and cannot be picked up until that cluster lands. Mirror a complementary interleave note under `### V11 — Binder`.

Align `plan.md` to `conventions.md` (read-only for this fix; do not weaken or duplicate the conventions wording). Do not reorder or renumber slices: slice IDs are referenced pervasively across leaf `Deps` fields, and edges like `V9h` → `V18c` cannot be removed without restructuring the dependency graph itself.

## Relationships

None
