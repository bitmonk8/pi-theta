# Triaged Spec Review — spec.md

_Generated: 2026-05-08T09:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding in the file (T22b, after the 2026-05-11 reshape-extract pass excised T22a to `spec-review-needs-reshape.md`) is addressed first; the first finding in the file (T02, after the 2026-05-11 spec-sweeps extraction) is addressed last in addressing order. After the reshape pass, split children replace their parents at the parent's file position; addressing within a child cluster runs alphabetically (a addressed first)._

_Triage tally: 9 high, 24 medium retained; 38 low discarded; 0 low findings merged into 0 medium findings; 0 nit dropped; 0 false dropped. (Updated 2026-05-11 manual T03 split: +5 medium for the additional T03b–T03f children replacing the original T03; T03 was importance:medium, all six children inherit medium.) (Updated 2026-05-11 reshape-extract pass: T22a parked to `docs/spec-review-needs-reshape.md` per criterion 4 — verbatim-source-citation pattern; −1 medium.) (Updated 2026-05-12: T19e resolved into PIC Runtime event channel concurrent-sibling emission timing paragraph; −1 high.) (Updated 2026-05-12: T20 resolved into Implementation Notes no-invocation-cap disclaimer; −1 medium.) (Updated 2026-05-12: T21 resolved into PIC; −1 medium.) (Updated 2026-05-12: T19d resolved into PIC Per-invocation operator visibility and Diagnostics cancelled-by-session-shutdown row payload; −1 high.)_

_Decision tally (recorded 2026-05-08): all 18 `Shape: multiple` findings resolved to `Shape: single`. 6 findings merged at decision time: T17→T24, T28→T27, T29→T30, T31→T32, T33→T03, T45→T44. See per-finding **Decision** / **STATUS** lines._

_Reshape pass (2026-05-11, mode `reshape-only`, `PreserveIDs: true`): T01 and T04 extracted into [`docs/spec-sweeps.md`](./spec-sweeps.md) as deferred mechanical sweeps that cannot be addressed atomically by the per-finding fix-loop; T03 flagged UNSPLITTABLE (composite-3+ with no enumerable Edit Plan in its Recommendation blocks); T11 split into T11a/b/c (must-precede chain); T15 split into T15a/b/c (co-resolve cluster); T16 split into T16a/b/c/d (co-resolve cluster); T18 split into T18a/b/c/d (T18a must-precede the rest)._

_Second reshape pass (2026-05-11, mode `reshape-only`, `PreserveIDs: true`, re-run with broadened splitter logic): T08 split into T08a/b/c (co-resolve cluster — three per-file prose sweeps via splitter location (v) `(file, verb)` prose pairs); T19 split into T19a/b/c/d/e (co-resolve cluster — five entries from chosen Option A's `Spec edits` block via splitter location (iv)). T03 re-flagged UNSPLITTABLE with refreshed diagnostic — under current splitter logic Option B's `Spec edits` block enumerates 3 bullets (one no-op, one composite-2), and the Decision-block-level *Absorbed T33 Option A spec edits* bullets are not captured by any source location, so a clean mechanical split would strand 3 of the 6 effective edits._

_Manual T03 reshape (2026-05-11): T03 split into T03a/b/c/d/e/f (must-precede chain plus same-cluster siblings). The split consolidates Option B's chosen `**Spec edits.**` bullets and the Decision-block's *Absorbed T33 Option A spec edits* bullets into a unified 6-edit set; pairwise dependencies make T03a (PIC sub-paragraph addition) and T03b (`SDK_SURFACE_INVENTORY` row) the cluster roots, T03c/d/e/f the dependents. The T33 absorption metadata is preserved via the `**Split from:**` field on each child._

_Reshape-extract pass (2026-05-11): T22a excised to [`docs/spec-review-needs-reshape.md`](./spec-review-needs-reshape.md) — divergence criterion 4 (verbatim-source-citation pattern alongside existing paraphrase; confirmed divergence case from divergence-analysis.md). T22b and T22c remain in file but are blocked pending T22a resolution. 1 medium finding parked._

# T02 — Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph

**Original heading:** Subagent state-isolation detail misplaced in Overview
**Original section:** docs/spec.md — Overview
**Kind:** placement
**Importance:** medium

## Finding

The opening orientation paragraph of `docs/spec.md` (the prose immediately under `## Overview`, before the `<a id="terminal-outcomes-aggregator">` paragraph) embeds a parenthetical enumeration of the subagent-mode state-isolation contract: it lists what the spawned session inherits from the loom's frontmatter, what is forwarded from the caller's `ExtensionCommandContext`, and what is *not* inherited from the caller — naming five specific axes (`transcript`, `system prompt`, `ambient tool set`, `cancellation controller`, caller's `params` and `bindings`).

This enumeration is the canonical content of the **Subagent state-isolation matrix** that already lives at `docs/spec_topics/pi-integration-contract.md#subagent-state-isolation-matrix` — a three-column table whose explicit purpose is "the canonical enumeration of what the spawned session inherits…". The same Overview sentence already forward-links to that matrix. Restating the axes inline duplicates owner-page content in an aggregator (against the convention recorded at `governance.md` GOV-12) and creates a stale-reference risk: any future change to the matrix's column membership (e.g. the `bind_context: session` seam adding a forwarded axis) must be mirrored in two places. The duplication also triggers two adjacent naming-consistency findings on this same paragraph — `ambient tool set` vs the Session model's `tools:` table, and the cancellation-forwarding fan-in vs the Session model's per-invocation framing — that disappear if the parenthetical is removed.

The product description and the mode contrast (prompt mode drives the caller's conversation; subagent mode drives a separate one) are the right level for the orientation paragraph. The five-axis enumeration is not.

## Spec Documents

- `docs/spec.md` — Overview, first paragraph (edited)
- `docs/spec_topics/pi-integration-contract.md` — `subagent-state-isolation-matrix` section (read-only)
- `docs/spec_topics/governance.md` — GOV-12 (aggregator-vs-source lock-step) (read-only)

## Plan Impact

**Phases:** Horizontal H6.

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)

H6 already retargets every `spec.md`-introduction link whose target is a non-narrative-page section anchor (the matrix's `#subagent-state-isolation-matrix` is one such anchor) to a `PIC-N` REQ-ID anchor. Deleting the parenthetical removes one of the link sites H6 must rewrite; the leaf's tests are unaffected.

## Consequence

**Severity:** advisory

A reader of the Overview gets a five-axis list that omits at least one axis the PIC matrix carries (the matrix populates three full columns; the parenthetical names five items, not aligned to the column structure), and any future seam that touches the matrix must edit two places to stay synchronized. Implementers can still produce a correct subagent-mode wiring by reading PIC; the cost is documentation drift and extra work for the H6 link-rewrite pass and for every later edit to the matrix.

## Solution Space

**Shape:** single

### Recommendation

In `docs/spec.md`'s Overview first paragraph, delete the parenthetical `— what the spawned session inherits from the loom's frontmatter, what is forwarded from the caller's ExtensionCommandContext, and what is *not* inherited from the caller (transcript, system prompt, ambient tool set, cancellation controller, caller's params and bindings) —` and reduce the surrounding sentence to a one-line orientation pointer:

> The state-isolation contract for subagent invocation is enumerated in [Pi Integration Contract — Subagent state-isolation matrix](./spec_topics/pi-integration-contract.md#subagent-state-isolation-matrix); the *callable set* concept that matrix references is defined in [Glossary — `callable set`](./spec_topics/glossary.md).

Edge cases for the implementer:

- Keep the existing forward-link target unchanged so the H6 link-retarget pass still has a single edit to make (PIC anchor → `PIC-N` REQ-ID anchor at H6 land time).
- Do not migrate the deleted axis names into PIC. The matrix already covers them; restating them as PIC prose would introduce a new aggregator/owner duplication on the PIC side.
- The terminal-outcomes paragraph that immediately follows is a separate placement issue (see related findings) and is not in scope for this fix.
- The `callable set` glossary pointer is load-bearing for PIC's matrix prose and must be retained.

## Relationships

- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster (broader pattern of misplaced detail in the Overview/Orientation prose).
- T26 "Terminal-outcomes paragraph in Overview restates routing taxonomy owned by Errors and Results" — same-cluster (sibling Overview placement issue).

---

# T03f — `h1-scaffold.md` manifest assertion: anchor at the new PIC sub-paragraph; extend `engines.node` literal-read test to cross-package equality

**Original heading:** `semver` not declared as a dependency
**Original section:** docs/spec.md — Orientation > Prerequisites > Host runtime
**Split from:** "T03 — `semver` dependency obligation buried in a non-normative recipe paragraph" (entry 6 of 6; manual reshape 2026-05-11; T33 absorbed-edit list consolidated with Option B's chosen-edit list into a unified 6-edit Edit Plan)
**Kind:** assumptions, traceability
**Importance:** medium
**Atomicity:** atomic

## Finding

H1's `package.json` `dependencies` literal-read assertion currently references the recipe parenthetical in PIC; once T03a installs the dedicated `**Loom-package implementation dependencies (V1).**` sub-paragraph, the assertion's spec anchor must move there and pin the version literal stated in that sub-paragraph (`semver`: `^7.0.0`, `@types/semver` in `devDependencies` not `dependencies`). Separately, T03b adds an `{ kind: "pi-engines-node", literal: ">=20.6.0" }` row to `SDK_SURFACE_INVENTORY` so the four pinned constants the probe consumes plus the cross-package floor share one source of truth — once that row is in place, the `engines.node` literal-read test (or a sibling assertion in `test/extension/pinned-surface.test.ts`) must be extended to import `@mariozechner/pi-coding-agent/package.json` (via `require.resolve(...)` plus `JSON.parse(readFileSync(...))`, or a `with { type: "json" }` import) and assert `pi.engines.node === loom.engines.node` literally.

## Spec Documents

- `docs/plan_topics/h1-scaffold.md` — (edited)
- `docs/spec_topics/pi-integration-contract.md` — (read-only)
- `test/extension/pinned-surface.test.ts` — (read-only (referenced))

## Plan Impact

**Phases:** Horizontal H1

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

The H1 leaf already adds `semver` and `@types/semver` and asserts the `dependencies` entry in its manifest test; this finding is one of six children sharing that leaf-touch, with all six landing in coordinated commits (must-precede chain plus same-cluster siblings).

## Consequence

**Severity:** advisory

This finding is one atomic edit in the 6-edit consolidation that resolves the parent T03 (`semver` dependency obligation buried in a non-normative recipe paragraph). The parent's full consequence applies to the cluster as a whole; this child's slice contributes the specific surface listed in **Spec Documents** above.

## Solution Space

**Shape:** single
**Atomicity:** atomic

**Edit Plan:**
1. docs/plan_topics/h1-scaffold.md — see **Recommendation** below. (one self-contained edit; 0 new IDs/anchors/sections beyond what is named in the recommendation)

### Recommendation

Update `docs/plan_topics/h1-scaffold.md` to (a) anchor the `dependencies["semver"]` and `devDependencies["@types/semver"]` manifest assertions at PIC's new `**Loom-package implementation dependencies (V1).**` sub-paragraph (added by T03a), and (b) extend the `engines.node` literal-read test to also import `@mariozechner/pi-coding-agent/package.json` via `require.resolve(...)` (so workspace and pnpm hoisting layouts both work — do NOT hard-code a `node_modules/...` path), parse the JSON, and assert string equality between `pi.engines.node` and the loom literal. Compare strings literally, not via `semver.subset` — the contract is exact-equality, matching H1's existing posture on `engines.node` and `peerDependencies`. The `pi-engines-node` row added to `SDK_SURFACE_INVENTORY` by T03b is the single source of truth the assertion consumes.

## Relationships

- T03a "Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`" — must-follow (this finding anchors at the sub-paragraph T03a installs).
- T03b "Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`" — must-follow (this finding consumes the row T03b adds).

---

# T03e — Update `spec.md` Host runtime item 1: rephrase to delegate the `engines.node`-equality check to the H1 SDK surface-inventory test

**Original heading:** `semver` not declared as a dependency
**Original section:** docs/spec.md — Orientation > Prerequisites > Host runtime
**Split from:** "T03 — `semver` dependency obligation buried in a non-normative recipe paragraph" (entry 5 of 6; manual reshape 2026-05-11; T33 absorbed-edit list consolidated with Option B's chosen-edit list into a unified 6-edit Edit Plan)
**Kind:** consistency, traceability
**Importance:** medium
**Atomicity:** atomic

## Finding

`spec.md`'s Orientation > Prerequisites > Host runtime item 1 currently reads "matching `@mariozechner/pi-coding-agent`'s `engines.node` floor". This phrasing implies a manual or coincidental match between the loom package's Node floor and Pi's Node floor with no audit. T03b adds a `pi-engines-node` row to H1's `SDK_SURFACE_INVENTORY` and T03f extends the literal-read test to assert cross-package equality, so the spec sentence should name the test as the audit mechanism rather than asserting bare equivalence in prose.

## Spec Documents

- `docs/spec.md` — (edited)
- `docs/plan_topics/h1-scaffold.md` — (read-only)

## Plan Impact

**Phases:** Horizontal H1

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

The H1 leaf already adds `semver` and `@types/semver` and asserts the `dependencies` entry in its manifest test; this finding is one of six children sharing that leaf-touch, with all six landing in coordinated commits (must-precede chain plus same-cluster siblings).

## Consequence

**Severity:** advisory

This finding is one atomic edit in the 6-edit consolidation that resolves the parent T03 (`semver` dependency obligation buried in a non-normative recipe paragraph). The parent's full consequence applies to the cluster as a whole; this child's slice contributes the specific surface listed in **Spec Documents** above.

## Solution Space

**Shape:** single
**Atomicity:** atomic

**Edit Plan:**
1. docs/spec.md — see **Recommendation** below. (one self-contained edit; 0 new IDs/anchors/sections beyond what is named in the recommendation)

### Recommendation

In `docs/spec.md` Orientation > Prerequisites > Host runtime item 1, replace the phrase "matching `@mariozechner/pi-coding-agent`'s `engines.node` floor" with "verified equal to `@mariozechner/pi-coding-agent`'s `engines.node` floor by the H1 SDK surface-inventory test." No other change to the orientation aggregator — the rest of item 1 stands.

## Relationships

- T03b "Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`" — must-follow (this finding's sentence references the test row T03b adds).
- T03f "`h1-scaffold.md` manifest assertion ..." — same-cluster (the test extension T03f installs is what the new sentence delegates to).

---

# T03d — Update PIC Pi version-bump procedure step 3: replace manual-compare instruction with H1-test-fails-red narrative

**Original heading:** `semver` not declared as a dependency
**Original section:** docs/spec.md — Orientation > Prerequisites > Host runtime
**Split from:** "T03 — `semver` dependency obligation buried in a non-normative recipe paragraph" (entry 4 of 6; manual reshape 2026-05-11; T33 absorbed-edit list consolidated with Option B's chosen-edit list into a unified 6-edit Edit Plan)
**Kind:** consistency, prescription
**Importance:** medium
**Atomicity:** atomic

## Finding

PIC's Pi version-bump procedure step 3 currently instructs the contributor to manually compare loom's Node floor against Pi's `engines.node` field at bump time. Once T03b's `SDK_SURFACE_INVENTORY` row plus T03f's cross-package equality assertion are in place, that manual compare is obviated — H1's test fails red automatically when the upstream floor moves, and the bump-procedure narrative should describe that automatic detection rather than prescribing a manual check that contradicts it.

## Spec Documents

- `docs/spec_topics/pi-integration-contract.md` — (edited)

## Plan Impact

**Phases:** Horizontal H1

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

The H1 leaf already adds `semver` and `@types/semver` and asserts the `dependencies` entry in its manifest test; this finding is one of six children sharing that leaf-touch, with all six landing in coordinated commits (must-precede chain plus same-cluster siblings).

## Consequence

**Severity:** advisory

This finding is one atomic edit in the 6-edit consolidation that resolves the parent T03 (`semver` dependency obligation buried in a non-normative recipe paragraph). The parent's full consequence applies to the cluster as a whole; this child's slice contributes the specific surface listed in **Spec Documents** above.

## Solution Space

**Shape:** single
**Atomicity:** atomic

**Edit Plan:**
1. docs/spec_topics/pi-integration-contract.md — see **Recommendation** below. (one self-contained edit; 0 new IDs/anchors/sections beyond what is named in the recommendation)

### Recommendation

In `docs/spec_topics/pi-integration-contract.md` Pi version bump procedure step 3, replace the manual-compare instruction with: "the H1 cross-package `engines.node` test fails red at the bump commit if the upstream floor has moved; update the loom literal, Step 0 (a), and the spec.md sentence in the same edit." The narrative MUST be updated in the same commit as T03f's test extension; otherwise PIC and the test diverge on which side is authoritative.

## Relationships

- T03b "Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`" — must-follow (the test row this finding's narrative names is added by T03b).
- T03f "`h1-scaffold.md` manifest assertion ..." — same-cluster (the test extension T03f installs is what this narrative delegates to).

---

# T03c — Trim dependency-pinning parentheticals from PIC's two `*Recommended recipe (non-normative).*` paragraphs

**Original heading:** `semver` not declared as a dependency
**Original section:** docs/spec.md — Orientation > Prerequisites > Host runtime
**Split from:** "T03 — `semver` dependency obligation buried in a non-normative recipe paragraph" (entry 3 of 6; manual reshape 2026-05-11; T33 absorbed-edit list consolidated with Option B's chosen-edit list into a unified 6-edit Edit Plan)
**Kind:** cruft, consistency
**Importance:** medium
**Atomicity:** atomic

## Finding

Both `*Recommended recipe (non-normative).*` paragraphs in PIC (Step 0 (a) Node-floor check; Step 0 (d) peer-dep range check) currently end with the parenthetical "pinned by H1 as a direct production dependency of the loom package". Once T03a installs the dedicated `**Loom-package implementation dependencies (V1).**` sub-paragraph, that obligation lives in its own structural unit and the recipe parentheticals become redundant — and worse, contradictory, because the recipes simultaneously promise "a future swap to a different SemVer implementation (or a hand-rolled comparator) is permitted".

## Spec Documents

- `docs/spec_topics/pi-integration-contract.md` — (edited)

## Plan Impact

**Phases:** Horizontal H1

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

The H1 leaf already adds `semver` and `@types/semver` and asserts the `dependencies` entry in its manifest test; this finding is one of six children sharing that leaf-touch, with all six landing in coordinated commits (must-precede chain plus same-cluster siblings).

## Consequence

**Severity:** advisory

This finding is one atomic edit in the 6-edit consolidation that resolves the parent T03 (`semver` dependency obligation buried in a non-normative recipe paragraph). The parent's full consequence applies to the cluster as a whole; this child's slice contributes the specific surface listed in **Spec Documents** above.

## Solution Space

**Shape:** single
**Atomicity:** atomic

**Edit Plan:**
1. docs/spec_topics/pi-integration-contract.md — see **Recommendation** below. (one self-contained edit; 0 new IDs/anchors/sections beyond what is named in the recommendation)

### Recommendation

In `docs/spec_topics/pi-integration-contract.md`, drop the parenthetical "pinned by H1 as a direct production dependency of the loom package" from both `*Recommended recipe (non-normative).*` paragraphs (the Step 0 (a) Node-floor recipe and the Step 0 (d) peer-dep range recipe). Leave the rest of each recipe intact — the comparator-contract framing and the future-swap escape hatch are still load-bearing for the recipe's stated purpose.

## Relationships

- T03a "Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`" — must-follow (the sub-paragraph T03a adds is what these parentheticals become redundant with).

---

# T03b — Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`

**Original heading:** `semver` not declared as a dependency
**Original section:** docs/spec.md — Orientation > Prerequisites > Host runtime
**Split from:** "T03 — `semver` dependency obligation buried in a non-normative recipe paragraph" (entry 2 of 6; manual reshape 2026-05-11; T33 absorbed-edit list consolidated with Option B's chosen-edit list into a unified 6-edit Edit Plan)
**Kind:** completeness, traceability
**Importance:** medium
**Atomicity:** atomic

## Finding

H1's `SDK_SURFACE_INVENTORY` currently enumerates the four pinned constants the capability probe consumes. T03f extends the test infrastructure to assert cross-package `engines.node` equality between the loom literal and Pi's `engines.node` field — but for that assertion to share its source of truth with the rest of the surface inventory (rather than living as a one-off test), the inventory needs a corresponding row.

## Spec Documents

- `docs/plan_topics/h1-scaffold.md` — (edited)

## Plan Impact

**Phases:** Horizontal H1

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

The H1 leaf already adds `semver` and `@types/semver` and asserts the `dependencies` entry in its manifest test; this finding is one of six children sharing that leaf-touch, with all six landing in coordinated commits (must-precede chain plus same-cluster siblings).

## Consequence

**Severity:** advisory

This finding is one atomic edit in the 6-edit consolidation that resolves the parent T03 (`semver` dependency obligation buried in a non-normative recipe paragraph). The parent's full consequence applies to the cluster as a whole; this child's slice contributes the specific surface listed in **Spec Documents** above.

## Solution Space

**Shape:** single
**Atomicity:** atomic

**Edit Plan:**
1. docs/plan_topics/h1-scaffold.md — see **Recommendation** below. (one self-contained edit; 0 new IDs/anchors/sections beyond what is named in the recommendation)

### Recommendation

In `docs/plan_topics/h1-scaffold.md`, add a `{ kind: "pi-engines-node", literal: ">=20.6.0" }` row to `SDK_SURFACE_INVENTORY` so the four pinned constants the probe consumes plus the cross-package floor share one source of truth. The literal MUST match the loom package's `engines.node` floor exactly — when the floor changes, this row is updated in the same commit (the cross-package test added by T03f then exercises the equality).

## Relationships

- T03d "Update PIC Pi version-bump procedure step 3 ..." — must-precede (T03d's narrative names this row).
- T03e "Update `spec.md` Host runtime item 1 ..." — must-precede (T03e's sentence names the test that consumes this row).
- T03f "`h1-scaffold.md` manifest assertion ..." — must-precede (T03f's test extension uses this row as its source of truth).

---

# T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`

**Original heading:** `semver` not declared as a dependency
**Original section:** docs/spec.md — Orientation > Prerequisites > Host runtime
**Split from:** "T03 — `semver` dependency obligation buried in a non-normative recipe paragraph" (entry 1 of 6; manual reshape 2026-05-11; T33 absorbed-edit list consolidated with Option B's chosen-edit list into a unified 6-edit Edit Plan)
**Kind:** assumptions, completeness
**Importance:** medium
**Atomicity:** atomic

## Finding

The spec describes the loom runtime's own production dependency on `semver` only inside the parenthetical of a paragraph it explicitly labels *non-normative* (the two `*Recommended recipe (non-normative).*` paragraphs in PIC). The `**Host prerequisites.**` enumeration immediately above those recipes lists four items (Pi SDK pin, Binder model, Binder credentials, Pi-supplied `AbortSignal`) and does not include `semver`. The plan's `dependencies["semver"]` manifest assertion in `h1-scaffold.md` has nothing to anchor against. The fix is to add a dedicated structural unit that names the V1 implementation choices for the recipe contracts (currently just `semver`) with their version ranges and `package.json` block placement, framed as implementation-choice rather than normative contract — preserving the comparator-swap flexibility the recipes already promise.

## Spec Documents

- `docs/spec_topics/pi-integration-contract.md` — (edited)

## Plan Impact

**Phases:** Horizontal H1

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

The H1 leaf already adds `semver` and `@types/semver` and asserts the `dependencies` entry in its manifest test; this finding is one of six children sharing that leaf-touch, with all six landing in coordinated commits (must-precede chain plus same-cluster siblings).

## Consequence

**Severity:** advisory

This finding is one atomic edit in the 6-edit consolidation that resolves the parent T03 (`semver` dependency obligation buried in a non-normative recipe paragraph). The parent's full consequence applies to the cluster as a whole; this child's slice contributes the specific surface listed in **Spec Documents** above.

## Solution Space

**Shape:** single
**Atomicity:** atomic

**Edit Plan:**
1. docs/spec_topics/pi-integration-contract.md — see **Recommendation** below. (one self-contained edit; 0 new IDs/anchors/sections beyond what is named in the recommendation)

### Recommendation

In `docs/spec_topics/pi-integration-contract.md`, immediately below the existing `**Host prerequisites.**` enumeration, add a new paragraph `**Loom-package implementation dependencies (V1).**` that lists the V1 implementation choices for the recipe contracts. Initially: `semver` with version range `^7.0.0` (or whatever H1 lands on) declared in `dependencies`, and `@types/semver` declared in `devDependencies` (NOT `dependencies` — the type-only companion belongs in dev-deps and the H1 manifest assertion checks the correct block for each). Frame the paragraph as: "V1 ships with `semver` as the chosen comparator implementation; a future spec edit may substitute another implementation" — matching the recipe's existing escape hatch language. State the version range as a literal so the H1 literal-read test asserts against a single source of truth.

## Relationships

- T03c "Trim dependency-pinning parentheticals from PIC's two `*Recommended recipe (non-normative).*` paragraphs" — must-precede (this finding installs the anchor that obviates the parentheticals T03c removes).
- T03f "`h1-scaffold.md` manifest assertion: anchor at the new PIC sub-paragraph ..." — must-precede (T03f's manifest assertion anchors at the sub-paragraph this finding installs).

---

# T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept

**Original heading:** `looms.binderModel` (settings key) vs `bind_model` (frontmatter field) — same concept, different root names
**Original section:** docs/spec_topics/binder.md
**Kind:** naming
**Importance:** medium

## Finding

The concept "the LLM the slash-command argument binder calls" surfaces under three distinct surface conventions that each apply a *different root word*:

- Frontmatter (snake_case): `bind_model`, `bind_context`, `bind_echo` — root `bind_`.
- Settings keys (camelCase, per Pi's settings convention): `looms.binderModel` — root `binder`.
- Diagnostic codes (kebab-case) and section headings / running prose: `loom/load/binder-model-unresolved`, `loom/load/binder-model-not-strict-capable`, `loom/load/binder-model-strict-capability-unknown`, `## Binder model`, `<a id="sdk-cap-binder-llm-model"></a>`, glossary entry `**binder**`, `binder-model resolution failure` — root `binder`.

The per-surface case style (snake / camel / kebab) is governed by clear convention rules already documented in `frontmatter.md` and `discovery.md`, and is not the issue. The issue is the *root-word shortening* `binder` → `bind` that applies inside the frontmatter family but nowhere else, with no rule documenting it. An author who has read the binder topic page (where every reference is "binder model") and then writes frontmatter must know to drop the `er`; an implementer reading `loom/load/binder-model-unresolved` must know that the field the diagnostic asks the author to set is spelled `bind_model`, not `binder_model`. The user-facing remediation hint compounds the cost — it points at *both* spellings in one sentence: ``set 'bind_model:' in frontmatter or 'looms.binderModel' in settings``.

The frontmatter naming convention paragraph in `frontmatter.md` documents the snake_case / hyphen split (Pi-inherited fields keep Pi's hyphens; loom-defined fields use underscores) but is silent on the `binder` → `bind_` shortening. The glossary has an entry for `**binder**` but no entry for `binder model`, so the cross-surface mapping has no canonical anchor.

## Spec Documents

- `docs/spec_topics/glossary.md` — Glossary list (edited)
- `docs/spec_topics/frontmatter.md` — Field contract table; *Naming convention* paragraph; `bind_*` field prose (option-dependent)
- `docs/spec_topics/binder.md` — `## Binder model`; resolution-chain prose (option-dependent)
- `docs/spec_topics/discovery.md` — *Settings file reads* → *Keys read* (option-dependent)
- `docs/spec_topics/diagnostics.md` — `loom/load/binder-model-*` rows; remediation-hint message (option-dependent)
- `docs/spec_topics/pi-integration-contract.md` — `## SDK capability inventory` item 7; anchor `sdk-cap-binder-llm-model`; `modelRegistry` comment (option-dependent)
- `docs/spec_topics/implementation-notes.md` — binder-invocation prose (option-dependent)
- `docs/spec_topics/slash-invocation.md` — short-version paragraph mentioning the resolution chain (option-dependent)
- `docs/spec_topics/future-considerations.md` — `bind_model` → `looms.binderModel` template that the proposed `tool_loop` settings key would mirror (option-dependent)
- `docs/spec_topics/errors-and-results.md` — pre-evaluation failure list, item 4 (read-only)
- `docs/spec.md` — capability inventory bullet 7 (read-only; the prose-side rename is owned by sibling finding *"Binder LLM model" vs "binder model"*)

## Plan Impact

**Phases:** V3, V14, V16

**Leaves (implementation order):**

- V3a — Frontmatter parsing — (modified)
- V14n — Discovery: settings file reads (`looms` array, plus the read mechanism reused by V16e for binder model) — (modified)
- V16e — `bind_model` resolution chain — (modified)

The two test surfaces that name spellings literally are V3a's deferred-frontmatter test (which enumerates `bind_model`, `bind_context`, `bind_echo` verbatim) and V16e's resolution-chain assertions (which name `looms.binderModel`); both update only under Option B. V14n names `looms.binderModel` in its *Adds* prose. Under Option A the leaf bodies remain unchanged in substance.

## Consequence

**Severity:** advisory

Authors must remember a one-letter root-word delta when moving between two adjacent surfaces (frontmatter ↔ settings) that the spec routinely cross-references in a single sentence. No implementer divergence — both spellings are exact strings the runtime matches against — but every author-facing diagnostic and remediation hint that names both surfaces (e.g. `loom/load/binder-model-unresolved`'s remediation message) reads as a typo until the convention is internalised.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A.

### Option A — Document the per-surface mapping; ship the spelling split as-is

**Approach.** Add one glossary entry that pins the concept and explicitly enumerates the per-surface spellings; extend the *Naming convention* paragraph in `frontmatter.md` with one sentence noting that the `bind_*` family of frontmatter fields drops the `-er` from the prose root `binder` (companion exemplars: `bind_model`, `bind_context`, `bind_echo`).

**Spec edits.**
- `glossary.md`: add a `**binder model**` entry (alphabetised between `**binder**` and `**callable set**`) of the form: *"The LLM the binder calls. Configured per-loom by frontmatter field `bind_model:`, with fallback to settings key `looms.binderModel`. Diagnostic codes and prose use the kebab/space form `binder-model` / "binder model" (see `loom/load/binder-model-unresolved`). The `bind_` prefix on the frontmatter field matches sibling fields `bind_context` and `bind_echo` and is not a separate concept. See: [Slash-Command Argument Binding — Binder model](./binder.md), [Discovery — Settings file reads](./discovery.md#settings-file-reads)."*
- `frontmatter.md` *Naming convention* paragraph: append one sentence to the existing snake-case rule: *"Within the binder-related family, the frontmatter prefix is `bind_` (`bind_model`, `bind_context`, `bind_echo`); the corresponding settings key, diagnostic, and prose forms use the longer root `binder` (`looms.binderModel`, `loom/load/binder-model-*`, "binder model")."*
- No changes to wire formats, settings keys, frontmatter field names, or diagnostic codes.

**Pros.**
- Zero churn across the spec corpus and the V3 / V14 / V16 leaves' acceptance criteria.
- Existing diagnostic codes, frontmatter test fixtures, and settings-key constants in already-drafted leaves stay untouched.
- The `bind_*` frontmatter family is internally consistent (three sibling fields all share the same prefix).

**Cons.**
- The mapping must be kept in two places (the glossary entry and the naming-convention paragraph) plus echoed in any remediation hint that names both surfaces.
- Authors still see a one-letter mismatch in remediation messages.

**Risks.** Future binder-related additions (e.g. a hypothetical `bind_seed` or `looms.binderSeedSalt`) inherit the split and the glossary entry must be updated each time.

### Option B — Rename the frontmatter family to `binder_*`

**Approach.** Pre-V1 rename of `bind_model`, `bind_context`, `bind_echo` to `binder_model`, `binder_context`, `binder_echo`, eliminating the root-word delta between frontmatter and the rest of the corpus.

**Spec edits.**
- `frontmatter.md`: rename the three field-contract rows; rename in the *Naming convention* paragraph; rename in the bullet listing the binder-configuration trio.
- `binder.md`: rename in the *Binder model* prose; in the bypass-cases prose (`bind_echo: true` references); in the failure-modes table; and in the *V1 seam — automatic context escalation* note.
- `discovery.md`: rewrite the `looms.binderModel` description to read `binder_model:` for the frontmatter side (the settings key already uses the long root and stays as `looms.binderModel`).
- `diagnostics.md`: rename `bind_model:` references in the `loom/load/binder-model-unresolved` row's *Description* and *Remediation* columns; the diagnostic codes themselves (already `binder-model-*`) do not change.
- `implementation-notes.md`, `slash-invocation.md`, `future-considerations.md`: rename `bind_model:` references.
- `frontmatter.md` *Naming convention* paragraph: re-list the loom-defined snake_case exemplars (`binder_model`, `binder_context`, `binder_echo`, `tool_loop`, etc.).
- Plan leaves V3a, V14n, V16e: rename string literals in *Adds* / *Tests* prose.

**Pros.**
- One root word, one concept; no per-surface mapping to maintain.
- Remediation hints become symmetric (`set 'binder_model:' in frontmatter or 'looms.binderModel' in settings` — only the case style differs, which is the documented per-surface convention).
- Eliminates a recurring author papercut.

**Cons.**
- Touches ≥9 spec topic pages plus three plan leaves; every example `.loom` snippet in the corpus must be re-grepped.
- Spec V1 has not shipped, so this is reversible with no wire-contract impact, but the editorial cost is non-trivial.

**Risks.** Stale `bind_model` references in untouched corners (illustrative examples, README snippets if any) become a rolling cleanup task.

### Recommendation

**Option A.** The split is editorial debt, not a correctness gap; the V1 spec is already late-stage, and the glossary entry plus the one-sentence convention rule reduce the cost of the delta to a single lookup site. Option B's rename touches ≥12 files and three already-drafted plan leaves to retire a one-letter author papercut, with no wire-format or downstream consumer pressure forcing the change. Adopt Option A now; revisit Option B only if a future surface (e.g. CLI flag `--binder-model`) makes the split visible at a fourth surface.

Edge cases the implementer must watch:
- The `**binder**` glossary entry already exists and refers to the *mechanism*, not the *model*; the new `**binder model**` entry is a sibling, not a replacement.
- The `loom/load/binder-model-unresolved` remediation-hint string in `diagnostics.md` is verbatim author-facing and must not be reflowed; if a `See:` link is added, append it after the hint, do not splice it inside.
- `pi-integration-contract.md`'s anchor `sdk-cap-binder-llm-model` is referenced from `spec.md` capability bullet 7; coordinate with future renames there to ensure the rename happens once.

## Relationships

None

---

# T06 — Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers

**Original heading:** Operator role undefined; non-interactive delivery path unstated
**Original section:** docs/spec.md — Orientation (misc / cross-cutting)
**Kind:** assumptions
**Importance:** medium

## Finding

`spec.md` uses *operator* as a first-class failure audience starting at the terminal-outcomes paragraph (line 10, "what an `invoke` parent sees, what a slash caller sees, what the operator observes per channel") and again in the Hard ceilings opening sentence ("addressed to at least one of *loom code*, *the model*, or *the operator*"). Neither site forward-links to a definition; the term is later defined only in `spec_topics/glossary.md`, which binds it tightly to the TUI: "The human running the Pi TUI session that hosts the loom extension … 'operator-facing' means the surface is rendered into the active TUI session via the `loom-system-note` channel." The glossary itself is not on the `Reading order` path and is not referenced from either operator-using site in `spec.md`.

The stronger gap is that the glossary's TUI binding is never reconciled with the call sites the spec already admits exist outside that binding. `overview.md` and `slash-invocation.md` enumerate three invocation sources — slash command, `invoke` from another loom, and "a future loom harness" / "programmatic consumers"; `future-considerations.md` plans for "first-class loom values invocable from non-loom programmatic harnesses." For each non-slash path the spec is silent on what *operator-facing* means. An `invoke` chain originating from a slash dispatch has a session and therefore a TUI operator, but `pi-integration-contract.md` line 386 also notes that `loom-system-note` messages enter the LLM context window via Pi's `convertToLlm` transform, so even within a session the "operator" is one of several consumers of the channel.

The result: a reader trying to pin down whether `loom/host/discovery-degraded-after-shutdown` is observable when no human is attached, or whether a subagent-mode `invoke` chain (whose transcript is private) still has a TUI-visible operator surface, has to infer the answer from scattered passages. The right answer for V1 is straightforward — every loom invocation runs inside an active Pi TUI session bound to one operator, because Pi exposes no other entry point at the pinned `~0.72.1` SDK — but the spec asserts neither the binding nor the V1-only carve-out.

## Spec Documents

- `docs/spec.md` — Overview (terminal-outcomes paragraph), Orientation > Scope > Hard ceilings, Orientation > Scope > Runtime observability (edited)
- `docs/spec_topics/glossary.md` — `operator` entry (edited)
- `docs/spec_topics/overview.md` — Scope of a loom file (read-only; cites "programmatic consumers" / "future loom harness")
- `docs/spec_topics/slash-invocation.md` — prompt-mode invocation paragraph (read-only; same "future loom harness" phrasing)
- `docs/spec_topics/future-considerations.md` — non-loom programmatic harness item (read-only; the deferred-feature anchor the V1 disclaimer points at)
- `docs/spec_topics/pi-integration-contract.md` — System notes / Runtime event channel (read-only; supplies the channel-as-operator-surface contract the glossary leans on)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

H6 (REQ-IDs) explicitly excludes `glossary.md` from per-page anchor insertion as a narrative page, and no other leaf carries acceptance criteria over the operator-role definition or the non-interactive-delivery scope statement. The fix is purely editorial against `spec.md` and `glossary.md`; the runtime emission paths (H4 `loom-system-note` registration, V18q always-log helper, Mb cancellation note) are unaffected.

## Consequence

**Severity:** advisory

Two implementers cannot diverge on observable behaviour from this gap — the spec's emission rules are pinned regardless of who is reading the channel — but a reader auditing spec coverage cannot tell whether non-TUI delivery is unsupported, undefined, or simply unaddressed, and a future contributor adding (e.g.) a `loom test` harness has no anchor for the question "does the always-log set still fire?" The cost compounds with the future `non-loom programmatic harnesses` item in `future-considerations.md`, which assumes a settled operator-role definition to extend.

## Solution Space

**Shape:** single

### Recommendation

Make the V1 binding explicit in two edits:

1. **Glossary.** Append one sentence to the `operator` entry in `spec_topics/glossary.md` pinning the V1 invariant: "In V1 every loom invocation runs inside an active Pi TUI session, so an operator is always present; non-interactive invocation paths (e.g. a future `loom test` harness or non-loom programmatic harness per [Future Considerations](./future-considerations.md)) are out of scope and the operator-facing channel's behaviour outside a TUI session is undefined."

2. **`spec.md` first uses.** On the first use of *operator* in the Overview terminal-outcomes paragraph (line 10) and in the Hard ceilings opening sentence (line 56), add a single forward-link of the form `the operator (per [Glossary](./spec_topics/glossary.md#operator))`. The Runtime observability bullet (line 52) already forward-links the Glossary generically and does not need the per-term anchor.

Edge cases the implementer must watch:

- The V1 carve-out belongs in the Glossary entry, not in a Non-goals section, because the term must remain defined uniformly across the corpus; the consolidated Non-goals section MAY cite it, but the definition is the single source of truth.
- The forward-link target must be an explicit `#operator` anchor on the glossary entry. If the glossary entry has no anchor today, add one in the same edit (an HTML `<a id="operator"></a>` or the anchor convention `glossary.md` already uses for other terms — match what is there).
- Do not extend the disclaimer to cover `convertToLlm` LLM-context entry; that surface is already owned by [Pi Integration Contract — System notes — Custom-message channel persistence and LLM-context entry](./spec_topics/pi-integration-contract.md) and is a property of the channel, not of the operator role.
- The `loom test` reference is to the deferred feature already named in `future-considerations.md` ("Surfacing it for testing, replay, or observability is a future consideration (see `loom test`…)"); use the existing name verbatim rather than coining one.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — same-cluster (overlapping scope: what the operator sees on success vs across non-interactive paths).
- T38 "Non-goals are not consolidated into a single section" — same-cluster (the V1 "no non-interactive delivery path" disclaimer is one of the items the consolidated Non-goals section would cite back to the glossary entry).

---

# T07 — `QueryError.message` content has no normativity rule

**Original heading:** `CancelledError.message` has no normative content
**Original section:** docs/spec_topics/errors-and-results.md
**Kind:** testability
**Importance:** medium

## Finding

`CancelledError` declares `message: string` with no template, no example, and no statement about whether the content is implementation-defined. A conformance test cannot assert any specific string, cannot assert non-emptiness, and cannot even assert the field's presence beyond what the schema itself implies.

The same gap is present on every other `QueryError` variant in `errors-and-results.md` — `SchemaValidationError`, `TransportError`, `ModelToolError`, `ContextOverflowError`, `ToolLoopExhaustedError`, `CodeToolError`, `InvokeInfraError`, and `InvokeCalleeError` all carry an unannotated `message: string`. The single exception is the panic path: when `InvokeInfraError.cause === "panic"`, the **Panic message string (normative)** rule (lines 112–123) pins `message` to the registered `loom/runtime/*` template. No comparable rule covers any of the non-panic `message` fields, and `ValidationIssue.message` is annotated only with the inline comment `// human-readable summary of the failure`, which is descriptive rather than normative.

The author-facing impact is concrete: the topic's own opening example (line 10) interpolates `${e.message}` into a user-visible string, so authors will write code that depends on this field. Without a rule stating either that content is implementation-defined or that it follows a fixed template, two conformant runtimes can ship messages that diverge arbitrarily, and authors writing portable looms have no contract to write against.

## Spec Documents

- `docs/spec_topics/errors-and-results.md` — `### QueryError variants` and the **Notes** subsection that follows them (edited)
- `docs/spec_topics/cancellation.md` — **Surfacing** bullet that placeholder-renders `message: "..."` (read-only)
- `docs/spec_topics/diagnostics.md` — code registry (option-dependent: edited only under the per-variant template option)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

## Consequence

**Severity:** advisory

Two conformant runtimes can emit different `message` strings for the same failure, and conformance tests have no contract to assert against beyond the discriminant `kind` and the variant's structured fields. Authors who interpolate `e.message` into user-visible output (as the topic's own opening example does) get implementation-dependent behaviour with no spec acknowledgement that this is the intended trade-off.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A.

### Option A — Single blanket non-normativity rule

**Approach.** Add one paragraph to the **Notes** subsection of `### QueryError variants` stating that `message` content on every `QueryError` variant is implementation-defined and non-normative, with the explicit carve-out that the panic path's template (per **Panic message string (normative)** above) overrides this for `InvokeInfraError` when `cause === "panic"`. Conformance tests MUST assert only on `kind`, the variant's structured fields, and (for the panic carve-out) the registered template.

**Spec edits.**

- One new paragraph in `errors-and-results.md` **Notes**, placed adjacent to the existing `raw_response`/`ToolLoopExhaustedError` notes.
- A one-line cross-reference from `cancellation.md`'s **Surfacing** bullet so the `"..."` placeholder is anchored to the new rule rather than read as a forgotten template.

**Pros.** One edit covers nine variants. No new normative obligations on runtimes. Aligns with how `ValidationIssue.message`'s inline `// human-readable summary` is already framed. Author-portable code is steered toward `kind` discrimination, which is the spec's stable contract anyway.

**Cons.** Author code that interpolates `e.message` into user-visible output gets formally blessed implementation dependence; cross-runtime UX consistency is sacrificed.

**Risks.** Authors who already write `${e.message}`-style messages may be surprised to learn the content is non-normative. Mitigated by the opening example (line 10) being the natural place to add a one-sentence reader caveat.

### Option B — Per-variant message templates in the diagnostics registry

**Approach.** Extend the **Diagnostics code registry** with a `loom/error/*` (or equivalent) section listing one row per `QueryError` variant, each with a normative `Message template` column analogous to the `loom/runtime/*` panic templates. The `message` field on each variant becomes a template-rendered string the runtime MUST emit.

**Spec edits.**

- New code-registry section in `diagnostics.md` with one row per non-panic `QueryError` variant.
- Replace each `message: string` annotation in `errors-and-results.md` with a pointer to its registry row (mirroring how the panic path is documented).
- Refit `cancellation.md`'s `message: "..."` placeholder in the **Surfacing** bullet to the registered template.

**Pros.** Cross-runtime UX consistency. Conformance tests can assert exact strings. Symmetric treatment with the existing panic-message normativity rule.

**Cons.** Substantially heavier obligation on runtimes. Requires designing nine templates with stable placeholder grammar, and binds the spec to wording it cannot revise without a breaking change. Most variants already carry structured discriminator fields (`tool_name`, `cause`, `tokens_limit`, `callee_path`, …) that author-visible UX should compose from; pinning a template makes those fields semi-redundant for display.

**Risks.** Template churn during V1 implementation; placeholder grammar (the closed eight-category system in `diagnostics.md` §73) may need extension to cover error-message interpolations cleanly.

### Recommendation

Option A. The structured discriminant fields on each variant already carry the information author code should branch on, and the panic carve-out remains the one case where wire-stable strings genuinely matter (because the panic source is otherwise opaque to the parent's `match` arms). Implementer must watch one edge: the new rule must explicitly preserve the panic-template normativity for `InvokeInfraError.message` when `cause === "panic"`, and must not weaken the existing wording at lines 112–128.

## Relationships

- T08a "Rewrite slash-invocation.md context_overflow system-note row to 'context overflow'" — same-cluster (touches the same `QueryError variants` surface; co-resolve siblings T08b/c also relevant).
- T39 "Mid-stream cancellation paragraph bundles multiple obligations under one anchor" — same-cluster (cancellation pathway; independent obligation-splitting concern).

---

# T08a — Rewrite slash-invocation.md context_overflow system-note row to "context overflow"

**Original heading:** `ContextOverflowError` / `context_overflow` / "context window exceeded" — three phrasings for one concept
**Original section:** docs/spec_topics/errors-and-results.md
**Split from:** "Inconsistent phrasing for the context-overflow failure across schema, wire kind, and user-facing system note" (entry 1 of 3, second reshape pass 2026-05-11)
**Kind:** naming
**Importance:** medium

## Finding

The user-facing system-note template in `slash-invocation.md` (the `context_overflow` row of the per-`kind` formatting table, line 42) currently reads `"loom /<name> returned Err: context window exceeded"`, breaking the corpus-wide "overflow" root word used by the schema (`ContextOverflowError`), the wire `kind` (`"context_overflow"`), and all surrounding prose (`hard-ceilings.md`, `pi-integration-contract.md`, `binder.md`, `query.md`'s detection heading, `glossary.md`'s always-log entry). Because that table is normative and byte-pinned ("Renderers MUST emit the surrounding template text verbatim"; "Wording changes are spec-versioned breaking changes"), once V18i ships with the table's literal text, harmonising it later is a breaking spec-version bump. This child rewrites the table-row literal so the user-facing string aligns with the schema/wire root word; siblings T08b and T08c sweep the supporting prose in `errors-and-results.md` and `query.md` respectively.

## Spec Documents

- `docs/spec_topics/slash-invocation.md` — per-`kind` system-note table, `context_overflow` row (edited)
- `docs/spec_topics/binder.md`, `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/hard-ceilings.md`, `docs/spec_topics/glossary.md` — (read-only; already match the "overflow" root word)

## Plan Impact

**Phases:** V18

**Leaves (implementation order):**

- V18i — Per-`kind` formatting for prompt-mode top-level `Err` — (modified; pins the new literal)

V5h, V13, V16n, V18q reference `ContextOverflowError` / `context_overflow` only by schema name or wire kind and are unaffected by this row rewrite.

## Consequence

**Severity:** advisory

A reader synthesising the user-visible string from the wire `kind` will produce something other than "context window exceeded" and silently fail conformance once V18i pins the literal text. Implementers who copy the slash-invocation row verbatim are correct today; the cost is reader friction now and a breaking spec-version bump later if the inconsistency is fixed after V18i lands.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Rewrite the `slash-invocation.md` `context_overflow` row literal from `"loom /<name> returned Err: context window exceeded"` to `"loom /<name> returned Err: context overflow"`. No schema name, wire `kind` literal, or field name changes — purely user-facing prose. The renderer's `match` arm on `kind: "context_overflow"` is unaffected.

Edge cases (applies to all children of T08):

- The edit must land before V18i so its tests pin the new string from the start; if V18i has already shipped, the change is a spec-versioned breaking bump under GOV-12 and the slash-invocation row's "Wording changes are spec-versioned breaking changes" clause.
- Coordinate landing with siblings T08b and T08c so the corpus is harmonised in one commit.
- Leave `binder.md`, `pi-integration-contract.md`, `hard-ceilings.md`, and `glossary.md` untouched — they already match.

## Relationships

- T08b "Sweep errors-and-results.md line 206 'context-window overflow' to 'context overflow'" — co-resolve.
- T08c "Sweep query.md line 285 'context window exceeded' to provider context-overflow phrasing" — co-resolve.
- T07 "`QueryError.message` content has no normativity rule" — same-cluster (touches the same `QueryError variants` surface).

---

# T08b — Sweep errors-and-results.md line 206 "context-window overflow" to "context overflow"

**Original heading:** `ContextOverflowError` / `context_overflow` / "context window exceeded" — three phrasings for one concept
**Original section:** docs/spec_topics/errors-and-results.md
**Split from:** "Inconsistent phrasing for the context-overflow failure across schema, wire kind, and user-facing system note" (entry 2 of 3, second reshape pass 2026-05-11)
**Kind:** naming
**Importance:** medium

## Finding

The `ContextOverflowError` variant intro paragraph at `errors-and-results.md` line 206 currently reads "context-window overflow"; the rest of the corpus uses the bare phrase "context overflow". This child sweeps the prose so all sites read with the same root word; siblings T08a and T08c handle the slash-invocation row literal and the `query.md` sweep respectively.

## Spec Documents

- `docs/spec_topics/errors-and-results.md` — `ContextOverflowError` variant intro paragraph (line 206) and the `raw_response` notes block (line 290) (edited; prose only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None — purely editorial prose sweep.

## Consequence

**Severity:** advisory

Without this sweep, a reader auditing the corpus sees "context-window overflow" in `errors-and-results.md` while every other site says "context overflow"; the inconsistency is observable at every cross-page navigation.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Replace "context-window overflow" with "context overflow" in `errors-and-results.md` line 206 (the `ContextOverflowError` variant intro paragraph). Sweep the `raw_response` notes block at line 290 for the same phrase if it is present.

Edge cases (applies to all children of T08):

- Schema name `ContextOverflowError` and wire `kind` literal `"context_overflow"` are unchanged.
- Coordinate landing with siblings T08a and T08c so the corpus is harmonised in one commit.
- Leave `binder.md`, `pi-integration-contract.md`, `hard-ceilings.md`, and `glossary.md` untouched — they already match.

## Relationships

- T08a "Rewrite slash-invocation.md context_overflow system-note row to 'context overflow'" — co-resolve.
- T08c "Sweep query.md line 285 'context window exceeded' to provider context-overflow phrasing" — co-resolve.
- T07 "`QueryError.message` content has no normativity rule" — same-cluster.

---

# T08c — Sweep query.md line 285 "context window exceeded" to provider context-overflow phrasing

**Original heading:** `ContextOverflowError` / `context_overflow` / "context window exceeded" — three phrasings for one concept
**Original section:** docs/spec_topics/errors-and-results.md
**Split from:** "Inconsistent phrasing for the context-overflow failure across schema, wire kind, and user-facing system note" (entry 3 of 3, second reshape pass 2026-05-11)
**Kind:** naming
**Importance:** medium

## Finding

`query.md` line 285 currently describes provider behaviour as "recognised provider \"context window exceeded\" error responses" — quoting the exact "context window exceeded" string. This phrasing both (a) breaks the corpus-wide "context overflow" root word and (b) implies providers literally emit that exact string. This child sweeps the prose to use the bare "context-overflow" phrasing without quoting; siblings T08a and T08b handle the slash-invocation row literal and the `errors-and-results.md` sweep.

## Spec Documents

- `docs/spec_topics/query.md` — Detection of `ContextOverflowError`; the "context window exceeded" phrase on line 285 describing what providers return (edited; prose only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None — purely editorial prose sweep.

## Consequence

**Severity:** advisory

Without this sweep, `query.md` continues to assert that providers return the literal string "context window exceeded", which both diverges from the corpus root word and over-commits the spec to a provider behaviour it cannot actually verify.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Rewrite the `query.md` line 285 sentence from "recognised provider \"context window exceeded\" error responses" to "recognised provider context-overflow error responses" — naming the provider behaviour without quoting any specific provider error string.

Edge cases (applies to all children of T08):

- Schema name `ContextOverflowError` and wire `kind` literal `"context_overflow"` are unchanged.
- Coordinate landing with siblings T08a and T08b so the corpus is harmonised in one commit.
- Leave `binder.md`, `pi-integration-contract.md`, `hard-ceilings.md`, and `glossary.md` untouched — they already match.

## Relationships

- T08a "Rewrite slash-invocation.md context_overflow system-note row to 'context overflow'" — co-resolve.
- T08b "Sweep errors-and-results.md line 206 'context-window overflow' to 'context overflow'" — co-resolve.
- T07 "`QueryError.message` content has no normativity rule" — same-cluster.

---

# T09 — `bind_context: session` overview bullet uses tilde-approximate caps that contradict the exact bounds defined later in the same file

**Original heading:** Binder context `~20 turns` approximate notation contradicts exact bounds in `binder.md`
**Original section:** docs/spec_topics/frontmatter.md
**Kind:** testability
**Importance:** high

## Finding

`binder.md` contains two incompatible specifications of the session-context truncation caps. Line 23 (the `bind_context: session` bullet at the top of the section) reads "the binder additionally receives the last **~20 turns** or **~8000 tokens** (whichever is smaller)". The tildes signal approximation, and "whichever is smaller" suggests an interaction between the two limits that is not what the algorithm actually does.

The normative algorithm later in the same file (Session-context truncation, line 109) pins exact, inclusive bounds: a turn is included iff "the running token total is ≤ 8000 *and* the running turn count is ≤ 20"; the first candidate that would violate either inequality is excluded entirely. The accompanying worked examples include explicit boundary-equality vectors (running total exactly 8000 included; the 21st turn excluded "regardless of its token weight"), and the rendered system-prompt example at line 179 prints "most recent 20 turns / 8000 tokens" with no tildes. The plan leaf V16g writes acceptance tests directly against the exact bounds.

A reader who only consumes the introductory bullet cannot tell that the limits are exact, that both bounds apply jointly (not "whichever is smaller"), or that boundary-equality is inclusive. An implementer or test author working from that bullet alone would be free to round, sample, or pick the tighter cap as a shortcut and still believe they were conformant.

## Spec Documents

- `docs/spec_topics/binder.md` — `bind_context` value list (line 23) (edited)
- `docs/spec_topics/binder.md` — Session-context truncation (lines 107–119) (read-only)
- `docs/spec_topics/binder.md` — Binder system prompt example (line 179) (read-only)
- `docs/spec_topics/frontmatter.md` — `bind_context` row (line 43) (read-only — confirms no quantitative claims live here)

## Plan Impact

**Phases:** V16

**Leaves (implementation order):**

- V16g — `bind_context: session` truncation — (modified)

V16g already cites the exact caps and the worked-example vectors from `binder.md`'s normative algorithm; the leaf itself does not change in substance, but its **Spec.** anchor target is the section whose introductory bullet is being corrected, so the cross-reference must be re-checked after the edit lands.

## Consequence

**Severity:** correctness

Two implementers reading only the bullet would diverge: one might treat the caps as soft targets (rounding turn counts, undercounting tokens), another might enforce "whichever is smaller" as a single binding cap, a third might read down to the algorithm and apply the exact joint inequality. The boundary-equality test vectors in V16g would catch the first two implementations, but only after the implementation work was wasted; the bullet should not invite the divergence in the first place.

## Solution Space

**Shape:** single

### Recommendation

Replace the line-23 bullet with a description that matches the algorithm exactly:

> `session` — prompt-mode-only; the binder additionally receives the most recent caller-session turns whose running total is ≤ 8000 tokens and whose running turn count is ≤ 20, walked newest-to-oldest with whole-turn boundaries (full algorithm and worked examples below).

Drop the tildes, drop "whichever is smaller" (the bounds are an inclusive joint constraint, not a min-of-two), and forward-link to the Session-context truncation subsection so the bullet's role as orientation is unambiguous.

Edge cases the implementer must watch:

- The bullet's revised wording must not re-introduce its own quantitative description that could drift from the algorithm; the numeric literals (8000, 20) and the inclusivity rule live in exactly one place — the Session-context truncation paragraph — and the bullet either restates them verbatim or defers to it.
- The rendered system-prompt example at line 179 (`most recent 20 turns / 8000 tokens`) is also a copy of the same literals and is part of the normative reference rendering; if the bullet is rephrased to defer rather than restate, line 179 still stands as a third site that must stay numerically aligned with the algorithm.

## Relationships

None

---

# T10 — Single-string bypass: behaviour on whitespace-only / absent slash argument is unspecified

**Original heading:** Single-string bypass: empty-string argument behavior unspecified
**Original section:** docs/spec_topics/binder.md
**Kind:** testability
**Importance:** high

## Finding

`binder.md` § *Binder bypass* item 2 says: "When `params:` declares exactly one field, that field's type is `string`, and the field has no default, the runtime sets the param's value to the entire slash-argument string (with leading and trailing whitespace trimmed) and skips the binder call. AJV validation still runs as a safety net (a string passes by definition; this is just the standard validation path)."

The text is silent on the case where the user supplies no slash argument, or supplies only whitespace. After the trim, the bound value is `""`. AJV with the default `{ type: "string" }` schema accepts `""`; nothing in the bypass paragraph forbids it. But two reasonable implementers will pick different behaviours:

- (a) bind the param to `""` and start the loom (the literal reading of the current text);
- (b) treat the empty trim result as "user supplied no argument" and surface a `needs_info`-style system note (mirroring the binder's required-field semantics, and matching the spirit of `slash-invocation.md` § *No-params overflow*, which already special-cases whitespace-only remainders by collapsing them to "nothing supplied");
- (c) reject as a validation failure on the grounds that an empty string is not a meaningful argument.

The bypass path has no binder call to fall back on, no `needs_info` channel of its own, and no diagnostic code reserved for "bypass loom invoked with no argument", so the choice is load-bearing for both the user-visible surface (does the loom run with `""` or does the user see a system note?) and the test matrix for V3c. The spec must pin one behaviour.

## Spec Documents

- `docs/spec_topics/binder.md` — § Binder bypass → Single-string bypass (item 2) (edited)
- `docs/spec_topics/slash-invocation.md` — § No-params overflow (read-only; provides the precedent that whitespace-only remainders trim to empty)

## Plan Impact

**Phases:** V3

**Leaves (implementation order):**

- V3c — Bypass binder (no-params and single-string forms) — (modified)

## Consequence

**Severity:** correctness

Two implementers reading the current text will plausibly diverge: one starts the loom with the string param bound to `""`, the other suppresses the loom and emits a system note. Loom authors writing single-string bypass looms cannot predict which behaviour Pi-loom will exhibit when the user types `/foo` with no argument, and V3c's test matrix has no row for the empty-trim case.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A.

### Option A — Bind `""` and run the loom

- **Approach.** Add a sentence to item 2: "When the slash argument is absent or trims to the empty string, the param is bound to `""` and the loom starts; AJV validates `""` as a `string` (it passes by definition)." No new diagnostic.
- **Spec edits.** One sentence in `binder.md` § *Binder bypass* item 2. No echo-policy change (echo is already auto-suppressed on bypass per V16k). V3c **Adds**/**Tests** gain a row asserting that `/foo` and `/foo   ` both bind `""` and start the loom.
- **Pros.** Faithful to the current literal reading. Cheapest possible bypass — no special case in the runtime. Authors who want to forbid empty input can declare AJV constraints (e.g. `minLength: 1`) once that surface is reachable, or guard inside the loom body.
- **Cons.** Hands the "is empty meaningful?" question to the loom author, who has no spec-blessed way to express "non-empty required" on a bypass-eligible param in V1 (the schema-subset surface for `string` params does not currently expose `minLength`).
- **Risks.** A loom author writing `/define <term>` gets called with `term = ""` when the user mis-types `/define`, and is responsible for the resulting UX. Consistent with the no-params-overflow precedent (whitespace-only trims to empty and is benign).

### Option B — Route empty trim to a system note, do not start the loom

- **Approach.** Add to item 2: "When the slash argument is absent or trims to the empty string, the runtime emits a single `loom-system-note` formatted as `loom /<name>: argument required — this loom takes a single string argument` and the loom does not run. AJV is not consulted." Reserve a diagnostic code (e.g. `loom/run/single-string-bypass-empty-arg`, info-level, no parse/load implication).
- **Spec edits.** Two sentences in `binder.md` § *Binder bypass* item 2; new row in the failure-mode templates table for the bypass-empty case (or a cross-reference noting it is not a binder failure mode); V3c **Adds**/**Tests** assert the system-note text and that the loom never starts.
- **Pros.** Mirrors the binder's `needs_info` semantics for the LLM path: a single-string loom whose argument is required (no default) gets the same "you must supply this" surface whether or not the binder runs. Removes the trap where authors must defensively check for `""` inside every bypass loom.
- **Cons.** Introduces a runtime branch on the bypass path that did not exist before, plus a new system-note template and (likely) a new diagnostic code subject to GOV-3 / GOV-8 governance. Slightly more spec surface area.
- **Risks.** Authors who *want* to accept empty input on a bypass loom (e.g. a `/scratch` loom that opens an empty editor) cannot opt out without giving the field a default — at which point the loom is no longer bypass-eligible (defaults disqualify, per the same paragraph). That regression must be acknowledged.

### Recommendation

**Option A.** The literal reading of the current text already implies "bind `""` and run", and Option A makes that explicit with one sentence and no new diagnostic surface. The `slash-invocation.md` § *No-params overflow* precedent ("whitespace-only remainders trim to empty and emit no note") is the consistent reading for the bypass path: the runtime trims, then proceeds; UX guards are the loom author's responsibility. Pin the AJV-passes-by-definition observation explicitly so the test for V3c can assert it without re-deriving the reasoning.

Edge cases the V3c implementer must cover:

- `/foo` (no characters after the command name) → param = `""`, loom starts.
- `/foo   ` (whitespace only, including tabs) → param = `""`, loom starts.
- `/foo  hello  ` → param = `"hello"`, loom starts (existing path; trim removes leading/trailing whitespace only, internal whitespace preserved).
- Echo is auto-suppressed in all three cases per V16k; no echo line is emitted.
- The note from `slash-invocation.md` § *No-params overflow* does **not** fire here — that note is gated on `params: {}` / absent, not on the single-string bypass path.

## Relationships

None

---

# T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule

**Original heading:** CIO-4 vacuous-after-forced-respond behavior implicit, not stated
**Original section:** docs/spec_topics/query.md and docs/spec_topics/hard-ceilings.md
**Split from:** "`tool_loop` slot accounting on the forced respond turn is internally inconsistent" (entry 1 of 3)
**Kind:** testability
**Importance:** high

## Finding

Three normative sites — `query.md` *Tool-call loop bound*, `frontmatter.md` `tool_loop` field description, and `hard-ceilings.md` CIO-4 worked consequence — currently assert or imply *"the forced respond turn for typed queries also consumes one slot."* That phrasing contradicts the CIO-4 routing rule and the *Depth-6 forced respond at `max_rounds`* worked consequence, which together require the forced respond turn to dispatch unconditionally as the typed-query terminating mechanism (see the parent finding's full divergence analysis preserved in the source-file history). This child addresses the spec-prose rewrite step that establishes the explicit forced-respond-exemption rule on which the V6k changes (siblings T11b, T11c) depend.

## Spec Documents

- `docs/spec_topics/query.md` — *Tool-call loop bound* (edited)
- `docs/spec_topics/frontmatter.md` — `tool_loop` field description (edited)
- `docs/spec_topics/hard-ceilings.md` — CIO-4 and *Depth-6 forced respond at `max_rounds`* worked consequence (read-only; confirm wording remains aligned, no edit if it does)
- `docs/spec_topics/pi-integration-contract.md` — PIC-1 (d) V1 reachable predicate (read-only; already consistent)

## Plan Impact

**Phases:** None for this child (V6 leaves V6k/V6l are touched by sibling children T11b and T11c).

**Leaves (implementation order):** None — the spec-prose rewrite is editorial against the named normative sites.

## Consequence

**Severity:** correctness

Until this prose is rewritten, the per-finding fix-loop cannot land the explicit forced-respond-exemption rule the sibling children depend on; the contradiction between the "consumes one slot" framing and the CIO-4 terminating-mechanism wording remains observable on every typed query at the boundary case `max_rounds: 0`.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Replace the loose "The forced respond turn for typed queries also consumes one slot" sentence in `query.md` *Tool-call loop bound* and the matching sentence in `frontmatter.md` with the rule:

> The forced respond turn for typed queries is the terminating mechanism the runtime routes to when the free phase ends or when CIO-4's `max_rounds`-final branch fires. The slot-accounting check (CIO-4) is **not** evaluated against the forced respond turn itself: the runtime MUST dispatch the forced respond turn whenever a typed query reaches that branch, including when `max_rounds: 0` (in which case the forced respond turn is the only turn issued). The forced respond turn surfaces `Err({ kind: "tool_loop_exhausted", … })` if and only if the model fails to invoke the synthesised respond tool on that turn (the `last_tool_name: null` case V6k already pins); a successful respond-tool invocation surfaces `Ok(value)` on a valid payload or `Err({ kind: "validation", … })` on an invalid one, regardless of the current slot count.

Confirm `hard-ceilings.md` CIO-4 prose still aligns (the *Depth-6 forced respond at `max_rounds`* worked consequence already calls the forced respond turn "precisely the typed-query terminating mechanism CIO-4's `max_rounds`-final branch routes to"); no edit if it does.

Edge cases (applies to all children of T11): respond-repair follow-ups (V13g) get a fresh `tool_loop` budget; the same exemption rule applies recursively. No edit needed to PIC-1 (d) — its predicate is already worded against the *free-phase* slot count and remains correct under this rule.

## Relationships

- T11b "V6k counting-formula tighten: forced respond outside the budget" — must-precede (the prose rule must land before V6k's formula can be rewritten against it).
- T11c "V6k normative test vector for `max_rounds: 0` typed query" — must-precede (the prose rule must land before V6k's test can assert against it).

---

# T11b — V6k counting-formula tighten: forced respond outside the budget

**Original heading:** CIO-4 vacuous-after-forced-respond behavior implicit, not stated
**Original section:** docs/plan_topics/v6-typed-queries.md
**Split from:** "`tool_loop` slot accounting on the forced respond turn is internally inconsistent" (entry 2 of 3)
**Kind:** testability
**Importance:** high

## Finding

V6k's *Adds* paragraph currently pins a counting formula — *"Total slots consumed by a query = (free-phase rounds) + (1 if a forced respond turn is issued, else 0). Exhaustion fires when total slots would exceed `max_rounds`."* — that contradicts the spec rule T11a establishes (the forced respond turn is exempt from CIO-4 slot-accounting). The formula must be rewritten so the leaf's *Adds* prose matches the spec it implements.

## Spec Documents

- `docs/plan_topics/v6-typed-queries.md` — V6k *Adds* paragraph (edited)
- `docs/spec_topics/query.md` — *Tool-call loop bound* (read-only; the rule established by T11a)

## Plan Impact

**Phases:** V6 — Typed queries

**Leaves (implementation order):**

- V6k — `tool_loop` cap enforcement and `ToolLoopExhaustedError` — (modified; counting formula rewritten)
- V6l — Two-phase tool-loop driver for typed queries — (modified; driver MUST dispatch the forced respond turn unconditionally and not consult the slot count to decide whether to issue it)

## Consequence

**Severity:** correctness

If V6k's formula is not updated alongside T11a's prose rewrite, the leaf's *Adds* paragraph remains internally inconsistent with the spec it implements, and a `max_rounds: 0` typed query produces undefined behaviour from the leaf's perspective.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Tighten V6k's *Adds* paragraph: redefine the counting formula as `slots = free-phase rounds`, with the forced respond turn outside the budget; restate exhaustion as:

> (slot count would exceed `max_rounds` and the next required turn is a free-phase turn) OR (the forced respond turn was dispatched and the model failed to invoke the respond tool).

Edge cases (applies to all children of T11): respond-repair follow-ups (V13g) reset the counter; the new exhaustion clause must be re-checked against each follow-up's fresh budget independently.

## Relationships

- T11a "Replace 'consumes one slot' prose with explicit forced-respond exemption rule" — must-follow (the spec rule must land first so V6k's formula has something to anchor against).
- T11c "V6k normative test vector for `max_rounds: 0` typed query" — must-precede (the formula change must land before the test can assert against it).

---

# T11c — V6k normative test vector for `max_rounds: 0` typed query

**Original heading:** CIO-4 vacuous-after-forced-respond behavior implicit, not stated
**Original section:** docs/plan_topics/v6-typed-queries.md
**Split from:** "`tool_loop` slot accounting on the forced respond turn is internally inconsistent" (entry 3 of 3)
**Kind:** testability
**Importance:** high

## Finding

V6k's *Tests* line currently has no row exercising the `max_rounds: 0` typed-query boundary case. Without that test, two compliant V6k implementations could ship divergent behaviour (one returning `Ok(validated_value)`, the other returning `Err({ kind: "tool_loop_exhausted", rounds: 0, last_tool_name: null })`) and the leaf's *Ships when* condition would not catch the divergence.

## Spec Documents

- `docs/plan_topics/v6-typed-queries.md` — V6k *Tests* line (edited)
- `docs/spec_topics/query.md` — *Tool-call loop bound*; *Worked example: depth-6 forced respond at `max_rounds`* (read-only)

## Plan Impact

**Phases:** V6 — Typed queries

**Leaves (implementation order):**

- V6k — `tool_loop` cap enforcement and `ToolLoopExhaustedError` — (modified; one new test vector)

## Consequence

**Severity:** correctness

Without this test vector pinned, the divergence at `max_rounds: 0` (Ok vs tool_loop_exhausted) ships unaddressed, even after T11a/T11b land the rule and the formula.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Add a normative test vector to V6k's *Tests* line:

> A typed query with `max_rounds: 0`, frontmatter tools omitted, model invoked once with empty tool-set + forced choice on the respond tool, model returns a valid respond-tool call → MUST return `Ok(validated_value)`; same vector with the model returning a non-respond `tool_use` block (or text under non-strict providers) → MUST return `Err({ kind: "tool_loop_exhausted", rounds: 0, last_tool_name: null })`.

Edge cases (applies to all children of T11): respond-repair follow-ups (V13g) get a fresh `tool_loop` budget; the test should not conflate `max_rounds: 0` on a follow-up with `max_rounds: 0` on the original query.

## Relationships

- T11a "Replace 'consumes one slot' prose with explicit forced-respond exemption rule" — must-follow.
- T11b "V6k counting-formula tighten: forced respond outside the budget" — must-follow.

---

# T12 — Dual-cap simultaneous breach: `<cap>` value in `loom/load/discovery-slow` diagnostic is indeterminate

**Original heading:** Dual-cap simultaneous breach: `<cap>` value in diagnostic is indeterminate
**Original section:** docs/spec_topics/discovery.md
**Kind:** testability
**Importance:** high

## Finding

`discovery.md` §"Package discovery" → "Edge cases" specifies that the package walk stops "once it has either inspected `looms.scanPackagesMaxFiles` files (default `2000`) or spent `looms.scanPackagesTimeoutMs` milliseconds on the walk (default `2000`), whichever fires first; on either trip it emits a single `loom/load/discovery-slow` warning that names the root being scanned and the cap that fired." The cap-check site is "before each new candidate-package read attempt."

Both cap predicates are evaluated at the same check site against the same observed state (file count and `Clock.now()`), so a deterministic simultaneous-breach scenario is constructible — e.g. a `FakeClock` that lands exactly on the timeout boundary at the same iteration where the file count first reaches `looms.scanPackagesMaxFiles`. In that case the spec is silent on which predicate is consulted first, hence which string the warning's `cap` payload carries. The `whichever fires first` clause resolves a temporal race in real time but not the simultaneous-true case.

The asymmetric ordering rule the spec already states for the per-read deadline interaction with the global timeout ("the per-read warning is emitted first and the global `loom/load/discovery-slow` warning still fires from the cap-check site at the next candidate") shows the authors recognise the need to nail down ordering when two trip points overlap; the dual-cap case at the cap-check site itself was missed.

A conformance test that asserts the `cap` field's value for the simultaneous-breach case cannot be written from prose alone, and two implementers will reasonably diverge: one will check the cheap arithmetic predicate first (file count), the other will check the time predicate first (since "timeout" is the higher-pressure signal).

## Spec Documents

- `docs/spec_topics/discovery.md` — Package discovery → Edge cases (scan caps paragraph, line ~129) (edited)
- `docs/spec_topics/diagnostics.md` — `loom/load/discovery-slow` registry entry (read-only; only edited if the diagnostic's `details` schema is the chosen surface for the `cap` field)

## Plan Impact

**Phases:** Vertical V14

**Leaves (implementation order):**

- V14m — Discovery: package `looms/` and `pi.looms` — (modified)

The existing V14m `Tests.` cover the file-count cap (2001-package fixture) and the time cap (`FakeClock.advance` past `scanPackagesTimeoutMs`) independently, but no test exercises both predicates being true at the same cap-check iteration. Once the spec fixes an evaluation order, V14m gains one test vector: a `FakeClock` driven so that at the iteration where the file count first equals `scanPackagesMaxFiles`, `Clock.now()` has also crossed `scanPackagesTimeoutMs` — the warning's `cap` field MUST be the spec-mandated string.

## Consequence

**Severity:** correctness

The `loom/load/discovery-slow` warning is observable contract surface and the spec already constrains its `cap` payload to a specific value. Two compliant implementations would emit different `cap` strings for the same input scenario, which breaks any operator log-analysis or test fixture that keys on the `cap` field. Behaviour (the walk aborting) is unaffected; only the diagnostic content diverges.

## Solution Space

**Shape:** single

### Recommendation

Specify in `discovery.md` §"Package discovery" → "Edge cases" that the file-count predicate is evaluated before the elapsed-time predicate at the cap-check site. Reword the existing sentence to:

> The extension stops opening additional `package.json` files once it has either inspected `looms.scanPackagesMaxFiles` files (default `2000`) or spent `looms.scanPackagesTimeoutMs` milliseconds on the walk (default `2000`); the file-count predicate is evaluated first, so when both predicates are true at the same cap-check iteration the file-count cap fires and the warning's `cap` field is `looms.scanPackagesMaxFiles`.

Rationale the implementer needs to know:
- The file-count predicate is a constant-time integer compare against an in-process counter; the time predicate calls through the `Clock.now()` seam. Checking the cheap predicate first is also the natural short-circuit order.
- The ordering only matters at the cap-check site (between candidate reads). The per-read deadline race is a separate site and its ordering rule (per-read warning emitted first, then global `discovery-slow` at the next candidate) already exists and is unaffected.
- A normative test vector belongs in V14m's `Tests.` bullet: a `FakeClock` that advances past `scanPackagesTimeoutMs` on the same iteration the package count first reaches `scanPackagesMaxFiles` MUST emit a `loom/load/discovery-slow` warning whose `cap` field equals `"looms.scanPackagesMaxFiles"`.

## Relationships

None

---

# T13 — Invocation depth bound: introductory sentence omits the "cross-file" qualifier on `.warp fn` calls

**Original heading:** "`.warp` `fn` invokes" vs "cross-file `.warp` `fn` call" — contradictory depth-counting qualifier
**Original section:** docs/spec_topics/invocation.md
**Kind:** naming
**Importance:** high

## Finding

The **Invocation depth bound** subsection of `docs/spec_topics/invocation.md` defines the same rule twice with different breadth.

The introductory paragraph (line 77) says the cap counts:

> "both direct `invoke(...)`, `.loom` callable calls through `tools:`, and `.warp` `fn` invokes"

The normative *countable-frame* definition two paragraphs later (line 79) says:

> "any direct `invoke(...)` call, any `.loom` callable call dispatched through a `tools:` entry, or **any cross-file `.warp` `fn` call**."

The `cross-file` qualifier is load-bearing. A `.warp` library file may contain several top-level `fn` declarations that call one another; under the introductory wording every such *intra-file* dispatch consumes a depth slot, while under the normative wording only calls that cross a `.warp` file boundary do. Two implementers reading the page in order will therefore arrive at incompatible budgets — and the spec gives no signal which sentence binds.

The same loose phrasing has already propagated to the plan: V18n's *Adds.* bullet describes the cap as "per-chain count of 32 across direct `invoke`, registered-loom calls, and `.warp` `fn` invokes", inheriting the missing qualifier from the intro paragraph rather than the normative definition.

## Spec Documents

- `docs/spec_topics/invocation.md` — Invocation depth bound, intro paragraph (edited)
- `docs/spec_topics/invocation.md` — Invocation depth bound, *countable frames* paragraph (read-only; already correct)
- `docs/plan_topics/v18-cancellation.md` — V18n *Adds.* bullet (edited; mirror of the intro wording)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18n — Panic routing: `invoke` parent surface — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on whether intra-`.warp` `fn` calls consume the 32-slot budget. The bound is a hard runtime ceiling whose breach raises a panic and surfaces as a Pi system note or `InvokeInfraError`; a budget that differs from the spec's intent silently changes which programs hit the ceiling and which do not, in a way that is observable but not obviously attributable to a spec defect.

## Solution Space

**Shape:** single

### Recommendation

Edit the introductory paragraph of **Invocation depth bound** in `docs/spec_topics/invocation.md` so its enumeration matches the normative *countable-frame* definition that follows. Concretely, replace `"and \`.warp\` \`fn\` invokes"` with `"and cross-file \`.warp\` \`fn\` calls"` (and, for parallelism with the normative wording, prefer "calls" over "invokes" so the same noun is used in both places).

The intent — already pinned by the second paragraph — is that intra-file `.warp` `fn` dispatch is *not* countable, matching the treatment of intra-file `.loom` `fn` calls (which are not enumerated as countable frames either). Recursion within a single `.warp` file is therefore bounded only by the host stack (NOCEIL-4 / NOCEIL-3 in `hard-ceilings.md`), not by the `invoke`-chain cap.

After the spec edit, update V18n's *Adds.* bullet in `docs/plan_topics/v18-cancellation.md` to use the same `"cross-file \`.warp\` \`fn\` calls"` wording, so the leaf's acceptance text cannot be read as accidentally testing the broader (incorrect) rule.

Edge cases the implementer must watch:

- A `.warp` `fn` that calls another `.warp` `fn` re-exported from a third `.warp` file: the dispatch resolves cross-file (the callee lives in a different source unit than the caller's body) and counts.
- A `.warp` `fn` invoked from a `.loom` body: the dispatch is cross-file by construction and counts. The current intro wording happens to give the right answer here, which is presumably why the gap has not been caught.
- Self-recursion within a single `.warp` `fn`: same-file, does not count; bounded by the host stack via NOCEIL-3 / NOCEIL-4.

## Relationships

None

---

# T14 — Prompt-mode sequentiality argument has an unstated fourth premise

**Original heading:** Prompt-mode sequentiality guarantee chains three unverified premises
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** assumptions
**Importance:** medium

## Finding

The Session-model paragraph concludes that *"prompt-mode bodies execute strictly sequentially within a single user session: at most one prompt-mode body … holds an open `pi.setActiveTools` snapshot/restore window at a time"* and supports the conclusion with three pillars: (i) Pi's per-session slash-handler serialisation, (ii) load-time rejection of prompt-mode `.loom` callees in any other loom's `tools:` (so the model cannot fan out parallel prompt-mode tool calls), and (iii) `invoke(...)` to a prompt-mode callee suspends the parent plus "V1 exposes no parallel-`invoke` surface."

Those three pillars only close the user-session axis. They do not, on their own, rule out the obvious back-door: parallel tool calls into the same `.loom` callable can target subagent-mode callees (the spec's own follow-up paragraph affirms this), and a subagent-mode body may itself contain an `invoke(...)` to a prompt-mode child. Whether such a sibling-spawned prompt-mode child can re-enter the user session and contend for `pi.setActiveTools` is the load-bearing question, and the aggregator never asks it. The answer lives in `invocation.md`'s Cross-mode semantics rule (`subagent → prompt` attaches the child to the *subagent's own private* `AgentSession`, never to the user session, and only the `prompt → prompt` cell touches `pi.setActiveTools`), but a reader auditing the sequentiality argument from spec.md alone cannot derive that — the argument's fourth premise is unstated.

The argument is correct given the Cross-mode rule; the gap is in the chain of reasoning the orientation document asks the reader to follow. Sequentiality is a non-trivial property whose violation would produce subtle, hard-to-debug interleavings; an aggregator that asserts it must close every fan-out path explicitly.

## Spec Documents

- `docs/spec.md` — Orientation > Session model (edited)
- `docs/spec_topics/invocation.md` — Cross-mode semantics (read-only)
- `docs/spec_topics/frontmatter.md` — `tools` (read-only)
- `docs/spec_topics/pi-integration-contract.md` — Tool-registration lifetime and visibility (read-only)

## Plan Impact

**Phases:** Vertical V15

**Leaves (implementation order):**

- V15g — Prompt-mode `.loom` callee in `tools:` is load error — (modified)
- V15h — Cross-mode cell: prompt → prompt — (modified)
- V15j — Cross-mode cell: subagent → prompt — (modified)

(modifications limited to extending the test list with a sequentiality assertion — no re-scoping)

## Consequence

**Severity:** advisory

A reader cross-checking the sequentiality claim against the three named pillars will find the chain genuinely incomplete and either (a) lose confidence in the aggregator, or (b) attempt to engineer the missing escape, encounter the Cross-mode rule by accident, and waste review cycles reconstructing the argument. No implementer who follows the linked topic pages will produce divergent runtime behaviour, but the argument as written is not self-supporting.

## Solution Space

**Shape:** single

### Recommendation

Insert a fourth premise in the parenthesised support list, naming the Cross-mode rule that closes the subagent escape, and add a corresponding non-existence test obligation:

1. **Spec edit (Session-model paragraph in `docs/spec.md`).** After the existing item (iii), add: *"and (iv) the rule, owned by [Invocation — Cross-mode semantics](./spec_topics/invocation.md#cross-mode-semantics), that a prompt-mode callee invoked from a subagent-mode parent attaches to the subagent's own private `AgentSession` rather than the user session — so the sibling-subagent fan-out path admitted by the next paragraph cannot re-enter the user session's `pi.setActiveTools` window."* The follow-up sentence that already enumerates "the three potential sources of in-session overlap" can stay as is; the new clause documents *why* a subagent-spawned prompt-mode body is not a fourth source.

2. **Plan edit (test obligation, V15j).** Extend V15j's Tests bullet to include a sequentiality assertion: spawn two concurrent subagent-mode siblings whose bodies each `invoke(...)` a prompt-mode child; assert that neither child issues a `pi.setActiveTools` call against the user session, and that the user session's active-tool set observed at any point during the run equals the snapshot taken before the outer slash invocation. This is the test the recommended spec edit forward-links to.

Edge cases the implementer must watch:

- The new test must verify zero `pi.setActiveTools` calls on the *user* session specifically — `pi.setActiveTools` is a user-session-only API per `pi-integration-contract.md`, but the test must distinguish "no call against the user session" from "no call anywhere" (the subagent's own session uses `customTools` on `AgentSession`, not `pi.setActiveTools`, so the latter check is trivially true and proves nothing).
- The fourth premise should not rephrase the Cross-mode rule; it should cite it. Inlining the rule in the orientation paragraph would re-create the over-prescription pattern that other findings on this page flag.

## Relationships

- T23 "Pi's per-session slash-handler serialisation is asserted without a verifiable Pi source" — same-cluster (different premise of the same argument).
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster (touches the same Session-model paragraph; co-edit pass).
- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — same-cluster (also concerns the sibling-subagent fan-out path, on the diagnostics axis; co-resolve siblings T19b/c/d/e also relevant).

---

# T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet

**Original heading:** Detailed architecture content in Orientation heading; out-of-scope statements buried in narrative
**Original section:** docs/spec.md — Orientation > Session model
**Split from:** "Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block" (entry 1 of 3)
**Kind:** placement
**Importance:** medium

## Finding

The `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites carries five distinct categories of content (Pi-session binding, `session_shutdown` payload contract, prompt-mode sequentiality argument, tool-table/transcript isolation, admission-cap and budget posture) compressed into one ~700-word block. This child handles the foundational reduction: trim the paragraph to the four sentences that actually belong at Orientation level and forward-link the rest. The architectural relocation and the scope-deferral lift are owned by sibling children T15b and T15c respectively; this child unblocks them by making room.

## Spec Documents

- `docs/spec.md` — Orientation > Prerequisites > Session model (edited)
- `docs/spec_topics/pi-integration-contract.md` — `ActiveInvocationRegistry`, Tool-registration lifetime and visibility, Session-shutdown semantics (read-only; remains the normative owner of the rules being orientation-only here)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** None — confined to the `spec.md` aggregator's prose organisation.

## Consequence

**Severity:** advisory

Until this reduction lands, sibling children T15b (architectural relocation) and T15c (scope-deferral lift) have nowhere to relocate content from — the paragraph remains a single mixed block.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Reduce the Session-model bullet at `docs/spec.md` Orientation > Prerequisites to four sentences:

1. The one-session-at-a-time binding (with the existing forward-link to PIC — Session-binding contract installed by T22a).
2. The `session_shutdown` payload reference and teardown forward-link.
3. The closed `event.reason` set anchored to the SDK type.
4. A forward-link to the new `Concurrency model` architectural home (created by sibling T15b).

Drop from this bullet (relocations owned by siblings): the prompt-mode sequentiality argument, the tool-table isolation explanation, the admission-cap statement, the per-invocation-budget statement, the parallel-`invoke` and concurrent-user-session scope deferrals.

Edge cases (applies to all children of T15):

- The reduced bullet MUST continue to anchor `<a id="session-model"></a>` so existing inbound links in the Overview's terminal-outcomes paragraph and elsewhere do not break.
- GOV-12 lock-step continues to apply between the reduced bullet and its owner pages.

## Relationships

- T15b "Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection" — co-resolve (the reduction makes room for the relocated content).
- T15c "Lift Session-model scope deferrals into Non-goals (V1) section" — co-resolve (the reduction makes room for the lifted deferrals).
- T02 "Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph" — same-cluster (identical placement pattern).
- T16a "Trust boundary bullet: keep scope claim and drop SDK-pin literal" — same-cluster (sibling Scope bullet exhibiting the same mixing of categories).
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — same-cluster (third instance of the pattern, in the Runtime-observability bullet).
- T24 "Fork-reason watcher closure leaves the extension in an unspecified, silently degraded state" — same-cluster (touches the same Session-model paragraph but addresses content correctness).

---

# T15b — Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection

**Original heading:** Detailed architecture content in Orientation heading; out-of-scope statements buried in narrative
**Original section:** docs/spec.md — Orientation > Session model
**Split from:** "Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block" (entry 2 of 3)
**Kind:** placement
**Importance:** medium

## Finding

The architectural half of the Session-model paragraph — prompt-mode strict sequentiality with its three supporting premises (i)/(ii)/(iii), mode-qualified isolation summary, the genuine-concurrency-only-between-subagent-invocations conclusion, the cancellation-propagates-downward-only restatement, per-invocation budget scoping — belongs in a normative-architectural home, not in an Orientation bullet labelled `*informative*`. This child creates that home and migrates the content; T15a removes the content from Orientation in coordination.

## Spec Documents

- `docs/spec.md` — Extension Architecture (edited; new Concurrency-model subsection added) OR Implementation Notes (edited; new Concurrency-model entry added) — implementer picks one per Edge cases below
- `docs/spec_topics/pi-integration-contract.md` — `ActiveInvocationRegistry`, Tool-registration lifetime and visibility, Session-shutdown semantics (read-only)
- `docs/spec_topics/implementation-notes.md` — No invocation cap, Per-invocation single-threaded execution (read-only)
- `docs/spec_topics/invocation.md` — Cross-mode semantics (read-only)
- `docs/spec_topics/frontmatter.md` — `tools` (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** None.

## Consequence

**Severity:** advisory

Without this relocation, the Concurrency-model content stays mis-placed in Orientation (after T15a's reduction it is dropped on the floor) and the architectural reader has no aggregator to land on.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Create a new `Concurrency model` subsection under Extension Architecture (sibling to Pi Extension Integration) or under Implementation Notes (as a new entry). This subsection owns:

- The mode-qualified isolation summary (cancellation always independent; transcript and tool-table isolation subagent-only).
- Prompt-mode strict sequentiality with its three supporting premises (i)/(ii)/(iii) preserved verbatim, plus T14's premise (iv) once that finding lands.
- The genuine-concurrency-only-between-subagent-invocations conclusion.
- The cancellation-propagates-downward-only restatement.
- Per-invocation budget scoping.

Each clause keeps its existing forward-links to PIC, Implementation Notes, Cancellation, Invocation, and Frontmatter — the topic pages remain the normative owners; this new section is an aggregator analogous to the Hard-ceilings bullet.

Edge cases (applies to all children of T15):

- The choice between `Extension Architecture` and `Implementation Notes` as the home follows whatever rule the spec establishes for prompt-vs-subagent-mode mechanics; pick one and apply it across the cluster of placement findings.
- All eleven existing forward-links must be preserved verbatim — this is a reorganisation, not a rewrite. GOV-12 lock-step continues to apply between this aggregator and its owner pages.

## Relationships

- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — co-resolve (the reduction at Orientation must land alongside this relocation).
- T15c "Lift Session-model scope deferrals into Non-goals (V1) section" — co-resolve (sibling restructure of the same paragraph).
- T14 "Prompt-mode sequentiality argument has an unstated fourth premise" — must-follow (the three premises being relocated are the ones T14 needs to extend with the fourth premise; the relocation is the natural moment to add it).
- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — same-cluster (lives in the same architectural area being created here; co-resolve siblings T19b/c/d/e also relevant).

---

# T15c — Lift Session-model scope deferrals into Non-goals (V1) section

**Original heading:** Detailed architecture content in Orientation heading; out-of-scope statements buried in narrative
**Original section:** docs/spec.md — Orientation > Session model
**Split from:** "Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block" (entry 3 of 3)
**Kind:** scope
**Importance:** medium

## Finding

Two scope deferrals are buried inside the Session-model paragraph rather than appearing in a Non-goals surface: `"V1 exposes no parallel-invoke surface"` (mid-clause inside premise (iii)) and `"Concurrent user sessions in the same host process are out of scope for V1 because Pi does not support them."` (terminal sentence). A reader scanning Orientation for V1 boundaries cannot find them. This child lifts both into the consolidated Non-goals (V1) section that document-level finding T38 calls for.

## Spec Documents

- `docs/spec.md` — Orientation > Prerequisites > Session model (edited; the two deferrals are removed in coordination with T15a's reduction)
- `docs/spec.md` — new Non-goals (V1) section (edited; created by T38)
- `docs/spec_topics/future-considerations.md` — Known V1 limitations (read-only; already records the concurrent-user-session deferral)
- `docs/spec_topics/invocation.md` — Cross-mode semantics (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** None.

## Consequence

**Severity:** advisory

Without this lift, the two scope deferrals remain invisible to a reader scanning Orientation for V1 boundaries; the consolidated Non-goals section, once created by T38, is missing two of its natural members.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Lift both scope deferrals into the new Non-goals (V1) section as two bullets:

- `Parallel invocation surface — V1 exposes no API by which a parent loom can spawn sibling invocations concurrently. (See [Invocation — Cross-mode semantics].)`
- `Concurrent user sessions in the same host process — Pi binds an extension to one active session at a time and V1 does not work around this. (See [Future Considerations — Known V1 limitations] and [Pi Integration Contract — Session-binding contract].)`

Edge cases (applies to all children of T15):

- If the co-resolved Non-goals section (T38) has not yet landed, gate this fix on it; do not invent a Non-goals home unilaterally.
- The forward-link `[Pi Integration Contract — Session-binding contract]` is the anchor installed by T22a; T22b's contingency entry should align with whichever bullet text lands here.

## Relationships

- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — co-resolve (the reduction removes the deferrals from the paragraph in the same edit pass).
- T15b "Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection" — co-resolve (sibling restructure of the same paragraph).
- T38 "Non-goals are not consolidated into a single section" — must-follow (the lift target only exists once T38 lands).
- T22b "Multi-session contingency response is unspecified in Future Considerations" — co-resolve (T22b proposes a forward-link from the closing scope sentence to `future-considerations.md#v1-non-goals`; the lift performed here is the natural target for that forward-link).

---

# T16a — Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal

**Original heading:** Trust boundary bullet mixes scope decision, normative error contracts, and future-consideration
**Original section:** docs/spec.md — Orientation > Scope > Trust boundary
**Split from:** "Trust boundary bullet conflates scope decision with normative contracts and a deferral" (entry 1 of 4)
**Kind:** placement
**Importance:** medium

## Finding

The Trust-boundary bullet's SDK-surface clause restates the V1 Pi-SDK pin literal (`~0.72.1`) inline, duplicating the literal owned by PIC — Host prerequisites. The behavioural content the scope decision actually rests on is "the four peer packages expose no per-extension privilege facet at the V1 Pi-SDK pin"; the literal version range belongs only to PIC. (Items 1 and 3 of the parent's Recommendation — keep the first sentence and scope claim, keep the no-extra-mediation sentence with its PIC forward-link — are preservation verifications folded into this child's edge cases since they require no rewrite.)

## Spec Documents

- `docs/spec.md` — Orientation > Scope > Trust boundary (edited)
- `docs/spec_topics/pi-integration-contract.md` — Host prerequisites — Pi SDK pin (read-only; owns the literal)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None — editorial.

## Consequence

**Severity:** advisory

Until this clause is reduced, the SDK-pin literal lives in two places that GOV-12 expects to drift on the next bump.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Reduce the SDK-surface clause to its behavioural content: "the four peer packages expose no per-extension privilege facet at the V1 Pi-SDK pin (the literal pin is owned by PIC)." Drop the `~0.72.1` parenthetical entirely. The "build-time SDK surface-inventory assertion" sentence about a future Pi privilege facet stays — it is a scope decision (detection point), not a normative contract on routing — reduced to one sentence with the forward-link to `pi-version-bump-procedure` retained.

Edge cases (applies to all children of T16):

- Preserve the bullet's first sentence ("V1 looms execute inside the Pi extension-host process at full Node host-process privilege.") and scope claim ("V1 imposes no loom-level sandbox.") verbatim.
- Preserve the "no extra mediation" sentence with its forward-link to PIC verbatim.
- The `bash` / `read` "illustrative" sentence is editorial colour, not scope-bearing; drop it in this pass.

## Relationships

- T16b "Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names" — co-resolve (same Trust-boundary bullet; must land in one commit).
- T16c "Reduce host-side-denial paragraph to one sentence with forward-links" — co-resolve.
- T16d "Replace closing capability-model paragraph with single forward-link sentence" — co-resolve.
- T34 "Trust-boundary 'no privilege facet' claim is asserted but not gated by any audit the spec cites" — same-cluster (same bullet; orthogonal fix — adds an audit citation rather than restructures placement).
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster (the Session-model paragraph exhibits the same aggregator-overreach pattern).

---

# T16b — Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names

**Original heading:** Trust boundary bullet mixes scope decision, normative error contracts, and future-consideration
**Original section:** docs/spec.md — Orientation > Scope > Trust boundary
**Split from:** "Trust boundary bullet conflates scope decision with normative contracts and a deferral" (entry 2 of 4)
**Kind:** placement
**Importance:** medium

## Finding

The Trust-boundary bullet's *callable-set* paragraph names `customTools` array on `createAgentSession` for subagent mode and `pi.setActiveTools` snapshot/restore for prompt mode — packaging-level details owned by PIC's `Tool-registration lifetime and visibility` and `Conversation drive — subagent mode` sections. The behavioural property the trust-boundary scope decision rests on is the per-mode wiring isolation, not the specific Pi APIs.

## Spec Documents

- `docs/spec.md` — Orientation > Scope > Trust boundary, callable-set paragraph (edited)
- `docs/spec_topics/pi-integration-contract.md` — Tool-registration lifetime and visibility; Conversation drive — subagent mode (read-only)
- `docs/spec_topics/frontmatter.md` — `tools` (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None — editorial.

## Consequence

**Severity:** advisory

If left unfixed, swapping Pi APIs in PIC requires a parallel edit to the aggregator bullet that GOV-12 expects to drift.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Keep the *callable-set* paragraph but state the behavioural isolation rule ("subagent-mode invocations see only the loom's declared callable set; prompt-mode invocations see the loom's declared callable set unioned with the user session's snapshot for the swap window") and forward-link to PIC's `Tool-registration lifetime and visibility` for the SDK-call mechanism. Drop the inline `customTools` / `createAgentSession` / `pi.setActiveTools` names.

Edge cases (applies to all children of T16):

- Do NOT delete the *callable set* clarification ("a configuration knob over the *model's* reachable callable set, NOT a host-process sandbox"). That distinction *is* the scope decision and would otherwise be stranded on `frontmatter.md`.

## Relationships

- T16a "Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal" — co-resolve.
- T16c "Reduce host-side-denial paragraph to one sentence with forward-links" — co-resolve.
- T16d "Replace closing capability-model paragraph with single forward-link sentence" — co-resolve.

---

# T16c — Reduce host-side-denial paragraph to one sentence with forward-links

**Original heading:** Trust boundary bullet mixes scope decision, normative error contracts, and future-consideration
**Original section:** docs/spec.md — Orientation > Scope > Trust boundary
**Split from:** "Trust boundary bullet conflates scope decision with normative contracts and a deferral" (entry 3 of 4)
**Kind:** placement, prescription
**Importance:** medium

## Finding

The Trust-boundary bullet's host-side-denial paragraph inlines the full denial-routing rule (`Err(QueryError { kind: "code_tool", cause: "execution", ... })`), the non-conforming-envelope handling (routed off `CodeToolError` to `loom/runtime/internal-error` with `details.kind = "tool-return-shape"`), the non-settling-Promise behaviour, and the post-cancel late-settlement discard rule. These are owned verbatim by `tool-calls.md` — Failures and `pi-integration-contract.md` — Tool execution from loom code; restating them here creates two normative copies GOV-12 expects to drift.

## Spec Documents

- `docs/spec.md` — Orientation > Scope > Trust boundary, host-side-denial paragraph (edited)
- `docs/spec_topics/tool-calls.md` — Failures / Outcome enumeration (read-only)
- `docs/spec_topics/pi-integration-contract.md` — Tool execution from loom code (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None — editorial.

## Consequence

**Severity:** advisory

The next time `tool-calls.md` widens the `CodeToolError.cause` enum, the aggregator bullet becomes a stale duplicate.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Reduce the host-side-denial paragraph to one sentence:

> Host-side denials of filesystem, network, or Pi-API access reach loom code through the tool that issued the request; the complete enumeration of observable `execute()` outcomes — including non-conforming return envelopes, non-settling Promises, and post-cancel late settlements — is owned by [Tool Calls — Failures](./spec_topics/tool-calls.md) and [Pi Integration Contract — Tool execution from loom code](./spec_topics/pi-integration-contract.md#tool-execution-from-loom-code); silent success on denial is forbidden.

Drop the parenthetical reproductions of `Err(QueryError { kind: "code_tool", cause: "execution", ... })` and `details.kind = "tool-return-shape"`.

## Relationships

- T16a "Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal" — co-resolve.
- T16b "Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names" — co-resolve.
- T16d "Replace closing capability-model paragraph with single forward-link sentence" — co-resolve.

---

# T16d — Replace closing capability-model paragraph with single forward-link sentence

**Original heading:** Trust boundary bullet mixes scope decision, normative error contracts, and future-consideration
**Original section:** docs/spec.md — Orientation > Scope > Trust boundary
**Split from:** "Trust boundary bullet conflates scope decision with normative contracts and a deferral" (entry 4 of 4)
**Kind:** placement, scope
**Importance:** medium

## Finding

The closing paragraph of the Trust-boundary bullet ("A per-loom capability model is **out of scope for V1** and is not anticipated by V1; introducing one would require a migration.") duplicates the already-owned bullet at `future-considerations.md` — No per-loom sandbox or capability model. The deferral lives correctly on `future-considerations.md` and should be a forward-link from the bullet, not a restatement.

## Spec Documents

- `docs/spec.md` — Orientation > Scope > Trust boundary, closing paragraph (edited)
- `docs/spec_topics/future-considerations.md` — No per-loom sandbox or capability model (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None — editorial.

## Consequence

**Severity:** advisory

Until this paragraph is reduced to a forward-link, `future-considerations.md` revisions to the capability-model framing must be mirrored in the aggregator bullet.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Replace the closing capability-model paragraph with a single forward-link sentence:

> A per-loom capability model is out of V1 scope; see [Future Considerations — No per-loom sandbox or capability model](./spec_topics/future-considerations.md). When a doc-level Non-goals section lands (separate finding), this disclaimer relocates there.

## Relationships

- T16a "Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal" — co-resolve.
- T16b "Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names" — co-resolve.
- T16c "Reduce host-side-denial paragraph to one sentence with forward-links" — co-resolve.
- T38 "Non-goals are not consolidated into a single section" — must-follow (the disclaimer's permanent home is the proposed doc-level Non-goals section once T38 lands).

---

# T17 — `console.error` teardown sink: unverified and over-prescribed in aggregator

**Original heading:** `console.error` teardown sink: unverified and over-prescribed in aggregator
**Original section:** docs/spec.md — Orientation > Prerequisites > Pi SDK and capabilities
**Kind:** assumptions, prescription
**Importance:** medium

**STATUS:** Merged into T24 on 2026-05-08. The `console.error` last-resort sink contract is tightened (drop redundant channel/mechanism prose from spec.md aggregator; cite Pi stdio policy in PIC) in the same commit that lands T24 Option A's `loom/host/discovery-degraded-after-shutdown` diagnostic. The body below is retained for traceability; the actionable hardened recommendation lives in T24.

## Finding

The Session-model paragraph in `docs/spec.md` (Orientation > Prerequisites) ends an `event.reason`-routing sentence with a parenthetical that names the teardown-handler sink and the control-flow mechanism inline:

> "…the teardown-handler last-resort sink defined in [Pi Integration Contract — Extension entry point, step 4](./spec_topics/pi-integration-contract.md#diagnostic-emission-isolation) (the rule that pins `console.error` as the channel and wraps every teardown-handler emission in `try`/`catch` so a throw from the sink does not unwind the handler)…"

Two distinct issues sit on top of each other.

**(1) Aggregator over-prescription.** The parenthetical restates the channel (`console.error`) and the mechanism (`try`/`catch`) that PIC's *Diagnostic-emission isolation* rule (`docs/spec_topics/pi-integration-contract.md`, around line 131) already owns verbatim. The aggregator's job at this site is to forward-link the rule and name the behavioural contract — "emissions reach an out-of-band channel and never unwind the teardown handler" — not to duplicate the implementation choices. If PIC's rule changes (e.g. swaps to `process.stderr.write`, or wraps each emission in a small helper), spec.md drifts silently.

**(2) Unverified host assumption.** The choice of `console.error` as the last-resort sink is reasoned about in PIC and `diagnostics.md` purely from the loom side: `pi.sendMessage` may be invalidated mid-teardown, so something other than the SDK channel is needed. Neither PIC nor `diagnostics.md` cites Pi's policy for extension stdio — whether Pi captures, redirects, swallows, or surfaces extension `console.*` writes to the user's terminal. Without that citation, the claim that `console.error` is in fact a *visible* operator surface during teardown is an implicit assumption rather than an established host contract. If Pi captures extension stdio into a buffer that is itself torn down with the extension runtime, the three teardown diagnostics (`loom/runtime/reload-teardown-timeout`, `loom/host/session-shutdown-reason-unknown`, `loom/host/session-shutdown-teardown-step-failed`) reach no operator at all.

## Spec Documents

- `docs/spec.md` — Orientation > Prerequisites > Session model (the `event.reason`-routing parenthetical) — (edited)
- `docs/spec_topics/pi-integration-contract.md` — Extension entry point > Diagnostic-emission isolation — (edited)
- `docs/spec_topics/diagnostics.md` — Persistent diagnostics carve-outs and `loom/host/*` namespace prose — (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. No current plan leaf implements the `session_shutdown` teardown handler or its three `console.error`-routed diagnostics; H4 establishes the unrelated `sendSystemNote` fallback chain, and V18f / V18r cover file and settings watchers. The fix here is purely an aggregator-wording change in `spec.md` plus a host-policy citation in PIC; neither alters acceptance criteria for any existing leaf.

## Consequence

**Severity:** advisory

If left unfixed, spec.md's parenthetical drifts the moment PIC's *Diagnostic-emission isolation* rule changes shape, and a future reader cannot tell which of the two statements is normative. The unverified stdio assumption is more substantive: an implementer who relies on `console.error` for teardown-time operator visibility may be silently wrong about what reaches the user, and there is no documented fallback if Pi's stdio capture policy makes the channel invisible.

## Solution Space

**Shape:** single

### Recommendation

**In `spec.md` (Session-model parenthetical).** Replace the inline channel-and-mechanism description with a behavioural-contract phrase plus a forward link only:

> "…via the teardown-handler last-resort sink defined in [Pi Integration Contract — Extension entry point — Diagnostic-emission isolation](./spec_topics/pi-integration-contract.md#diagnostic-emission-isolation) (the sink reaches an out-of-band channel and never unwinds the teardown handler)…"

The concrete channel name (`console.error`) and control-flow primitive (`try`/`catch`) MUST live only in PIC. Apply the same reduction at the structurally identical site later in the same paragraph that names "the teardown-handler last-resort sink."

**In `docs/spec_topics/pi-integration-contract.md` (Diagnostic-emission isolation).** Anchor the choice of `console.error` to a Pi-side citation. The rule already enumerates the failure modes the wrapping `try`/`catch` defends against (closed stdio, FD exhaustion, throwing proxy); add one sentence citing the Pi SDK or extension-host documentation passage that establishes Pi does not capture or suppress extension stdio (or, if Pi *does* capture it, name where the captured stream surfaces and confirm operator visibility during teardown). If the citation cannot be produced from the current SDK pin, file the gap as a `loom/host/*` follow-up and state explicitly in PIC that the visibility of teardown-time `console.error` writes is V1-best-effort pending verification at the next SDK pin bump.

**Edge cases for the implementer.** (i) Both spec.md edits are pure wording reductions — no behaviour changes, no new diagnostic codes, no test impact. (ii) The PIC citation is additive: the existing *Diagnostic-emission isolation* contract stays intact; the new sentence only attaches a host-side warrant. (iii) If verification reveals Pi *does* swallow extension stdio, the three teardown diagnostics need a different last-resort sink (e.g. write to a loom-controlled file under `~/.pi/` before returning from the handler), which would be a follow-up finding, not part of this fix.

## Relationships

- T24 "Fork-reason watcher closure leaves the extension in an unspecified, silently degraded state" — co-resolve (both edit PIC step 4's per-step isolation paragraph and rely on the `console.error` last-resort sink).

---

# T18a — Append success-side null-policy paragraph to PIC Runtime event channel

**Original heading:** Success-outcome observability and operator-channel obligations undefined
**Original section:** docs/spec.md — Orientation > Scope > Runtime observability
**Split from:** "Success-side operator observability is unstated" (entry 1 of 4)
**Kind:** completeness
**Importance:** medium

## Finding

The always-log set defined in `pi-integration-contract.md` Runtime event channel covers only failure outcomes. The spec never makes the symmetric statement on the success side: that a loom terminating with `Ok(v)` emits nothing on `loom-system-note`, and that an `invoke` parent's success observation is purely programmatic. This child installs the central success-side null-policy paragraph in PIC, on which the sibling per-surface restatements (T18b, T18c) and the leaf-internal test (T18d) all depend.

## Spec Documents

- `docs/spec_topics/pi-integration-contract.md` — Runtime event channel (edited; one paragraph appended)
- `docs/spec_topics/glossary.md` — `always-log set` entry (read-only)
- `docs/spec_topics/invocation.md` — Final-value propagation across callees (read-only; the existing programmatic-side counterpart sentence reads correctly once this null-policy lands centrally)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18q — Runtime event channel and always-log emission — (modified by sibling T18d; this child only edits the spec)

## Consequence

**Severity:** advisory

Until the central null-policy lands in PIC, the per-surface restatements have nothing to anchor against and the test in T18d has no spec sentence to assert.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Append a short paragraph to `pi-integration-contract.md` Runtime event channel immediately after the always-log-set enumeration:

> Successful terminal outcomes (a loom whose body produces an `Ok` final value, including a child loom whose `Ok` flows to its `invoke` parent) emit no event on the `loom-system-note` channel. The channel is failure-only by design; success surfaces are the driven conversation (prompt mode) and the programmatic return value (every mode). This is the success-side counterpart of the always-log set's failure inventory.

Edge cases (applies to all children of T18):

- The binder echo (`bind_echo: true`) and the no-params overflow note are pre-evaluation surfaces and remain operator-visible regardless of terminal outcome; the success-side null applies only to the *terminal* surface.
- Do NOT add a "completed" parity note for subagent slash invocations — the existing failure-only convention is intentional; adding a success note would re-open the deferred aggregation/latency surface already scoped out of V1.

## Relationships

- T18b "Add per-mode operator-side null sentences to slash-invocation.md" — must-precede (the central PIC paragraph must land before the slash-invocation restatement points at it).
- T18c "Widen spec.md Runtime observability bullet to forward-link the null-policy" — must-precede (the bullet's forward-link target must exist).
- T18d "Add V18q test asserting zero `loom-system-note` emissions on successful termination" — must-precede (the test asserts against the spec sentence installed here).
- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — same-cluster (operator-surface gap on the failure side; symmetric to this child's success-side gap; co-resolve siblings T19b/c/d/e also relevant).
- T06 "Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers" — same-cluster.

---

# T18b — Add per-mode operator-side null sentences to slash-invocation.md

**Original heading:** Success-outcome observability and operator-channel obligations undefined
**Original section:** docs/spec.md — Orientation > Scope > Runtime observability
**Split from:** "Success-side operator observability is unstated" (entry 2 of 4)
**Kind:** completeness
**Importance:** medium

## Finding

`slash-invocation.md` *Once a loom is invoked* describes the per-mode invocation surfaces but is silent on the operator-side success outcome. Both prompt-mode and subagent-mode bullets need an explicit null sentence so a reader does not have to triangulate across PIC and `invocation.md` to confirm the absence is deliberate.

## Spec Documents

- `docs/spec_topics/slash-invocation.md` — Once a loom is invoked, prompt-mode and subagent-mode bullets (edited)
- `docs/spec_topics/pi-integration-contract.md` — Runtime event channel (read-only; the central rule installed by T18a)

## Plan Impact

**Phases:** None (V18i remains read-only)

**Leaves (implementation order):** None.

## Consequence

**Severity:** advisory

Without these per-mode sentences, slash-invocation readers see no operator-side null and may assume a missing completion note is a defect.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Add one sentence to each of the prompt-mode and subagent-mode bullets in `slash-invocation.md` *Once a loom is invoked*:

- **Prompt mode:** *"No `loom-system-note` is emitted on successful termination; the conversation is the operator-visible surface."*
- **Subagent mode:** *"On successful termination the operator sees no terminal note (the subagent transcript is private and the return value reaches only the programmatic caller); the operator-visible surfaces in subagent slash invocations are the pre-start binder echo and, on failure, the top-level `Err` note formatted per the table below."*

Edge cases (applies to all children of T18): see T18a's edge-case list.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-follow (the central rule must land first).
- T18c "Widen spec.md Runtime observability bullet to forward-link the null-policy" — co-resolve (sibling per-surface restatement; same edit pass).
- T18d "Add V18q test asserting zero `loom-system-note` emissions on successful termination" — co-resolve.

---

# T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy

**Original heading:** Success-outcome observability and operator-channel obligations undefined
**Original section:** docs/spec.md — Orientation > Scope > Runtime observability
**Split from:** "Success-side operator observability is unstated" (entry 3 of 4)
**Kind:** completeness
**Importance:** medium

## Finding

`spec.md`'s Runtime observability bullet currently reads as failure-only without acknowledging the success-side null-policy. Reviewers auditing the operator-visibility contract from the aggregator have to follow links to PIC and `slash-invocation.md` to confirm the absence is deliberate. The bullet should widen to name the null-policy and forward-link the per-surface owners.

## Spec Documents

- `docs/spec.md` — Orientation > Scope > Runtime observability (edited)
- `docs/spec_topics/pi-integration-contract.md` — Runtime event channel (read-only; the central rule installed by T18a)
- `docs/spec_topics/slash-invocation.md` — Once a loom is invoked (read-only; the per-mode null sentences installed by T18b)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None.

## Consequence

**Severity:** advisory

Until this widening lands, the aggregator misses the chance to forward-link the null-policy and reviewers continue triangulating.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

In `spec.md` Orientation > Scope > Runtime observability, replace "*Operator*-facing runtime failure events are emitted…" with a widened opening:

> *Operator*-facing observability of loom termination is failure-only on the `loom-system-note` channel; the always-log set… (existing text). Successful terminations emit nothing on this channel — see [Pi Integration Contract — Runtime event channel](./spec_topics/pi-integration-contract.md) for the explicit success-side null-policy and [Slash-Command Invocation](./spec_topics/slash-invocation.md) for the per-mode operator surfaces.

Edge cases (applies to all children of T18): see T18a's edge-case list.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-follow.
- T18b "Add per-mode operator-side null sentences to slash-invocation.md" — co-resolve.
- T18d "Add V18q test asserting zero `loom-system-note` emissions on successful termination" — co-resolve.

---

# T18d — Add V18q test asserting zero `loom-system-note` emissions on successful termination

**Original heading:** Success-outcome observability and operator-channel obligations undefined
**Original section:** docs/plan_topics/v18-cancellation.md
**Split from:** "Success-side operator observability is unstated" (entry 4 of 4)
**Kind:** completeness
**Importance:** medium

## Finding

V18q already asserts that the four excluded `kind`s emit zero events on the always-log channel; it does not yet assert the symmetric success-side null. Once T18a installs the central rule, V18q needs a parallel test or two compliant implementations could still ship divergent behaviour on success.

## Spec Documents

- `docs/plan_topics/v18-cancellation.md` — V18q Tests (edited)
- `docs/spec_topics/pi-integration-contract.md` — Runtime event channel (read-only; the central rule installed by T18a)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18q — Runtime event channel and always-log emission — (modified; one new test row)

## Consequence

**Severity:** advisory

Without this test, the success-side null-policy installed by T18a is asserted only in prose; the leaf's *Ships when* condition does not catch a regression.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

Add a leaf-internal test to V18q asserting zero `loom-system-note` emissions on a successful prompt-mode loom and on a successful slash-invoked subagent-mode loom, mirroring V18q (b)'s structure for the four excluded kinds.

Edge cases (applies to all children of T18): see T18a's edge-case list.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-follow.
- T18b "Add per-mode operator-side null sentences to slash-invocation.md" — co-resolve.
- T18c "Widen spec.md Runtime observability bullet to forward-link the null-policy" — co-resolve.

---

# T19a — Extend ActiveInvocationRegistry entry shape with invocationId

**Original heading:** Concurrent subagent sibling failure: no aggregation rule for parent or operator surface
**Original section:** docs/spec.md — Orientation > Session model
**Split from:** "Concurrent subagent siblings: no operator demultiplexing or sibling-failure timing rule" (entry 1 of 5, second reshape pass 2026-05-11; chosen Option A's `Spec edits` block)
**Kind:** error-model
**Importance:** high

## Finding

The parent finding established that `RuntimeEvent` carries no per-invocation correlation key, so concurrent sibling diagnostics from the same loom are indistinguishable on the operator stream and the dedup key collides under same-tick fan-out. Decision (2026-05-08) was Option A: add a per-invocation correlation key sourced at the registry-insertion site. This child installs the registry-side change — extending the `ActiveInvocationRegistry` entry shape with `invocationId: string` and pinning the id-derivation rule. Sibling children T19b–T19e add the field to the `RuntimeEvent` wire shape, widen the dedup key, populate the `cancelled-by-session-shutdown` details, and pin the timing rule respectively. All five must land in one V18q commit (co-resolve cluster) to keep the additive `RuntimeEvent` contract intact.

## Spec Documents

- `docs/spec_topics/pi-integration-contract.md` — `ActiveInvocationRegistry` entry shape; Per-mode concurrency invariants (edited)
- `docs/spec_topics/tool-calls.md` — Concurrency section (read-only — establishes the sibling-spawn surface this child's id-derivation runs at)

## Plan Impact

**Phases:** V12, V14, V15

**Leaves (implementation order):**

- V12a — `mode: subagent` accepted; AgentSession spawn — (modified — subagent spawn site is one registry-insertion point that must source the `invocationId`)
- V14e — Pi tool wired into `@` queries as model-callable — (modified — parallel tool-call path into a `.loom` callable is the dominant sibling-spawn surface; tests must cover concurrent-sibling registry-insertion correctness)
- V15g — `invoke(...)` to subagent-mode callee — (modified — second registry-insertion site for sibling-bearing concurrency)

## Consequence

**Severity:** correctness

Without the entry-shape extension, the per-invocation correlation key has no canonical home and sibling diagnostics emitted from concurrent invocations remain indistinguishable on the operator stream regardless of how the wire shape evolves.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

In `pi-integration-contract.md` `ActiveInvocationRegistry`, extend the entry shape from `Set<{ loomAbort: AbortController; disposeBarrier: Promise<void> }>` to `Set<{ loomAbort: AbortController; disposeBarrier: Promise<void>; invocationId: string }>` and pin the id-derivation rule: each entry's `invocationId` is sourced via `crypto.randomUUID()` at the registry-insertion site (slash-handler entry, `tool.execute(...)` adapter entry, or `invoke(...)` spawn site) and is used for the entry's lifetime.

Edge cases (applies to all children of T19):

- The `invocationId` derivation MUST run inside the **Dispatch-site setup wrap** `try`/`catch`, before any awaitable work, so a setup-time throw still has an id available for the `internal-error` emission.
- Two registry entries must never share an id (covered by `crypto.randomUUID` collision-resistance, the same assumption the V1 SHA-256 schema-slug rule already takes).
- The cascade-twin re-emission rule extends to `invocation_id` (copy verbatim, never re-derive at the boundary site).

## Relationships

- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve.
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede (any decision to add operator-visibility for successful sibling outcomes will reuse the `invocation_id` field this child installs).
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.

---

# T19b — Add invocation_id field to RuntimeEvent payload declaration

**Original heading:** Concurrent subagent sibling failure: no aggregation rule for parent or operator surface
**Original section:** docs/spec.md — Orientation > Session model
**Split from:** "Concurrent subagent siblings: no operator demultiplexing or sibling-failure timing rule" (entry 2 of 5, second reshape pass 2026-05-11; chosen Option A's `Spec edits` block)
**Kind:** error-model
**Importance:** high

## Finding

The parent finding's Decision was Option A: add `invocation_id: string` to `RuntimeEvent` so emissions carry the per-invocation correlation key sourced by sibling T19a's registry change. This child adds the field to the wire shape; siblings T19a/c/d/e provide the registry-side source, dedup-key widening, cancelled-shutdown details population, and timing rule respectively.

## Spec Documents

- `docs/spec_topics/pi-integration-contract.md` — `RuntimeEvent` payload shape declaration; additive-only contract note (edited)
- `docs/spec_topics/glossary.md` — `RuntimeEvent` / always-log set entries (edited if the glossary lists the field set; otherwise read-only)

## Plan Impact

**Phases:** V18

**Leaves (implementation order):**

- V18q — Runtime event channel and always-log emission — (modified — owns the `RuntimeEvent` payload shape; the emission helper that builds events must include the field; V18q test (f) needs updating for the new required field)

## Consequence

**Severity:** correctness

Without this field on the wire shape, registry-sourced `invocationId` values (sibling T19a) have no destination and sibling correlation cannot be observed by operator-side consumers.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

In `pi-integration-contract.md`'s `RuntimeEvent` declaration, add `invocation_id: string;` as a required additive field. Note it on the additive-only contract (the addition is forward-compatible with the existing wire shape; consumers tolerant of unknown fields stay correct).

Edge cases (applies to all children of T19): see T19a's edge-case list. Additionally, V18q test (f) and the JSON-stringify-tolerant assumptions of the dedup-key tests need updating to admit the new field.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve (this child consumes the field T19a sources).
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.

---

# T19c — Widen always-log dedup key to include invocation_id

**Original heading:** Concurrent subagent sibling failure: no aggregation rule for parent or operator surface
**Original section:** docs/spec.md — Orientation > Session model
**Split from:** "Concurrent subagent siblings: no operator demultiplexing or sibling-failure timing rule" (entry 3 of 5, second reshape pass 2026-05-11; chosen Option A's `Spec edits` block)
**Kind:** error-model
**Importance:** high

## Finding

The parent finding identified that the dedup key `(kind, query_site, message, occurred_at)` collides on real clocks when two siblings of the same loom fail at the same millisecond. The Decision was Option A: widen the dedup key to include the per-invocation correlation key. This child installs the dedup-rule change; siblings provide the registry source, the wire field, the cancelled-shutdown details, and the timing rule.

## Spec Documents

- `docs/spec_topics/pi-integration-contract.md` — Runtime event channel — Deduplication and lifetime rules (edited)

## Plan Impact

**Phases:** V18

**Leaves (implementation order):**

- V18q — Runtime event channel and always-log emission — (modified — implements the dedup-key check; tests must cover same-tick concurrent-sibling collisions per the Recommendation edge case)

## Consequence

**Severity:** correctness

Without per-invocation dedup, two siblings failing at the same `Clock.now()` tick collapse to one note on the operator stream and one of the failures vanishes. V18q test (l) currently uses `FakeClock.advance` to force distinct `occurred_at` values, but two real siblings on a real clock can hit the same millisecond.

## Solution Space

**Shape:** single
**Atomicity:** atomic

### Recommendation

In `pi-integration-contract.md` Runtime event channel — Deduplication and lifetime rules, widen the dedup key from `(kind, query_site, message, occurred_at)` to `(invocation_id, kind, query_site, message, occurred_at)`. State explicitly that the always-log channel is session-flat at the wire level but the dedup key is per-invocation.

Edge cases (applies to all children of T19): see T19a's edge-case list. Additionally, V18q test (l) should be supplemented with a same-tick concurrent-sibling test that exercises the per-`invocation_id` dedup arm without advancing the clock.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve.
- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve (this child reads the field T19b adds).
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.


