# Triaged Spec Review — spec.md

_Generated: 2026-05-08T09:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding in the file (T22b, after the 2026-05-11 reshape-extract pass excised T22a to `spec-review-needs-reshape.md`) is addressed first; the first finding in the file (T02, after the 2026-05-11 spec-sweeps extraction) is addressed last in addressing order. After the reshape pass, split children replace their parents at the parent's file position; addressing within a child cluster runs alphabetically (a addressed first)._

_Triage tally: 10 high, 26 medium retained; 38 low discarded; 0 low findings merged into 0 medium findings; 0 nit dropped; 0 false dropped. (Updated 2026-05-11 manual T03 split: +5 medium for the additional T03b–T03f children replacing the original T03; T03 was importance:medium, all six children inherit medium.) (Updated 2026-05-11 reshape-extract pass: T22a parked to `docs/spec-review-needs-reshape.md` per criterion 4 — verbatim-source-citation pattern; −1 medium.) (Updated 2026-05-12 T22a sub-split: T22a further split into T22a1 — anchor + paraphrase + spec.md forward-link, auto-resolvable, re-queued in this file — and T22a2 — citation upgrade, remains parked in `spec-review-needs-reshape.md` pending human SDK verification; +1 medium re-queued.)_

_Decision tally (recorded 2026-05-08): all 18 `Shape: multiple` findings resolved to `Shape: single`. 6 findings merged at decision time: T17→T24, T28→T27, T29→T30, T31→T32, T33→T03, T45→T44. See per-finding **Decision** / **STATUS** lines._

_Reshape pass (2026-05-11, mode `reshape-only`, `PreserveIDs: true`): T01 and T04 extracted into [`docs/spec-sweeps.md`](./spec-sweeps.md) as deferred mechanical sweeps that cannot be addressed atomically by the per-finding fix-loop; T03 flagged UNSPLITTABLE (composite-3+ with no enumerable Edit Plan in its Recommendation blocks); T11 split into T11a/b/c (must-precede chain); T15 split into T15a/b/c (co-resolve cluster); T16 split into T16a/b/c/d (co-resolve cluster); T18 split into T18a/b/c/d (T18a must-precede the rest)._

_Second reshape pass (2026-05-11, mode `reshape-only`, `PreserveIDs: true`, re-run with broadened splitter logic): T08 split into T08a/b/c (co-resolve cluster — three per-file prose sweeps via splitter location (v) `(file, verb)` prose pairs); T19 split into T19a/b/c/d/e (co-resolve cluster — five entries from chosen Option A's `Spec edits` block via splitter location (iv)). T03 re-flagged UNSPLITTABLE with refreshed diagnostic — under current splitter logic Option B's `Spec edits` block enumerates 3 bullets (one no-op, one composite-2), and the Decision-block-level *Absorbed T33 Option A spec edits* bullets are not captured by any source location, so a clean mechanical split would strand 3 of the 6 effective edits._

_Manual T03 reshape (2026-05-11): T03 split into T03a/b/c/d/e/f (must-precede chain plus same-cluster siblings). The split consolidates Option B's chosen `**Spec edits.**` bullets and the Decision-block's *Absorbed T33 Option A spec edits* bullets into a unified 6-edit set; pairwise dependencies make T03a (PIC sub-paragraph addition) and T03b (`SDK_SURFACE_INVENTORY` row) the cluster roots, T03c/d/e/f the dependents. The T33 absorption metadata is preserved via the `**Split from:**` field on each child._

_Reshape-extract pass (2026-05-11): T22a excised to [`docs/spec-review-needs-reshape.md`](./spec-review-needs-reshape.md) — divergence criterion 4 (verbatim-source-citation pattern alongside existing paraphrase; confirmed divergence case from divergence-analysis.md). T22b and T22c remain in file but are blocked pending T22a resolution. 1 medium finding parked._

_T22a sub-split (2026-05-12, manual): T22a further split into T22a1 (anchor + paraphrase + spec.md forward-link only — auto-resolvable, re-queued at end-of-file so the picker addresses it before T22b/T22c under bottom-up convention) and T22a2 (Pi-source citation upgrade — remains parked in [`spec-review-needs-reshape.md`](./spec-review-needs-reshape.md), gated on a human inspecting `docs/sdk.md`'s extension-lifecycle section). The criterion-4 divergence trigger is confined to T22a2; T22a1's edit set installs the `#session-binding-contract` anchor that T22b and T22c consume, unblocking both for the auto fix-loop._

# T02 — Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph

**Original heading:** Subagent state-isolation detail misplaced in Overview
**Original section:** docs/spec.md — Overview
**Kind:** placement
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The second paragraph of `docs/spec.md`'s `## Overview` section embeds an inline parenthetical enumerating the per-axis subagent state-isolation contract (what the spawned session inherits from the loom's frontmatter, what is forwarded from the caller's `ExtensionCommandContext`, and what is not inherited). The same sentence already forward-links to the **Subagent state-isolation matrix** at `docs/spec_topics/pi-integration-contract.md#subagent-state-isolation-matrix`, which is the canonical owner of that enumeration. Restating the axes in the Overview duplicates owner-page content in an aggregator (against the aggregator-vs-source convention in `docs/spec_topics/governance.md` GOV-12) and creates a stale-reference risk whenever the matrix's column membership changes.

## Solution approach

Delete the inline per-axis parenthetical from the Overview paragraph and rewrite the surrounding sentence as a one-line orientation pointer to the matrix anchor, retaining the existing forward-link to `./spec_topics/glossary.md` for the `callable set` definition the matrix prose depends on. The forward-link target `#subagent-state-isolation-matrix` is preserved unchanged so the H6 REQ-ID anchor-retarget pass still sees a single edit site.

## Solution constraints

- Do not migrate the deleted axis names into `pi-integration-contract.md`; the matrix already owns that enumeration and restating it as PIC prose would introduce a new aggregator/owner duplication.
- Preserve the existing forward-link target `./spec_topics/pi-integration-contract.md#subagent-state-isolation-matrix` and the `./spec_topics/glossary.md` `callable set` link in the rewritten sentence.
- Out of scope: the `<a id="terminal-outcomes-aggregator">` paragraph that immediately follows is a separate placement finding (T26) and is not edited here.
- [default] Edit only the Overview paragraph in `docs/spec.md`; do not modify the matrix, the glossary, or governance GOV-12.

## Success criteria

- In `docs/spec.md`'s `## Overview` section, no occurrences remain of the inline per-axis enumeration tokens `transcript`, `system prompt`, `ambient tool set`, `cancellation controller`, or `params` and `bindings` listed as a parenthetical of the subagent state-isolation contract.
- The Overview paragraph contains exactly one link to `./spec_topics/pi-integration-contract.md#subagent-state-isolation-matrix` and exactly one link to `./spec_topics/glossary.md` for `callable set`.
- The anchor `id="subagent-state-isolation-matrix"` continues to exist in `docs/spec_topics/pi-integration-contract.md` and the Overview link to it resolves.

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
**Shape:** single
**State:** reduced

## Problem

In `docs/plan_topics/h1-scaffold.md`, the H1 manifest test bullet that asserts the `semver` / `@types/semver` `package.json` entries currently anchors at the dependency-pinning parenthetical in PIC's two `*Recommended recipe (non-normative).*` paragraphs — a parenthetical that T03c deletes once T03a installs the dedicated `**Loom-package implementation dependencies (V1).**` sub-paragraph in `**Host prerequisites.**`. Separately, the `package.json` `engines.node` literal-read test currently asserts only that the loom literal matches its own pinned string; it does not read `@mariozechner/pi-coding-agent`'s `engines.node` field, so a Pi minor bump that moves the upstream Node floor cannot fail this gate at the bump commit. T03b adds a `pi-engines-node` row to `SDK_SURFACE_INVENTORY` so the cross-package floor and the four already-pinned constants share one source of truth, but no assertion in `test/extension/pinned-surface.test.ts` (or its `engines.node` sibling) yet consumes that row.

## Solution approach

In `docs/plan_topics/h1-scaffold.md`, rewrite the `semver` / `@types/semver` manifest-assertion bullet so its spec anchor points at PIC's `**Loom-package implementation dependencies (V1).**` sub-paragraph (the sub-paragraph T03a installs) instead of at the recipe parentheticals, and add an extension to the `engines.node` literal-read test bullet (or the SDK surface-inventory bullet, whichever owns the `pi-engines-node` row T03b adds) describing a cross-package equality assertion that reads `@mariozechner/pi-coding-agent`'s `engines.node` and compares it literally against the loom literal. Use stable wording for the path-resolution mechanism — name `require.resolve` (or an equivalent that does not hard-code a `node_modules/...` path) so the assertion works under both workspace and pnpm-hoisting layouts. Frame the comparison as exact string equality, matching H1's existing posture on `engines.node` and `peerDependencies`.

## Solution constraints

- Edit only `docs/plan_topics/h1-scaffold.md` under this finding; do not modify `docs/spec_topics/pi-integration-contract.md`, `docs/spec.md`, or any test source file.
- The `semver` manifest assertion MUST anchor at PIC's `**Loom-package implementation dependencies (V1).**` sub-paragraph; the `@types/semver` entry MUST be asserted under `devDependencies` (not `dependencies`).
- The cross-package `engines.node` assertion MUST locate Pi's `package.json` via a path-resolution mechanism that does not hard-code a `node_modules/...` segment (so workspace and pnpm-hoisting layouts both work).
- The cross-package comparison MUST be specified as literal string equality, not as `semver.subset` / `semver.satisfies` / any range check.
- The `pi-engines-node` row in `SDK_SURFACE_INVENTORY` (added by T03b) MUST be named as the single source of truth the cross-package assertion consumes; do not introduce a parallel literal in the H1 test description.
- T03a and T03b are must-precede; this edit MUST NOT land before both (the sub-paragraph and the inventory row this finding's bullet references must already exist).
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.
- [default] Limit edits to the manifest-assertion bullet (re-anchor) and the `engines.node` / `pi-engines-node` test-bullet extension; do not author new MUSTs, restructure unrelated H1 bullets, or revise the `Deps.` / `Ships when.` paragraphs.

## Success criteria

- The `semver` / `@types/semver` manifest-assertion bullet in `docs/plan_topics/h1-scaffold.md` cites `**Loom-package implementation dependencies (V1).**` (or an equivalent reference to that sub-paragraph) as its spec anchor, and contains no link or prose pointing at the Step 0 (a) or Step 0 (d) `*Recommended recipe (non-normative).*` parentheticals as the dependency-pinning anchor.
- The `@types/semver` assertion in that bullet is described as a `devDependencies` entry (not a `dependencies` entry).
- The `engines.node` literal-read test bullet (or the sibling SDK surface-inventory bullet that owns the `pi-engines-node` row) in `docs/plan_topics/h1-scaffold.md` describes an assertion that reads `@mariozechner/pi-coding-agent`'s `engines.node` field and compares it literally against the loom literal.
- That description names `require.resolve` (or an explicitly-named equivalent) as the resolution mechanism and contains no hard-coded `node_modules/...` path segment.
- The description specifies the comparison as string equality; no occurrence of `semver.subset`, `semver.satisfies`, or any range-comparison verb appears in the cross-package `engines.node` assertion's prose.
- The cross-package assertion's bullet names the `pi-engines-node` row of `SDK_SURFACE_INVENTORY` as the single source of truth it consumes.

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
**Shape:** single
**State:** reduced

## Problem

`docs/spec.md` Orientation > Prerequisites > Host runtime item 1 (the **Node version floor** bullet) currently asserts that the loom runtime's Node floor matches `@mariozechner/pi-coding-agent`'s `engines.node` floor as a bare prose equivalence, with no named audit mechanism. T03b adds a `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `docs/plan_topics/h1-scaffold.md`, and T03f extends the H1 SDK surface-inventory literal-read test to assert cross-package equality between the two floors; the spec sentence needs to name that test as the auditor rather than reading like a manual coincidence between two unrelated literals.

## Solution approach

In `docs/spec.md` Orientation > Prerequisites > Host runtime item 1 (the **Node version floor** bullet), rewrite the phrase "matching `@mariozechner/pi-coding-agent`'s `engines.node` floor" to "verified equal to `@mariozechner/pi-coding-agent`'s `engines.node` floor by the H1 SDK surface-inventory test." The rest of item 1 — the literal `>=20.6.0`, the SemVer-comparison parenthetical, the `details.kind = "node-floor"` discriminator forward-link, the `loom/load/host-incompatible` emission contract forward-link, and the bump-procedure forward-link — stands unchanged.

## Solution constraints

- Edit only `docs/spec.md` under this finding; do not modify `docs/plan_topics/h1-scaffold.md`, `docs/spec_topics/pi-integration-contract.md`, or any other spec or plan file.
- The replacement clause MUST name the audit mechanism as the **H1 SDK surface-inventory test** (the test bullet at `docs/plan_topics/h1-scaffold.md` SDK surface-inventory literal-read test); a different audit name would diverge from the test row T03b installs and the cross-package assertion T03f installs.
- The Pi package being compared MUST remain `@mariozechner/pi-coding-agent` and its field MUST remain `engines.node` — the rephrase changes only the verb relating the two floors, not either operand.
- The rest of item 1 (literal `>=20.6.0`, SemVer-comparison parenthetical, `details.kind = "node-floor"` discriminator forward-link, `loom/load/host-incompatible` emission forward-link, PIC Step 0 (a) forward-link, and the Pi version bump procedure forward-link) MUST NOT be edited under this finding.
- T03b is must-precede — this rephrase MUST NOT land before T03b lands, otherwise the named test has no `pi-engines-node` row to consume.
- The `pi-engines-node` `SDK_SURFACE_INVENTORY` row, the cross-package equality assertion, and the PIC bump-procedure step 3 narrative are owned by T03b, T03f, and T03d respectively and are out of scope here.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.
- [default] Limit the edit to the single phrase substitution; do not reflow the bullet, reorder the forward-links, or author new MUSTs in the surrounding orientation aggregator.

## Success criteria

- `docs/spec.md` Orientation > Prerequisites > Host runtime item 1 (the **Node version floor** bullet) contains the phrase "verified equal to `@mariozechner/pi-coding-agent`'s `engines.node` floor by the H1 SDK surface-inventory test".
- No occurrence of the phrase "matching `@mariozechner/pi-coding-agent`'s `engines.node` floor" remains in `docs/spec.md`.
- Item 1 of the Host runtime aggregator still carries the literal `>=20.6.0`, the SemVer-comparison parenthetical referencing `semver.satisfies`, the `details.kind = "node-floor"` discriminator forward-link to PIC Step 0 (a), the `loom/load/host-incompatible` emission forward-link, and the forward-link to the PIC Pi version bump procedure.
- The Host runtime aggregator still enumerates exactly three preconditions and items 2 (`AbortSignal` / `AbortController` shape) and 3 are unchanged by this finding.

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
**Shape:** single
**State:** reduced

## Problem

Step 3 ("Re-confirm the `engines.node` floor") of the `## Pi version bump procedure` (anchor `pi-version-bump-procedure`) in `docs/spec_topics/pi-integration-contract.md` currently instructs the contributor to manually compare `@mariozechner/pi-coding-agent`'s `engines.node` floor at the candidate version against the loom `package.json#engines.node` literal. Once T03b adds the `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `docs/plan_topics/h1-scaffold.md` and T03f extends the H1 manifest assertion to a cross-package equality check anchored on that row, the manual compare is obviated — the H1 test fails red automatically when the upstream floor moves, and the surviving manual-compare prescription contradicts the automatic detection on which side is authoritative.

## Solution approach

Rewrite step 3 of `## Pi version bump procedure` so the body reframes the step around the cross-package `engines.node` equality test (the H1 assertion T03f extends, sourced from the `pi-engines-node` `SDK_SURFACE_INVENTORY` row T03b adds) as the mechanical detector for upstream-floor movement, rather than a manual compare the contributor performs at bump time. Preserve the step's enumeration of co-edit sites that must move in the same commit when the test fails red — the loom `package.json#engines.node` literal, the [Step 0 (a)](#entry-capability-probe) comparator-and-floor reference, the [`spec.md` — Host runtime obligation 1](../spec.md#orientation) sentence, and the H1 assertion itself — so contributors retain the closure list the manual-compare narrative previously carried.

## Solution constraints

- Edit only step 3 of the `## Pi version bump procedure` section in `docs/spec_topics/pi-integration-contract.md` under this finding; do not modify other steps of the procedure, other sections of PIC, `docs/plan_topics/h1-scaffold.md`, `docs/spec.md`, or any other file.
- T03b (which adds the `pi-engines-node` `SDK_SURFACE_INVENTORY` row this step's narrative names) is must-precede; this rewrite MUST NOT land before T03b lands, otherwise the narrative references an inventory row that does not exist.
- T03f (which extends the H1 manifest assertion to the cross-package equality this step's narrative delegates to) is same-cluster; this rewrite MUST land in the same commit as T03f's test extension so the bump procedure and the test do not disagree on which side is authoritative for the upstream-floor floor.
- The rewritten step MUST continue to enumerate the co-edit closure set the previous prose carried — at minimum the loom `package.json#engines.node` literal, the [Step 0 (a)](#entry-capability-probe) comparator-and-floor reference, the [`spec.md` — Host runtime obligation 1](../spec.md#orientation) sentence, and the H1 assertion — as the sites that must move together when the test fails red.
- The rewritten step MUST NOT introduce a new step, a new sub-step, a new anchor, or a new spec rule ID; the `pi-version-bump-procedure` heading anchor and the integer step number `3` are preserved.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.
- [default] Limit the edit to step 3's body; do not reflow, restructure, or rewrite steps 1, 2, 4, or 5, and do not author new MUSTs beyond restating the same-commit co-edit obligation on the closure set.

## Success criteria

- Step 3 of `## Pi version bump procedure` in `docs/spec_topics/pi-integration-contract.md` no longer contains an instruction prescribing a manual compare of the upstream `engines.node` floor against the loom literal at bump time.
- Step 3 of that procedure references the cross-package `engines.node` equality assertion (anchored on the `pi-engines-node` `SDK_SURFACE_INVENTORY` row in `docs/plan_topics/h1-scaffold.md`) as the mechanical detector for upstream-floor movement.
- Step 3 still enumerates the co-edit closure set — the loom `package.json#engines.node` literal, [Step 0 (a)](#entry-capability-probe), [`spec.md` — Host runtime obligation 1](../spec.md#orientation), and the H1 assertion — as the sites that must move in the same commit when the test fails red.
- The `pi-version-bump-procedure` heading anchor, the integer step numbering of the procedure (steps 1, 2, 4, 5 retained alongside 3), and every other step's body are unchanged by this finding.

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
**Shape:** single
**State:** reduced

## Problem

The two `*Recommended recipe (non-normative).*` paragraphs under Step 0 of `docs/spec_topics/pi-integration-contract.md` (the Step 0 (a) Node-floor recipe and the Step 0 (d) peer-dep range recipe) carry a parenthetical pinning `semver` as a direct H1 production dependency of the loom package. Once T03a installs the dedicated `**Loom-package implementation dependencies (V1).**` sub-paragraph in `**Host prerequisites.**`, that dependency obligation has its own normative home and the parentheticals become redundant — and contradictory, because the same recipes simultaneously promise that "a future swap to a different SemVer implementation (or a hand-rolled comparator) is permitted". A non-normative recipe that pins a specific implementation as a direct H1 production dependency cannot coexist with a sibling sentence inviting a swap.

## Solution approach

Delete the dependency-pinning parenthetical "pinned by H1 as a direct production dependency of the loom package" wherever it appears in the two `*Recommended recipe (non-normative).*` paragraphs of `docs/spec_topics/pi-integration-contract.md` (Step 0 (a) and Step 0 (d)). Leave the comparator-contract framing, the worked `semver.satisfies` / `semver.valid` example, and the future-swap escape-hatch sentence intact in both paragraphs — those clauses remain load-bearing for the recipe's stated purpose now that T03a's sub-paragraph carries the V1 dependency choice.

## Solution constraints

- Edit only `docs/spec_topics/pi-integration-contract.md` under this finding; do not modify any other spec or plan file.
- The deletion is scoped to the dependency-pinning parenthetical; the comparator-contract framing, the worked `semver.satisfies` / `semver.valid` examples, and the "future swap to a different SemVer implementation (or a hand-rolled comparator) is permitted" escape-hatch sentence MUST remain in both paragraphs.
- T03a (which installs the `**Loom-package implementation dependencies (V1).**` sub-paragraph this finding's deletion delegates to) is must-precede; this trim MUST NOT land before T03a lands, otherwise the dependency obligation has no normative anchor in the corpus.
- Both paragraphs MUST remain marked `*Recommended recipe (non-normative).*` — this finding does not promote either paragraph to normative status.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.
- [default] Limit edits to the parenthetical deletion; do not reflow, restructure, or rewrite other clauses of either recipe paragraph, and do not author new MUSTs.

## Success criteria

- No occurrence of the phrase "pinned by H1 as a direct production dependency of the loom package" (or any equivalent dependency-pinning parenthetical) remains in `docs/spec_topics/pi-integration-contract.md`.
- Both `*Recommended recipe (non-normative).*` paragraphs (Step 0 (a) Node-floor and Step 0 (d) peer-dep range) remain present in `docs/spec_topics/pi-integration-contract.md` and still begin with the italic lead-in `*Recommended recipe (non-normative).*`.
- Each of those two paragraphs still contains a `semver.satisfies` / `semver.valid` worked example and the future-swap escape-hatch sentence permitting substitution of a different SemVer implementation (or a hand-rolled comparator).
- The four-item `**Host prerequisites.**` enumeration and the `**Loom-package implementation dependencies (V1).**` sub-paragraph (installed by T03a) are unchanged by this finding.

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
**Shape:** single
**State:** reduced

## Problem

The `SDK_SURFACE_INVENTORY` constant described in `docs/plan_topics/h1-scaffold.md` (under the SDK surface-inventory literal-read test bullet of the H1 leaf's test framework) enumerates the probe-relevant pinned surfaces (`node-floor`, `abortsignal-member`, `namespace-function`, `type-union-snapshot`, `load-time-resolution`, `strict-capability-probe`, `api-coverage`, `peer-dep-range`) but has no row representing Pi's `engines.node` floor as a cross-package surface. T03f extends the test infrastructure to assert cross-package equality between the loom package's `engines.node` literal and Pi's `engines.node` field, and T03d / T03e reference that assertion from the PIC bump procedure and the `spec.md` Host runtime item; without an inventory row holding Pi's floor as its own surface, that cross-package assertion has no shared source of truth with the rest of the inventory and degrades into a one-off test.

## Solution approach

Add one new row to the `SDK_SURFACE_INVENTORY` enumeration in `docs/plan_topics/h1-scaffold.md`, of the form `{ kind: "pi-engines-node", literal: ">=20.6.0" }`, alongside the existing `node-floor`, `abortsignal-member`, `namespace-function`, `type-union-snapshot`, `load-time-resolution`, `strict-capability-probe`, `api-coverage`, and `peer-dep-range` rows. The kind tag `pi-engines-node` is the surface name the cross-package equality assertion in T03f reads, and the literal records Pi's current `engines.node` floor so a future Pi bump that changes the floor lights up the assertion red. Frame the row as a sibling of the existing `node-floor` row (which holds the loom package's own floor) so the two together are the source of truth the cross-package equality test asserts on.

## Solution constraints

- Edit only `docs/plan_topics/h1-scaffold.md` under this finding; do not modify the test code, `package.json`, `docs/spec.md`, or any `docs/spec_topics/` file.
- The new row's `kind` discriminator MUST be the string `pi-engines-node` exactly — T03d, T03e, and T03f all name this surface and a different tag would silently break the must-precede chain.
- The row's `literal` MUST equal the loom package's `engines.node` floor verbatim at insertion time; a future floor change updates this row in the same commit so the T03f cross-package equality assertion stays meaningful.
- The row MUST be added to the existing `SDK_SURFACE_INVENTORY` enumeration in the SDK surface-inventory literal-read test bullet — do not introduce a new constant, a new test bullet, or a new H1 sub-leaf for it.
- The cross-package equality test itself, the PIC bump-procedure narrative, and the `spec.md` Host runtime sentence are owned by T03f, T03d, and T03e respectively and are out of scope here.
- T03d, T03e, and T03f are must-precede dependents — this row MUST land before any of them, since each names this row by its `kind` tag.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.
- [default] Add only the one row; do not restructure the enumeration, reorder existing rows, change other rows' literals, or author new MUSTs in the surrounding bullet prose.

## Success criteria

- The `SDK_SURFACE_INVENTORY` enumeration in `docs/plan_topics/h1-scaffold.md` contains a row whose `kind` field is the literal string `pi-engines-node`.
- That row carries a `literal` field whose value equals the loom package's `engines.node` floor literal as currently recorded by the existing `node-floor` row in the same enumeration.
- The enumeration retains all of its pre-existing rows (`node-floor`, `abortsignal-member`, `namespace-function`, `type-union-snapshot`, `load-time-resolution`, `strict-capability-probe`, `api-coverage`, `peer-dep-range`) — no row is removed, renamed, or reordered under this finding.
- No occurrence of `pi-engines-node` is introduced outside `docs/plan_topics/h1-scaffold.md` under this finding (T03d / T03e / T03f own those references).

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
**Shape:** single
**State:** reduced

## Problem

The `**Host prerequisites.**` paragraph in `docs/spec_topics/pi-integration-contract.md` enumerates four host-side prerequisites (Pi SDK pin, Binder model, Binder credentials, Pi-supplied `AbortSignal`) and does not name the loom package's own production dependencies needed to satisfy the Step 0 probe contracts. The runtime's `semver` dependency is mentioned only inside the parentheticals of the two `*Recommended recipe (non-normative).*` paragraphs immediately below the enumeration, both explicitly labelled non-normative. Consequently the H1 leaf's `dependencies["semver"]` manifest assertion (per `docs/plan_topics/h1-scaffold.md`) has no normative anchor in PIC to assert against.

## Solution approach

Add a new sub-paragraph whose lead bold token is `**Loom-package implementation dependencies (V1).**` immediately below the four-item enumeration in `**Host prerequisites.**` of `docs/spec_topics/pi-integration-contract.md`. The sub-paragraph names the V1 implementation choices the recipe contracts consume — for V1, `semver` declared in the loom package's `dependencies` block and `@types/semver` declared in `devDependencies` — frames the choices as implementation-side rather than normative contract so the comparator-swap escape hatch the recipe paragraphs already promise is preserved, and states the chosen version range as a literal value so downstream manifest tests have a single source of truth to anchor against.

## Solution constraints

- Edit only `docs/spec_topics/pi-integration-contract.md` under this finding; do not modify `docs/plan_topics/h1-scaffold.md` or any other plan / spec file.
- The sub-paragraph MUST place `@types/semver` under `devDependencies`, not `dependencies` — the type-only companion belongs in dev-deps and the H1 manifest assertion checks the correct block for each.
- The sub-paragraph MUST be framed as implementation-choice rather than normative contract, preserving the comparator-swap escape hatch already stated in the two `*Recommended recipe (non-normative).*` paragraphs.
- The chosen version range MUST appear as a single literal value in this sub-paragraph so the H1 literal-read manifest assertion has one source of truth to anchor against.
- T03c (trim dependency-pinning parentheticals from the two `*Recommended recipe (non-normative).*` paragraphs) and T03f (`h1-scaffold.md` manifest assertion targeting this sub-paragraph) are must-precede dependents — this sub-paragraph MUST land before either of them.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.
- [default] Add only the sub-paragraph; do not author new MUSTs beyond what the recipe contracts already imply, and do not restructure the surrounding `**Host prerequisites.**` enumeration or its sibling `**Host prerequisites for the degraded-state branch.**` paragraph.

## Success criteria

- A sub-paragraph whose lead bold token is `**Loom-package implementation dependencies (V1).**` exists in `docs/spec_topics/pi-integration-contract.md`, positioned immediately after the four-item `**Host prerequisites.**` enumeration and before the `**Host prerequisites for the degraded-state branch.**` paragraph.
- That sub-paragraph names `semver` as a `dependencies` entry and `@types/semver` as a `devDependencies` entry.
- The sub-paragraph contains language framing the dependency choice as a V1 implementation choice with a future-substitution escape hatch (matching the framing already present in the two `*Recommended recipe (non-normative).*` paragraphs).
- The version range stated for `semver` in this sub-paragraph appears as a single literal that the H1 manifest assertion (per `docs/plan_topics/h1-scaffold.md`) can read as its single source of truth.

## Relationships

- T03c "Trim dependency-pinning parentheticals from PIC's two `*Recommended recipe (non-normative).*` paragraphs" — must-precede (this finding installs the anchor that obviates the parentheticals T03c removes).
- T03f "`h1-scaffold.md` manifest assertion: anchor at the new PIC sub-paragraph ..." — must-precede (T03f's manifest assertion anchors at the sub-paragraph this finding installs).

---

# T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept

**Original heading:** `looms.binderModel` (settings key) vs `bind_model` (frontmatter field) — same concept, different root names
**Original section:** docs/spec_topics/binder.md
**Kind:** naming
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The concept "the LLM the slash-command argument binder calls" appears across three surface conventions with two different root words: frontmatter uses `bind_` (`bind_model`, `bind_context`, `bind_echo`), while settings keys, diagnostic codes, anchors, and running prose use the longer root `binder` (`looms.binderModel`, `loom/load/binder-model-unresolved`, `## Binder model` in `docs/spec_topics/binder.md`, glossary entry `**binder**`). The per-surface case style (snake / camel / kebab) is already governed by documented conventions; the `binder` → `bind_` shortening inside the frontmatter family is not — the *Naming convention* paragraph in `docs/spec_topics/frontmatter.md` documents the snake-case rule but is silent on this root-word delta, and the glossary has an entry for `**binder**` (the mechanism) but no entry for the binder-model concept, so the cross-surface mapping has no canonical anchor. Author-facing remediation hints that name both surfaces in one sentence (e.g. the `loom/load/binder-model-unresolved` row in `docs/spec_topics/diagnostics.md`: ``set 'bind_model:' in frontmatter or 'looms.binderModel' in settings``) read as a typo until the convention is internalised.

## Solution approach

Per the Option A decision (2026-05-08), document the per-surface mapping rather than rename the frontmatter family. Add a new `**binder model**` glossary entry to `docs/spec_topics/glossary.md`, alphabetised between the existing `**binder**` and `**callable set**` entries; the entry must pin the concept, enumerate the per-surface spellings (frontmatter `bind_model:`, settings `looms.binderModel`, diagnostic / prose `binder-model` / "binder model"), note that the `bind_` prefix is shared by sibling fields `bind_context` and `bind_echo` and is not a separate concept, and forward-link to `./binder.md` and `./discovery.md#settings-file-reads`. Then extend the *Naming convention* paragraph in `docs/spec_topics/frontmatter.md` with one sentence stating that within the binder-related family the frontmatter prefix is `bind_` while the corresponding settings key, diagnostic, and prose forms use the longer root `binder`.

## Solution constraints

- Edit only `docs/spec_topics/glossary.md` and `docs/spec_topics/frontmatter.md` under this finding; do not modify wire formats, settings keys, frontmatter field names, diagnostic codes, or prose elsewhere in the corpus.
- Do not rename `bind_model`, `bind_context`, or `bind_echo` to `binder_model` / `binder_context` / `binder_echo` (Option B was rejected); the resolution is documentary, not a rename.
- The new `**binder model**` glossary entry MUST be a sibling of, not a replacement for, the existing `**binder**` entry, which refers to the mechanism rather than the model.
- The `loom/load/binder-model-unresolved` remediation-hint string in `docs/spec_topics/diagnostics.md` is verbatim author-facing and must not be reflowed under this finding; if a `See:` reference is added it must be appended after the hint, not spliced inside.
- Coordinate root-word references with the sibling rename finding for "Binder LLM model" / "binder model" so the prose-side rename in `docs/spec.md` capability bullet 7 / anchor `sdk-cap-binder-llm-model` in `docs/spec_topics/pi-integration-contract.md` is not duplicated here.
- Edit budget: roughly one new glossary entry (a few sentences) plus one sentence appended to the *Naming convention* paragraph; do not author new MUSTs.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.

## Success criteria

- A glossary entry whose lead bold token is `**binder model**` exists in `docs/spec_topics/glossary.md`, positioned between the existing `**binder**` and `**callable set**` entries.
- That entry names all three surface spellings (`bind_model:`, `looms.binderModel`, and the kebab/space form `binder-model` / "binder model") and contains forward-links to `./binder.md` and to `./discovery.md#settings-file-reads`.
- The *Naming convention* paragraph in `docs/spec_topics/frontmatter.md` contains a sentence noting the `bind_` (frontmatter) vs `binder` (settings / diagnostic / prose) root-word split for the binder-related family.
- The strings `bind_model`, `bind_context`, and `bind_echo` are not renamed to `binder_model` / `binder_context` / `binder_echo` anywhere in `docs/spec.md` or `docs/spec_topics/`; the existing field names remain unchanged.

## Relationships

None

---

# T06 — Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers

**Original heading:** Operator role undefined; non-interactive delivery path unstated
**Original section:** docs/spec.md — Orientation (misc / cross-cutting)
**Kind:** assumptions
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The `operator` entry in `docs/spec_topics/glossary.md` binds *operator-facing* tightly to the active Pi TUI session via the `loom-system-note` channel, but the rest of the corpus admits non-TUI invocation paths — `invoke` from another loom, "programmatic consumers", a future loom harness, and the deferred `loom test` and non-loom programmatic harness items in `docs/spec_topics/future-considerations.md` — without reconciling them with that binding. The first use of *operator* in `docs/spec.md` (the terminal-outcomes aggregator paragraph at `<a id="terminal-outcomes-aggregator">`, "what the operator observes per channel") does not forward-link to the glossary, and the glossary `operator` entry has no anchor to link to. A reader auditing whether non-interactive callers see an operator-facing surface has no anchored answer, and a future contributor adding a non-slash entry point has no V1 binding to extend.

## Solution approach

Add an HTML anchor to the `operator` entry in `docs/spec_topics/glossary.md` matching the convention sibling glossary entries already use, and append one sentence to that entry pinning the V1 invariant: every loom invocation runs inside an active Pi TUI session (so an operator is always present) and non-interactive invocation paths — including the deferred `loom test` command and the deferred non-loom programmatic harness named in `docs/spec_topics/future-considerations.md` — are out of V1 scope, with the operator-facing channel's behaviour outside a TUI session undefined. Then add an inline forward-link of the form `the operator (per [Glossary](./spec_topics/glossary.md#operator))` on the first use of *operator* in the terminal-outcomes aggregator paragraph (`<a id="terminal-outcomes-aggregator">`) of `docs/spec.md`. The existing generic forward-link to the glossary in the Runtime observability bullet under `Scope` does not need a per-term anchor.

## Solution constraints

- Edit only `docs/spec.md` and `docs/spec_topics/glossary.md` under this finding; treat `docs/spec_topics/overview.md`, `docs/spec_topics/slash-invocation.md`, `docs/spec_topics/future-considerations.md`, and `docs/spec_topics/pi-integration-contract.md` as read-only.
- The V1 carve-out belongs in the glossary `operator` entry; the consolidated V1 non-goals list at `docs/spec_topics/future-considerations.md#v1-non-goals` MAY cite the entry but is owned elsewhere and is out of scope under this finding.
- The new glossary anchor MUST match the HTML-anchor convention sibling entries already use (e.g. `<a id="in-loop"></a>`, `<a id="query-terminating"></a>`); do not invent a new anchor convention.
- Do not extend the V1 disclaimer to cover Pi's `convertToLlm` LLM-context entry; that surface is owned by the Pi Integration Contract's System notes section and is a property of the channel, not of the operator role.
- Use the deferred-feature names already in `docs/spec_topics/future-considerations.md` verbatim (`loom test`; non-loom programmatic harness) rather than coining new names.
- Edit budget: roughly one sentence added to the glossary `operator` entry plus the anchor on that entry; one inline forward-link added on the first `operator` use in `spec.md`. Do not author new MUSTs and do not restructure the glossary or the spec.md Overview.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.

## Success criteria

- The `operator` entry in `docs/spec_topics/glossary.md` carries an HTML anchor with `id="operator"` matching the convention used by sibling entries.
- The same entry contains a sentence pinning the V1 invariant (every loom invocation runs inside an active Pi TUI session, so an operator is always present) and naming non-interactive paths (`loom test`; non-loom programmatic harness) as out of V1 scope with the operator-facing channel's behaviour outside a TUI session undefined.
- The first use of *operator* in the terminal-outcomes aggregator paragraph (`<a id="terminal-outcomes-aggregator">`) of `docs/spec.md` carries an inline forward-link to `./spec_topics/glossary.md#operator`.
- Every link to `./spec_topics/glossary.md#operator` from `docs/spec.md` resolves (the anchor exists in the target file).

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — same-cluster (overlapping scope: what the operator sees on success vs across non-interactive paths).
- T38 "Non-goals are not consolidated into a single section" — same-cluster (the V1 "no non-interactive delivery path" disclaimer is one of the items the consolidated Non-goals section would cite back to the glossary entry).

---

# T07 — `QueryError.message` content has no normativity rule

**Original heading:** `CancelledError.message` has no normative content
**Original section:** docs/spec_topics/errors-and-results.md
**Kind:** testability
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

In `docs/spec_topics/errors-and-results.md`, every `QueryError` variant declared under `## QueryError variants` (`CancelledError`, `SchemaValidationError`, `TransportError`, `ModelToolError`, `ContextOverflowError`, `ToolLoopExhaustedError`, `CodeToolError`, `InvokeInfraError`, `InvokeCalleeError`) carries an unannotated `message: string` field with no rule stating whether the content is implementation-defined or follows a fixed template. The single exception is the **Panic message string (normative)** rule, which pins `InvokeInfraError.message` to a registered `loom/runtime/*` template when `cause === "panic"`. With no comparable rule for the non-panic cases, two conformant runtimes can emit arbitrarily divergent `message` strings for the same failure, and conformance tests have no contract to assert against beyond `kind` and the variant's structured fields.

## Solution approach

Add a normative rule under the `### Notes` subsection of `## QueryError variants` in `docs/spec_topics/errors-and-results.md` declaring that `message` content on every `QueryError` variant is implementation-defined and non-normative, with an explicit carve-out preserving the existing **Panic message string (normative)** rule for `InvokeInfraError` when `cause === "panic"`. State that conformance tests MUST assert only on `kind`, on the variant's structured fields, and (for the panic carve-out) on the registered `loom/runtime/*` template. Do not author per-variant message templates or extend the diagnostics code registry.

## Solution constraints

- Edit only `docs/spec_topics/errors-and-results.md` under `## QueryError variants` (the `### Notes` subsection is the natural home); do not edit `docs/spec_topics/cancellation.md` or `docs/spec_topics/diagnostics.md` under this finding.
- The new rule MUST explicitly preserve the **Panic message string (normative)** rule for `InvokeInfraError.message` when `cause === "panic"`, and MUST NOT weaken or restate the existing panic-template wording.
- Do not introduce per-variant `message` templates in any form (e.g. a `loom/error/*` code-registry section); this finding's resolution is the blanket non-normativity rule, not Option B.
- Do not rename, retype, or otherwise modify the `message: string` field declarations on any `QueryError` variant or on `ValidationIssue`.
- Edit budget: roughly one paragraph of prose; do not author additional MUSTs beyond the single non-normativity rule and its panic carve-out.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.

## Success criteria

- The `### Notes` subsection of `## QueryError variants` in `docs/spec_topics/errors-and-results.md` contains a normative statement that `message` content on `QueryError` variants is implementation-defined / non-normative.
- That same statement names the panic carve-out, referencing the **Panic message string (normative)** rule (or the `loom/runtime/*` registered template) as the case where `message` content is fixed.
- The existing **Panic message string (normative)** rule and its reference to the `loom/runtime/*` *Message template* in the [Diagnostics code registry](./diagnostics.md) appear unchanged byte-for-byte.
- A reader scanning `## QueryError variants` and its `### Notes` can determine, without consulting the original spec-review finding, whether a conformance test may assert on the literal contents of `message` for any given variant.

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
**Shape:** single
**State:** reduced

## Problem

The `context_overflow` row of the per-`kind` system-note table in `docs/spec_topics/slash-invocation.md` currently renders the user-facing template as `"loom /<name> returned Err: context window exceeded"`, which uses a different root word from the rest of the corpus. The schema name `ContextOverflowError`, the wire `kind` literal `"context_overflow"`, and the surrounding prose in `binder.md`, `pi-integration-contract.md`, `hard-ceilings.md`, and `glossary.md` all use the bare root word "context overflow". Because that table is normative and byte-pinned ("Renderers MUST emit the surrounding template text verbatim"; "Wording changes are spec-versioned breaking changes"), once leaf V18i pins the literal text in tests, harmonising the row later becomes a breaking spec-version bump.

## Solution approach

Rewrite the user-facing template in the `context_overflow` row of the per-`kind` system-note table in `docs/spec_topics/slash-invocation.md` so it ends with the bare root word `context overflow` in place of `context window exceeded`. Edit only the table cell's prose — the schema name, the wire `kind` literal `"context_overflow"` (the row's first column), and any field names are unchanged. Coordinate landing with siblings T08b and T08c so the corpus root word is harmonised in one commit.

## Solution constraints

- Edit only the `context_overflow` row of the per-`kind` system-note table in `docs/spec_topics/slash-invocation.md`; do not modify any other row, the surrounding normativity paragraphs ("Renderers MUST emit the surrounding template text verbatim" / "Wording changes are spec-versioned breaking changes"), or the chain-attribution machinery.
- Do not rename the schema name `ContextOverflowError` or the wire `kind` literal `"context_overflow"` anywhere they appear.
- The `errors-and-results.md` prose sweep is owned by T08b and the `query.md` sweep is owned by T08c; do not touch `docs/spec_topics/errors-and-results.md` or `docs/spec_topics/query.md` under this finding.
- Treat `docs/spec_topics/binder.md`, `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/hard-ceilings.md`, and `docs/spec_topics/glossary.md` as read-only — they already use the corpus root word.
- Edit budget: a single table cell of prose; do not author new MUSTs and do not restructure the per-`kind` table.
- The edit must land before leaf V18i pins the literal in conformance tests; once V18i has shipped, the change becomes a spec-versioned breaking bump under the table's "Wording changes are spec-versioned breaking changes" clause.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.

## Success criteria

- The `context_overflow` row of the per-`kind` system-note table in `docs/spec_topics/slash-invocation.md` contains no occurrence of the substring `context window exceeded`.
- The same row's user-facing template ends with the bare root word `context overflow`.
- The wire `kind` literal `"context_overflow"` (the row's first column) and the schema name `ContextOverflowError` appear unchanged byte-for-byte everywhere they occur in `docs/spec_topics/slash-invocation.md`.
- All other rows of the per-`kind` system-note table (`model_tool`, `cancelled`, the catch-all, and every other listed `kind`) and the surrounding normativity paragraphs are unchanged byte-for-byte by this finding.

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
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `ContextOverflowError` variant intro paragraph in the *Query-time variants* section of `docs/spec_topics/errors-and-results.md` — the prose sentence immediately preceding the ```` ```loom schema ContextOverflowError { ... } ```` block — describes the trigger as a "context-window overflow". The rest of the corpus (schema name `ContextOverflowError`, wire `kind` literal `"context_overflow"`, and the sibling sweeps in `slash-invocation.md` (T08a) and `query.md` (T08c)) uses the bare root word "context overflow". The hyphenated variant in this one prose site is observable at every cross-page navigation as a phrasing inconsistency.

## Solution approach

Rewrite the `ContextOverflowError` variant intro paragraph in the *Query-time variants* section of `docs/spec_topics/errors-and-results.md` to use the bare root word "context overflow" in place of "context-window overflow". Coordinate landing with siblings T08a and T08c so the corpus root word is harmonised in one commit.

## Solution constraints

- Edit only the prose intro paragraph for the `ContextOverflowError` variant in the *Query-time variants* section of `docs/spec_topics/errors-and-results.md`; do not rename the schema name `ContextOverflowError` or the wire `kind` literal `"context_overflow"` anywhere they appear.
- The slash-invocation system-note row literal is owned by T08a and the `query.md` sweep is owned by T08c; do not touch `docs/spec_topics/slash-invocation.md` or `docs/spec_topics/query.md` under this finding.
- Treat `docs/spec_topics/binder.md`, `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/hard-ceilings.md`, and `docs/spec_topics/glossary.md` as read-only — they already use the corpus root word.
- The cross-reference link from this paragraph to *Query — Detection of `ContextOverflowError`* in `docs/spec_topics/query.md` MUST continue to resolve.
- Edit budget: roughly one sentence of prose; do not author new MUSTs and do not restructure the *Query-time variants* section.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.

## Success criteria

- The *Query-time variants* section of `docs/spec_topics/errors-and-results.md` contains no occurrence of the substring `context-window overflow` (or `context-window` more generally) in prose.
- The `ContextOverflowError` variant intro paragraph in that section uses the bare root word `context overflow` when naming the trigger.
- The cross-reference link from that paragraph to *Detection of `ContextOverflowError`* in `docs/spec_topics/query.md` still resolves.
- The identifiers `ContextOverflowError` and the literal `"context_overflow"` (the wire `kind` value) appear unchanged byte-for-byte in `docs/spec_topics/errors-and-results.md` everywhere they occur outside the rewritten paragraph.

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
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Detection of `ContextOverflowError`* section in `docs/spec_topics/query.md` describes the runtime as mapping recognised provider `"context window exceeded"` error responses to this variant — quoting an exact provider error string. The quoted phrase both diverges from the corpus root word "context overflow" used by the schema name `ContextOverflowError`, the wire `kind` literal `"context_overflow"`, and the sibling sweeps in `slash-invocation.md` (T08a) and `errors-and-results.md` (T08b), and over-commits the spec to a literal provider string when the per-provider signatures actually live in *Pi Integration Contract — Provider error mapping*. A reader can't tell whether "context window exceeded" is a normative substring providers must emit or just one historical example.

## Solution approach

Rewrite the affected sentence in the *Detection of `ContextOverflowError`* section of `docs/spec_topics/query.md` to use the bare "context-overflow" phrasing — name the provider behaviour without quoting any specific provider error string. Keep the existing cross-reference to *Pi Integration Contract — Provider error mapping*, which retains ownership of the per-provider signatures. Coordinate landing with siblings T08a and T08b so the corpus root word is harmonised in one commit.

## Solution constraints

- Edit only the prose of the *Detection of `ContextOverflowError`* section in `docs/spec_topics/query.md`; do not rename the schema name `ContextOverflowError` or the wire `kind` literal `"context_overflow"` anywhere they appear.
- The slash-invocation system-note row literal is owned by T08a and the `errors-and-results.md` sweep is owned by T08b; do not touch `docs/spec_topics/slash-invocation.md` or `docs/spec_topics/errors-and-results.md` under this finding.
- Treat `docs/spec_topics/binder.md`, `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/hard-ceilings.md`, and `docs/spec_topics/glossary.md` as read-only — they already use the corpus root word.
- The cross-reference link from this section to *Pi Integration Contract — Provider error mapping* in `docs/spec_topics/pi-integration-contract.md` MUST continue to resolve.
- Edit budget: roughly one sentence of prose; do not author new MUSTs, do not restructure the *Detection of `ContextOverflowError`* section, and do not introduce a new normative rule about what providers may or must emit.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.

## Success criteria

- The *Detection of `ContextOverflowError`* section in `docs/spec_topics/query.md` contains no occurrence of the substring `context window exceeded` (with or without surrounding quotes) and no occurrence of `context-window`.
- The same section uses the unquoted root word `context-overflow` (or equivalent unquoted phrasing) when naming the recognised provider error responses.
- The cross-reference from the *Detection of `ContextOverflowError`* section to *Provider error mapping* in `docs/spec_topics/pi-integration-contract.md` still resolves.
- The identifiers `ContextOverflowError` and the literal `"context_overflow"` (the wire `kind` value) appear unchanged byte-for-byte in `docs/spec_topics/query.md` everywhere they occur outside the rewritten sentence.

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
**Shape:** single
**State:** reduced

## Problem

The `bind_context: session` bullet in the *bind_context* value list of `docs/spec_topics/binder.md` (the bullet immediately under "Configured via `bind_context:` …") describes the session-context cap as "the last ~20 turns or ~8000 tokens (whichever is smaller)". The tildes read as approximation and "whichever is smaller" reads as a min-of-two cap, while the *Session-context truncation (`bind_context: session`)* subsection later in the same file pins exact, jointly-applied, boundary-inclusive bounds (a turn is included iff running token total ≤ 8000 *and* running turn count ≤ 20). A reader who consumes only the bullet cannot tell that the limits are exact, joint, or boundary-inclusive, so an implementer or test author working from the bullet alone may round counts, undercount tokens, or apply min-of-two and still believe themselves conformant.

## Solution approach

Rewrite the `bind_context: session` bullet so it stops asserting approximate, min-of-two caps. Either restate the caps verbatim as the exact joint inclusive bounds owned by the algorithm subsection, or — preferably — defer entirely with a forward-link to the *Session-context truncation (`bind_context: session`)* subsection (anchor `#session-context-truncation-bind_context-session`) and let that subsection own the literals. Drop the tildes and the "whichever is smaller" framing.

## Solution constraints

- Edit only the `bind_context: session` bullet in the *bind_context* value list of `docs/spec_topics/binder.md`; treat the *Session-context truncation (`bind_context: session`)* subsection and the rendered binder system-prompt example line (`Recent session context (most recent 20 turns / 8000 tokens):`) as read-only.
- The numeric literals `20` and `8000` and the joint / boundary-inclusive rule are owned by the *Session-context truncation* subsection; the bullet either restates them verbatim from that subsection or defers via forward-link, and never paraphrases or re-derives them.
- Do not introduce a third independent statement of the caps; the only acceptable copies in `binder.md` remain (a) the *Session-context truncation* subsection and (b) the rendered system-prompt example line, both already present.
- The heading "Session-context truncation (`bind_context: session`)" in `docs/spec_topics/binder.md` MUST remain present and its auto-generated anchor `#session-context-truncation-bind_context-session` MUST continue to resolve, so leaf V16g's *Spec.* cross-reference and the in-file forward-link from this bullet remain live.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.

## Success criteria

- The `bind_context: session` bullet in the *bind_context* value list of `docs/spec_topics/binder.md` contains no occurrence of `~20`, `~8000`, or the phrase `whichever is smaller`.
- The same bullet either (a) contains a forward-link that resolves to anchor `#session-context-truncation-bind_context-session` in `docs/spec_topics/binder.md`, or (b) restates the caps as exact joint inclusive bounds using the literal numerals `20` and `8000`.
- The heading "Session-context truncation (`bind_context: session`)" still exists in `docs/spec_topics/binder.md` and its auto-generated anchor `#session-context-truncation-bind_context-session` still resolves.
- The numeric content of the *Session-context truncation* subsection and of the rendered binder system-prompt example line `Recent session context (most recent 20 turns / 8000 tokens):` is unchanged byte-for-byte by this finding.

## Relationships

None

---

# T10 — Single-string bypass: behaviour on whitespace-only / absent slash argument is unspecified

**Original heading:** Single-string bypass: empty-string argument behavior unspecified
**Original section:** docs/spec_topics/binder.md
**Kind:** testability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The *Single-string bypass* clause (item 2 of *Binder bypass*, anchor `bypass-cases`) in `docs/spec_topics/binder.md` is silent on the case where the user supplies no slash argument or supplies only whitespace. After the documented leading/trailing-whitespace trim, the bound value is `""`, and AJV with the default `string` schema accepts it, but the bypass path has no binder fallback, no `needs_info` channel, and no reserved diagnostic for this case — so two reasonable implementers diverge on whether the loom starts with `""` bound or whether the runtime emits a system note and suppresses the loom. The choice is load-bearing for the user-visible surface and for V3c's test matrix in `docs/plan_topics/v3-frontmatter.md`, which currently has no row pinning the empty-trim outcome.

## Solution approach

Clarify item 2 of *Binder bypass* in `docs/spec_topics/binder.md` to pin the chosen behaviour: when the slash argument is absent or trims to the empty string, the param is bound to `""` and the loom starts; AJV validates `""` against the `string` schema (it passes by definition). No new diagnostic code, no new system-note template, no echo-policy change. Add a paired test row to V3c's *Tests* line in `docs/plan_topics/v3-frontmatter.md` asserting that the no-argument and whitespace-only-argument cases both bind the param to `""` and start the loom.

## Solution constraints

- Edit only item 2 of the *Binder bypass* section (anchor `bypass-cases`) in `docs/spec_topics/binder.md` and the *Adds* / *Tests* lines of leaf V3c ("V3c — Bypass binder (no-params and single-string forms)") in `docs/plan_topics/v3-frontmatter.md`; treat `docs/spec_topics/slash-invocation.md` § *No-params overflow* as read-only.
- Do not introduce a new diagnostic code, a new failure-mode-template row, or a new system-note template; pi-loom uses no stable spec rule IDs and none may be invented here.
- Do not change the existing trim semantics: leading and trailing whitespace are stripped, internal whitespace is preserved (e.g. `/foo  hello  ` still binds `"hello"`).
- Do not change echo policy on the bypass path (echo is auto-suppressed on bypass per V16k and that property MUST continue to hold for the absent / whitespace-only cases).
- The *No-params overflow* note in `docs/spec_topics/slash-invocation.md` MUST remain gated on `params: {}` / absent; do not extend it to fire on the single-string bypass path.
- Edits to item 2 of *Binder bypass* should remain within roughly one additional sentence of normative prose; do not author new MUSTs or restructure the *Binder bypass* section beyond the clarification.

## Success criteria

- Item 2 of the *Binder bypass* section in `docs/spec_topics/binder.md` (anchor `bypass-cases`) explicitly states that when the slash argument is absent or trims to the empty string, the param is bound to `""` and the loom starts.
- The same item states (or unambiguously implies via the existing AJV-safety-net wording) that AJV accepts `""` against the default `string` schema on this path.
- V3c's *Tests* line in `docs/plan_topics/v3-frontmatter.md` contains an assertion that a single-string bypass loom invoked with no slash argument binds the param to `""` and starts the loom, paired with an assertion that the same loom invoked with a whitespace-only slash argument behaves identically.
- No new diagnostic code matching `loom/...single-string-bypass...` (or any equivalent for the bypass-empty case) is introduced in `docs/spec_topics/diagnostics.md`, and no new row is added to the binder failure-mode templates table in `docs/spec_topics/binder.md` for this case.
- The *No-params overflow* paragraph in `docs/spec_topics/slash-invocation.md` is unchanged byte-for-byte by this finding.

## Relationships

None

---

# T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule

**Original heading:** CIO-4 vacuous-after-forced-respond behavior implicit, not stated
**Original section:** docs/spec_topics/query.md and docs/spec_topics/hard-ceilings.md
**Split from:** "`tool_loop` slot accounting on the forced respond turn is internally inconsistent" (entry 1 of 3)
**Kind:** testability
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Tool-call loop bound* section in `docs/spec_topics/query.md` (anchor `tool-call-loop-bound`) and the `tool_loop` field paragraph in `docs/spec_topics/frontmatter.md` each assert that the forced respond turn for a typed query consumes one `tool_loop` slot. That framing contradicts CIO-4 in `docs/spec_topics/hard-ceilings.md` and its *Depth-6 forced respond at `max_rounds`* worked consequence, which together treat the forced respond turn as the unconditional terminating mechanism CIO-4's `max_rounds`-final branch routes to (slot-accounting is evaluated only against free-phase rounds). At `max_rounds: 0` the contradiction is directly observable: under the "consumes one slot" reading the only available turn is already over budget; under CIO-4 it MUST still be dispatched. The sibling findings T11b and T11c cannot land their V6k changes against the spec until this prose is reconciled.

## Solution approach

Rewrite the relevant sentences in the *Tool-call loop bound* section of `docs/spec_topics/query.md` and in the `tool_loop` field paragraph of `docs/spec_topics/frontmatter.md` to replace the "consumes one slot" framing with an explicit forced-respond-exemption rule: the forced respond turn is the typed-query terminating mechanism CIO-4's `max_rounds`-final branch routes to; the runtime MUST dispatch it on every typed query that reaches that branch (including the `max_rounds: 0` boundary case, where it is the only turn issued); and CIO-4's slot-accounting check is not evaluated against the forced respond turn itself. Confirm `docs/spec_topics/hard-ceilings.md` CIO-4 and the *Depth-6 forced respond at `max_rounds`* worked consequence remain aligned with the new rule and leave them unedited if they do.

## Solution constraints

- Edit only the *Tool-call loop bound* section (anchor `tool-call-loop-bound`) in `docs/spec_topics/query.md` and the `tool_loop` field paragraph in `docs/spec_topics/frontmatter.md`; treat `docs/spec_topics/hard-ceilings.md` (CIO-4 and the *Depth-6 forced respond at `max_rounds`* worked consequence) and `docs/spec_topics/pi-integration-contract.md` (PIC-1 (d) V1 reachable predicate, already worded against the free-phase slot count) as read-only for this finding.
- The rewritten rule MUST state that the runtime MUST dispatch the forced respond turn on every typed query that reaches CIO-4's terminating branch, explicitly including the `max_rounds: 0` boundary case in which the forced respond turn is the only turn issued.
- The rewritten rule MUST state that CIO-4's slot-accounting check is not evaluated against the forced respond turn itself (the forced respond turn sits outside the `tool_loop` slot count).
- The respond-repair follow-up clause already present in both edited paragraphs (each follow-up gets a fresh `tool_loop` budget) MUST remain present, and the exemption MUST be expressed so it re-applies to each follow-up's forced respond turn against that follow-up's fresh budget.
- Plan-side leaves V6k and V6l in `docs/plan_topics/v6-typed-queries.md` are owned by siblings T11b and T11c and are out of scope for this finding.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.

## Success criteria

- The *Tool-call loop bound* section in `docs/spec_topics/query.md` (anchor `tool-call-loop-bound`) no longer contains the literal sentence "The forced respond turn for typed queries also consumes one slot." or any equivalent assertion that the forced respond turn occupies a `tool_loop` slot.
- The `tool_loop` field paragraph in `docs/spec_topics/frontmatter.md` no longer contains the literal sentence "The forced respond turn that terminates a typed query also consumes one slot." or any equivalent assertion that the forced respond turn occupies a `tool_loop` slot.
- Both edited paragraphs state that the runtime MUST dispatch the forced respond turn on every typed query that reaches CIO-4's terminating branch, including the `max_rounds: 0` boundary case.
- Both edited paragraphs state that CIO-4's slot-accounting check is not evaluated against the forced respond turn itself.
- The respond-repair follow-up clause stating that each follow-up receives a fresh `tool_loop` budget remains present in both edited paragraphs.
- The CIO-4 paragraph and the *Depth-6 forced respond at `max_rounds`* worked consequence in `docs/spec_topics/hard-ceilings.md`, and the PIC-1 (d) V1 reachable predicate in `docs/spec_topics/pi-integration-contract.md`, are unchanged byte-for-byte by this finding.

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
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Adds* paragraph of leaf "V6k — `tool_loop` cap enforcement and `ToolLoopExhaustedError`" in `docs/plan_topics/v6-typed-queries.md` defines the per-query slot count as *(free-phase rounds) + (1 if a forced respond turn is issued, else 0)* and pins exhaustion at *total slots would exceed `max_rounds`*. That formula counts the forced respond turn against the budget, which contradicts the *Tool-call loop bound* rule that T11a establishes in `docs/spec_topics/query.md` (the forced respond turn is exempt from CIO-4 slot-accounting). With T11a landed, V6k's *Adds* prose is internally inconsistent with the spec it implements, and the boundary outcome of a `max_rounds: 0` typed query is undefined from the leaf's perspective.

## Solution approach

Rewrite the counting-formula and exhaustion sentences in V6k's *Adds* paragraph in `docs/plan_topics/v6-typed-queries.md` so the slot count equals the free-phase round count (the forced respond turn sits outside the budget) and exhaustion fires under either of two disjoint conditions: (a) the slot count would exceed `max_rounds` and the next required turn is a free-phase turn, or (b) the forced respond turn was dispatched and the model failed to invoke the respond tool. Preserve the existing statements that the counter starts at 0, that respond-repair follow-ups (V13g) reset the counter, and that `max_rounds: 0` disables model-driven tool calls. Land after T11a and before T11c per Relationships.

## Solution constraints

- Edit only the counting-formula and exhaustion sentences inside V6k's *Adds* paragraph in `docs/plan_topics/v6-typed-queries.md`; do not edit V6k's *Spec*, *Tests*, *Deps*, or *Ships when* lines, do not edit any other plan leaf (in particular leaf V6l's *Adds* / *Tests* lines describing the two-phase driver are read-only for this finding), and do not edit any spec topic file (the *Tool-call loop bound* section in `docs/spec_topics/query.md` is owned by T11a and is read-only here).
- The rewritten exhaustion clause MUST express the two firing conditions as a disjunction over (free-phase budget exceeded with a free-phase turn next) and (forced respond dispatched but the model did not invoke the respond tool); do not collapse them into a single arithmetic predicate that re-counts the forced respond turn against `max_rounds`.
- The respond-repair follow-up clause already in the *Adds* paragraph (each follow-up gets a fresh `tool_loop` budget) MUST remain present, and the new exhaustion clause MUST be expressed so it re-applies independently against each follow-up's fresh budget.
- The `max_rounds: 0` clause already in the *Adds* paragraph (disables model-driven tool calls entirely) MUST remain present; the test-vector that pins the `max_rounds: 0` boundary outcome is owned by T11c and is out of scope for this finding.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.

## Success criteria

- V6k's *Adds* paragraph in `docs/plan_topics/v6-typed-queries.md` defines the per-query slot count as the free-phase round count alone, with no remaining `+ 1` (or equivalent) term that adds the forced respond turn into the budget.
- V6k's *Adds* paragraph states an exhaustion rule with two disjoint firing conditions: one keyed on the free-phase budget being exceeded with a free-phase turn next required, and one keyed on the forced respond turn being dispatched without the model invoking the respond tool.
- No occurrence of the literal phrase ``(free-phase rounds) + (1 if a forced respond turn is issued, else 0)`` remains in `docs/plan_topics/v6-typed-queries.md`.
- The respond-repair follow-up clause and the `max_rounds: 0` clause already present in V6k's *Adds* paragraph are still present after the edit.
- V6k's *Spec*, *Tests*, *Deps*, and *Ships when* lines and the entirety of leaf V6l in `docs/plan_topics/v6-typed-queries.md` are unchanged byte-for-byte by this finding's edits, and no spec topic file is modified.

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
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The V6k *Tests* line in `docs/plan_topics/v6-typed-queries.md` (leaf "V6k — `tool_loop` cap enforcement and `ToolLoopExhaustedError`") currently exercises `max_rounds: 0` only as far as asserting that the model receives an empty `tools` set during the free phase; it does not pin the boundary outcome of a `max_rounds: 0` typed query. Two compliant readings of the spec rule established by T11a and the V6k counting-formula re-stated by T11b — one in which the forced respond turn fires (returning `Ok(validated_value)`) and one in which the loop is treated as already exhausted (returning `Err({ kind: "tool_loop_exhausted", rounds: 0, last_tool_name: null })`) — would each pass V6k's existing *Tests* row and *Ships when* gate, so the leaf cannot catch the divergence.

## Solution approach

Add a paired normative test vector to V6k's *Tests* line covering the `max_rounds: 0` typed-query boundary: one row in which the model — invoked once against an empty tool set with forced choice on the respond tool — emits a valid respond-tool call and the query MUST return `Ok(validated_value)`, paired with one row in which the model emits a non-respond `tool_use` block (or text under non-strict providers) and the query MUST return `Err({ kind: "tool_loop_exhausted", rounds: 0, last_tool_name: null })`. The error-payload field values are load-bearing because they are what distinguishes the two compliant readings the finding identifies. Land after T11a (spec rule) and T11b (V6k *Adds* formula) per Relationships.

## Solution constraints

- Edit only V6k's *Tests* line in `docs/plan_topics/v6-typed-queries.md`; do not edit V6k's *Spec* / *Adds* / *Deps* / *Ships when* fields, do not edit any other plan leaf, and do not edit any spec topic file (in particular, the *Tool-call loop bound* section and the *Worked example: depth-6 forced respond at `max_rounds`* example in `docs/spec_topics/query.md` are read-only for this finding).
- The added vector MUST distinguish the two compliant outcomes for the same `max_rounds: 0` typed-query setup — `Ok(validated_value)` when the model emits a respond-tool call, `Err({ kind: "tool_loop_exhausted", rounds: 0, last_tool_name: null })` when it does not — so that the leaf's *Ships when* gate fails on either of the two divergent implementations the finding describes.
- The vector MUST be scoped to the original typed query and MUST NOT conflate `max_rounds: 0` on the original query with `max_rounds: 0` on a respond-repair follow-up (V13g follow-ups receive a fresh `tool_loop` budget).
- The existing `max_rounds: 0` empty-`tools`-set assertion already present on V6k's *Tests* line MUST remain asserted (either as a separate row or folded into the new paired vector without losing the empty-tools-delivery assertion).
- Land after T11a and T11b per Relationships; the spec rule and the V6k *Adds* formula must be in place before the test vector can assert against them.

## Success criteria

- V6k's *Tests* line in `docs/plan_topics/v6-typed-queries.md` contains a row asserting that a typed query with `max_rounds: 0` whose forced respond turn returns a valid respond-tool call returns `Ok(validated_value)`.
- V6k's *Tests* line contains a paired row asserting that the same `max_rounds: 0` typed-query setup, when the model emits a non-respond `tool_use` block (or text under non-strict providers) instead of a respond-tool call, returns `Err({ kind: "tool_loop_exhausted", rounds: 0, last_tool_name: null })` — including each of the literal payload fields `kind: "tool_loop_exhausted"`, `rounds: 0`, and `last_tool_name: null`.
- V6k's *Tests* line continues to assert that `max_rounds: 0` causes the model to receive an empty `tools` set during the free phase.
- The V6k *Adds* paragraph, *Spec* line, *Deps* line, and *Ships when* line in `docs/plan_topics/v6-typed-queries.md` are unchanged byte-for-byte by this finding's edits, and no spec topic file is modified.

## Relationships

- T11a "Replace 'consumes one slot' prose with explicit forced-respond exemption rule" — must-follow.
- T11b "V6k counting-formula tighten: forced respond outside the budget" — must-follow.

---

# T12 — Dual-cap simultaneous breach: `<cap>` value in `loom/load/discovery-slow` diagnostic is indeterminate

**Original heading:** Dual-cap simultaneous breach: `<cap>` value in diagnostic is indeterminate
**Original section:** docs/spec_topics/discovery.md
**Kind:** testability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The "Package discovery" → "Edge cases" bounded-walk paragraph in `docs/spec_topics/discovery.md` says the walk stops on `looms.scanPackagesMaxFiles` or `looms.scanPackagesTimeoutMs` "whichever fires first" and emits a single `loom/load/discovery-slow` warning naming "the cap that fired", but both predicates are evaluated against the same observed state at the same cap-check site (before each new candidate-package read). When both predicates first become true on the same iteration — constructible deterministically via the `FakeClock` seam — the spec does not say which is consulted first, so the warning's `cap` payload is indeterminate. Two compliant implementations would emit different `cap` strings for the same input scenario, breaking any test fixture or operator log-analysis that keys on the field. The asymmetric ordering rule already stated later in the same paragraph for the per-read deadline / global timeout interaction shows the authors recognise the need to nail down such overlaps; the dual-cap case at the cap-check site itself was missed.

## Solution approach

Clarify the bounded-walk paragraph under "Edge cases" in the "Package discovery" section of `docs/spec_topics/discovery.md` by adding a tie-breaking rule for the simultaneous-true case at the cap-check site: the file-count predicate is evaluated before the elapsed-time predicate, so when both predicates are true at the same iteration the warning's `cap` field is `looms.scanPackagesMaxFiles`. Leave the per-read deadline / global timeout ordering rule already stated later in the same paragraph unchanged — that race is at a different site and already has its ordering nailed down.

## Solution constraints

- Edit only the bounded-walk bullet under "Edge cases" in the "Package discovery" section of `docs/spec_topics/discovery.md`; do not edit the per-read deadline interaction sentences, the `looms.scanPackages: false` clause, the `looms.scanPackages*` schema entries lower in the file, or the `loom/load/discovery-slow` registry entry in `docs/spec_topics/diagnostics.md`.
- The added rule MUST be expressed as an evaluation-order tie-break at the cap-check site (between candidate reads) and MUST resolve the simultaneous-true case to a single named value drawn from `{looms.scanPackagesMaxFiles, looms.scanPackagesTimeoutMs}`; do not introduce a new `cap` value, a third diagnostic code, or a new `details` field.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.
- Test-vector additions to plan leaf V14m in `docs/plan_topics/v14-tool-calls.md` are out of scope for this finding's spec edit and are tracked under that leaf.

## Success criteria

- The bounded-walk paragraph under "Edge cases" in the "Package discovery" section of `docs/spec_topics/discovery.md` names which of the two predicates wins when both the file-count and elapsed-time caps first become true at the same cap-check iteration, and names the `cap` field value the resulting `loom/load/discovery-slow` warning carries in that case.
- The named `cap` value is one of `looms.scanPackagesMaxFiles` or `looms.scanPackagesTimeoutMs` (no third value introduced).
- The per-read deadline / global timeout ordering sentence already present in the same bounded-walk paragraph (the one stating that the per-read warning is emitted first and the global `loom/load/discovery-slow` warning still fires from the cap-check site at the next candidate) remains present in that paragraph and is not modified by this finding.
- The `loom/load/discovery-slow` registry entry in `docs/spec_topics/diagnostics.md` is not modified by this finding.

## Relationships

None

---

# T13 — Invocation depth bound: introductory sentence omits the "cross-file" qualifier on `.warp fn` calls

**Original heading:** "`.warp` `fn` invokes" vs "cross-file `.warp` `fn` call" — contradictory depth-counting qualifier
**Original section:** docs/spec_topics/invocation.md
**Kind:** naming
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The "Invocation depth bound" subsection of `docs/spec_topics/invocation.md` defines the same rule twice with different breadth. Its introductory paragraph enumerates the countable dispatches as direct `invoke(...)`, `.loom` callable calls through `tools:`, and `.warp` `fn` invokes — omitting the `cross-file` qualifier that the normative *countable-frame* paragraph immediately below applies to `.warp` `fn` calls. The qualifier is load-bearing: without it, intra-`.warp`-file `fn` dispatch is wrongly read as consuming a depth slot, so two implementers reading the subsection in order arrive at incompatible 32-slot budgets. The same loose phrasing has already propagated to the V18n leaf's *Adds.* bullet in `docs/plan_topics/v18-cancellation.md`.

## Solution approach

Rewrite the enumeration in the introductory paragraph of the "Invocation depth bound" subsection of `docs/spec_topics/invocation.md` so its third item reads "cross-file `.warp` `fn` calls" — adding the `cross-file` qualifier and matching the noun (`calls`) used by the normative *countable-frame* paragraph that follows. Apply the same wording change to the *Adds.* bullet of V18n in `docs/plan_topics/v18-cancellation.md`. Leave the normative *countable-frame* paragraph and the rest of the subsection unchanged.

## Solution constraints

- The normative *countable-frame* paragraph in the "Invocation depth bound" subsection of `docs/spec_topics/invocation.md` (already correct) MUST NOT be edited.
- The edit to the introductory paragraph MUST be confined to the enumeration of countable dispatches; the per-chain/sibling-budget parenthetical, the panic-code reference, the panic-routing cross-link, and the surrounding sentences MUST NOT be modified.
- The edit to V18n's *Adds.* bullet in `docs/plan_topics/v18-cancellation.md` MUST be confined to the parenthetical that enumerates the depth-cap's countable dispatches; the rest of the bullet (panic-surface narrative, subagent disposal text, dependency lists) MUST NOT be modified.
- No new spec rule IDs may be introduced — pi-loom uses no stable spec rule IDs.

## Success criteria

- The introductory paragraph of the "Invocation depth bound" subsection of `docs/spec_topics/invocation.md` enumerates the third countable dispatch using the qualifier `cross-file` before the `.warp` `fn` reference, and uses the noun `calls` (not `invokes`) for that item.
- No occurrence of the bare phrase ``and `.warp` `fn` invokes`` (without the `cross-file` qualifier) remains anywhere in the "Invocation depth bound" subsection of `docs/spec_topics/invocation.md`.
- The V18n leaf in `docs/plan_topics/v18-cancellation.md` describes the depth cap using the qualifier `cross-file` before its `.warp` `fn` reference, with no remaining occurrence of the bare ``.warp` `fn` invokes`` phrasing in that leaf.
- The normative *countable-frame* paragraph that follows the introductory paragraph in the "Invocation depth bound" subsection of `docs/spec_topics/invocation.md` is unchanged byte-for-byte by this finding's edits.

## Relationships

None

---

# T14 — Prompt-mode sequentiality argument has an unstated fourth premise

**Original heading:** Prompt-mode sequentiality guarantee chains three unverified premises
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** assumptions
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The Session-model paragraph in `docs/spec.md` (anchored at `id="session-model"`) concludes that prompt-mode bodies execute strictly sequentially within a user session and supports that conclusion with three premises (i)/(ii)/(iii) that only close the user-session axis. Those three premises do not on their own rule out the sibling-subagent fan-out path that the next paragraph explicitly admits: a subagent-mode body may itself `invoke(...)` a prompt-mode child, and whether such a child can re-enter the user session and contend for `pi.setActiveTools` is the load-bearing question. The closing rule lives in the Cross-mode semantics section of `docs/spec_topics/invocation.md` (a `subagent → prompt` callee attaches to the subagent's own private `AgentSession`, not the user session), but a reader auditing the argument from `spec.md` alone cannot derive that — the fourth premise is unstated.

## Solution approach

Add a fourth premise to the parenthesised support list in the Session-model paragraph that names the Cross-mode rule closing the subagent-spawned-prompt-mode-child escape, and forward-link to the owning section in `docs/spec_topics/invocation.md`. Cite the Cross-mode rule rather than inlining or paraphrasing it. Leave the existing three premises and the follow-up "three potential sources of in-session overlap" sentence unchanged.

## Solution constraints

- The added premise MUST forward-link to the Cross-mode semantics section of `docs/spec_topics/invocation.md` and MUST NOT inline, restate, or paraphrase the rule's content beyond the one-clause framing needed to identify which escape it closes.
- The wording of the existing premises (i)/(ii)/(iii) and of the follow-up "three potential sources of in-session overlap" sentence MUST NOT be modified by this finding.
- Restructuring the Session-model paragraph (reduction at Orientation level, relocation to a Concurrency-model home, scope-deferral lift) is owned by T15a / T15b / T15c; this finding edits only the support list, and the fourth premise is preserved across whichever sibling lands first per T15b's must-follow on T14.
- Plan-leaf edits (extending V15g / V15h / V15j test lists with a sequentiality assertion) are out of scope for the spec edit captured by this finding and are tracked under those leaves.

## Success criteria

- The Session-model paragraph at `id="session-model"` in `docs/spec.md` lists four premises supporting strict prompt-mode sequentiality (or, after T15b lands, the relocated Concurrency-model section does).
- The fourth premise contains a forward-link whose target is the Cross-mode semantics section of `docs/spec_topics/invocation.md`, and that target resolves to a present anchor or heading in that file.
- The follow-up sentence enumerating the three potential sources of in-session overlap remains present, naming the same three sources, and is not promoted to four.
- The fourth premise contains no reproduction of the Cross-mode rule's normative content (no `subagent → prompt` matrix cell text, no `AgentSession`-attachment mechanics restated) beyond the one-clause framing identifying which fan-out path is closed.

## Relationships

- T23 "Pi's per-session slash-handler serialisation is asserted without a verifiable Pi source" — same-cluster (different premise of the same argument).
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster (touches the same Session-model paragraph; co-edit pass).
- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — same-cluster (also concerns the sibling-subagent fan-out path, on the diagnostics axis; co-resolve siblings T19b/c/d/e also relevant).
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster (same fan-out path, resource-exhaustion axis).

---

# T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet

**Original heading:** Detailed architecture content in Orientation heading; out-of-scope statements buried in narrative
**Original section:** docs/spec.md — Orientation > Session model
**Split from:** "Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block" (entry 1 of 3)
**Kind:** placement
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites compresses five distinct content categories — Pi-session binding, `session_shutdown` payload contract, prompt-mode sequentiality argument with its three supporting premises, mode-qualified transcript/tool-table isolation, and admission-cap / per-invocation-budget posture — into one Orientation bullet. The architectural clauses belong in the new `Concurrency model` subsection owned by T15b, and the V1 scope deferrals (parallel-`invoke`, concurrent user sessions) belong at the V1 non-goals surfaces owned by T15c; until this reduction lands, those siblings have no room to relocate content into. The paragraph reads as a single mixed block rather than as Orientation-level forward-linking prose.

## Solution approach

Rewrite the `<a id="session-model"></a>` paragraph so it carries only four orientation-level sentences: the one-session-at-a-time binding with its existing forward-link to the Session-binding contract in `docs/spec_topics/pi-integration-contract.md`; the `session_shutdown` payload reference with its existing teardown forward-link to the Extension entry point in `docs/spec_topics/pi-integration-contract.md`; the closed `event.reason` set anchored to the SDK type in `@mariozechner/pi-coding-agent`'s `dist/core/extensions/types.d.ts`; and a forward-link to the new `Concurrency model` architectural home created by T15b. Delete from this paragraph every clause being relocated by T15b (mode-qualified isolation summary, prompt-mode sequentiality with premises (i)/(ii)/(iii), genuine-concurrency-only-between-subagent-invocations conclusion, cancellation-propagates-downward restatement, per-invocation budget scoping, no-admission-cap statement) and every clause being lifted by T15c (parallel-`invoke` deferral, concurrent-user-sessions deferral). Co-resolve with T15b and T15c so the reduction, the relocation, and the lift land in one commit.

## Solution constraints

- Edit only the `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites under this finding; do not edit `docs/spec_topics/pi-integration-contract.md` or any other Orientation, Scope, Trust-boundary, or Prerequisites content.
- The reduced paragraph MUST continue to anchor `<a id="session-model"></a>` so existing inbound links (including the Overview's terminal-outcomes paragraph and the `[Session model](#session-model)` reference inside the V1 non-goals subsection) do not break.
- The four retained sentences MUST be Orientation-level forward-linking prose only — no normative restatement of contracts owned by `docs/spec_topics/pi-integration-contract.md` (Session-binding contract, `ActiveInvocationRegistry`, Tool-registration lifetime and visibility, Session-shutdown semantics) or by other topic pages.
- The forward-link to the new `Concurrency model` subsection (target landmark owned by T15b) MUST be present; do not author the destination subsection itself under this finding.
- Co-resolve with T15b and T15c in the same commit; do not land this finding in isolation while the relocated architectural clauses or the lifted scope deferrals have nowhere to go.
- GOV-12 lock-step continues to apply between the reduced paragraph and the owner pages it forward-links.

## Success criteria

- The `<a id="session-model"></a>` paragraph in `docs/spec.md` consists of four sentences: the one-session-at-a-time binding sentence, the `session_shutdown` payload sentence, the closed `event.reason` set sentence, and a forward-link sentence pointing at the `Concurrency model` subsection (the destination landmark owned by T15b).
- An anchor with `id="session-model"` exists in `docs/spec.md` and the `[Session model](#session-model)` link in the V1 non-goals subsection of `docs/spec.md` resolves.
- After T15b co-resolves, no occurrence of the migrated architectural clauses (mode-qualified isolation summary; prompt-mode sequentiality premises (i)/(ii)/(iii); genuine-concurrency-only-between-subagent-invocations conclusion; cancellation-propagates-downward restatement; per-invocation budget scoping; no-admission-cap statement) remains inside the `<a id="session-model"></a>` paragraph.
- After T15c co-resolves, no occurrence of the lifted scope deferrals (parallel-`invoke` deferral; concurrent-user-sessions deferral) remains inside the `<a id="session-model"></a>` paragraph.
- No edits are made to `docs/spec_topics/pi-integration-contract.md` or to any other Orientation, Scope, Trust-boundary, or Prerequisites content in `docs/spec.md` under this finding.

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
**Kind:** placement
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The architectural half of the `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites — the mode-qualified isolation summary, prompt-mode strict sequentiality with its three supporting premises (i)/(ii)/(iii), the genuine-concurrency-only-between-subagent-invocations conclusion, the cancellation-propagates-downward-only restatement, and per-invocation budget scoping — sits inside an Orientation bullet labelled informative rather than in a normative-architectural home. T15a's reduction of that paragraph removes those clauses from Orientation; with no destination in `## Extension Architecture` or `## Implementation Notes` they are dropped on the floor and the architectural reader has no aggregator to land on. The spec presently has no `Concurrency model` subsection under either home.

## Solution approach

Add a new `Concurrency model` subsection in `docs/spec.md` under either `## Extension Architecture` (as a sibling entry to Pi Extension Integration) or `## Implementation Notes` (as a new bulleted entry); pick whichever home the rest of the T15 / T16 placement cluster selects for prompt-vs-subagent-mode mechanics and apply the same choice here. Move the listed architectural clauses out of the `<a id="session-model"></a>` paragraph into the new subsection as an aggregator analogous to the Hard-ceilings bullet, preserving each clause's existing forward-links to `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/implementation-notes.md`, `docs/spec_topics/cancellation.md`, `docs/spec_topics/invocation.md`, and `docs/spec_topics/frontmatter.md` verbatim. Co-resolve with T15a so the migration and the Orientation reduction land in one commit.

## Solution constraints

- Add the new `Concurrency model` subsection only under `## Extension Architecture` or `## Implementation Notes` in `docs/spec.md`; pick the same home that the rest of the T15 / T16 placement cluster selects for prompt-vs-subagent-mode mechanics, and apply that choice consistently here.
- The new subsection MUST be an aggregator analogous to the Hard-ceilings bullet: the topic pages `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/implementation-notes.md`, `docs/spec_topics/cancellation.md`, `docs/spec_topics/invocation.md`, and `docs/spec_topics/frontmatter.md` remain the normative owners; do not restate owner-page text beyond what the forward-links require.
- Every forward-link carried by the migrated clauses in the pre-T15a `<a id="session-model"></a>` paragraph MUST be preserved verbatim in the new subsection — this is a relocation, not a rewrite — with target and count unchanged across the migration.
- The three prompt-mode-sequentiality premises (i)/(ii)/(iii) MUST be preserved verbatim from the source paragraph; do not extend with a fourth premise under this finding (premise (iv) is owned by T14).
- Do not edit `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/implementation-notes.md`, `docs/spec_topics/cancellation.md`, `docs/spec_topics/invocation.md`, or `docs/spec_topics/frontmatter.md` under this finding; do not edit the `<a id="session-model"></a>` paragraph (removal is owned by T15a) or any other Orientation, Scope, or Trust-boundary content.
- Co-resolve with T15a in the same commit; do not land this finding in isolation while the Orientation paragraph still carries the content.
- GOV-12 lock-step continues to apply between this aggregator and its owner pages.

## Success criteria

- A subsection headed "Concurrency model" exists under `## Extension Architecture` or `## Implementation Notes` in `docs/spec.md` and is the sole architectural home for the mode-qualified isolation summary, prompt-mode strict sequentiality with premises (i)/(ii)/(iii), the genuine-concurrency-only-between-subagent-invocations conclusion, the cancellation-propagates-downward-only restatement, and per-invocation budget scoping.
- Every forward-link present on the corresponding clauses in the pre-T15a `<a id="session-model"></a>` paragraph appears verbatim in the new `Concurrency model` subsection (forward-link count and target unchanged across the migration).
- After T15a's co-resolved reduction lands, no occurrence of the migrated architectural clauses (mode-qualified isolation summary; prompt-mode sequentiality premises; genuine-concurrency conclusion; cancellation-propagates-downward restatement; per-invocation budget scoping) remains inside the `<a id="session-model"></a>` paragraph in `docs/spec.md`.
- No edits are made to `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/implementation-notes.md`, `docs/spec_topics/cancellation.md`, `docs/spec_topics/invocation.md`, or `docs/spec_topics/frontmatter.md`, or to other Orientation, Scope, or Trust-boundary content in `docs/spec.md`, under this finding.

## Relationships

- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — co-resolve (the reduction at Orientation must land alongside this relocation).
- T15c "Lift Session-model scope deferrals into Non-goals (V1) section" — co-resolve (sibling restructure of the same paragraph).
- T14 "Prompt-mode sequentiality argument has an unstated fourth premise" — must-follow (the three premises being relocated are the ones T14 needs to extend with the fourth premise; the relocation is the natural moment to add it).
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — must-follow (the admission-cap disposition being relocated is the surface T20 needs the resource-exhaustion answer on).
- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — same-cluster (lives in the same architectural area being created here; co-resolve siblings T19b/c/d/e also relevant).

---

# T15c — Lift Session-model scope deferrals into Non-goals (V1) section

**Original heading:** Detailed architecture content in Orientation heading; out-of-scope statements buried in narrative
**Original section:** docs/spec.md — Orientation > Session model
**Split from:** "Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block" (entry 3 of 3)
**Kind:** scope
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

Two V1 scope deferrals are buried inside the `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites — the parallel-`invoke` deferral mid-clause and the concurrent-user-sessions deferral as the terminal sentence — rather than being legible from the consolidated V1 non-goals surfaces. A reader scanning Orientation for V1 boundaries cannot reliably find them. T15a removes both from the Session-model paragraph in the same edit pass; this finding ensures both deferrals are present at the V1 non-goals surfaces (the aggregator at anchor `id="v1-non-goals"` in `docs/spec.md` and the normative bullet list at anchor `id="v1-non-goals"` in `docs/spec_topics/future-considerations.md`) before T15a's removal lands.

## Solution approach

Verify that both deferrals appear in the V1 non-goals aggregator at anchor `id="v1-non-goals"` in `docs/spec.md` and as normative bullets in the bullet list at anchor `id="v1-non-goals"` in `docs/spec_topics/future-considerations.md`; add either entry only where missing. Both surfaces presently carry both items, so the implementer's edit may be a no-op verification once T15a's reduction is staged. Co-resolve with T15a so the lift confirmation and the paragraph reduction land in one commit.

## Solution constraints

- Edit only the V1 non-goals aggregator at anchor `id="v1-non-goals"` in `docs/spec.md` and/or the normative bullet list at anchor `id="v1-non-goals"` in `docs/spec_topics/future-considerations.md` under this finding; do not edit the `<a id="session-model"></a>` paragraph (that removal is owned by T15a) and do not edit any other Orientation, Scope, or Trust-boundary content.
- Do not invent a Non-goals home unilaterally; this finding presupposes the V1 non-goals aggregator (owned by T38) and its source bullet list in `docs/spec_topics/future-considerations.md` already exist. If either surface is absent at edit time, gate this finding on T38.
- The aggregator entry in `docs/spec.md` MUST forward-link to anchor `id="v1-non-goals"` in `docs/spec_topics/future-considerations.md` rather than restating the normative bullet content; the normative content remains owned by the bullet list in `docs/spec_topics/future-considerations.md`.
- The normative bullet for the parallel-`invoke` deferral in `docs/spec_topics/future-considerations.md` MUST forward-link the Cross-mode semantics section in `docs/spec_topics/invocation.md`; the normative bullet for the concurrent-user-sessions deferral MUST forward-link the Session model paragraph in `docs/spec.md` (anchor `id="session-model"`) for the presupposition framing.
- [default] Co-resolve with T15a in the same commit; do not land this finding in isolation.

## Success criteria

- The V1 non-goals aggregator at anchor `id="v1-non-goals"` in `docs/spec.md` lists short-phrase entries for both "no parallel-`invoke` surface" and "no concurrent user sessions in the same host process".
- The bullet list at anchor `id="v1-non-goals"` in `docs/spec_topics/future-considerations.md` contains a bullet headed "No parallel-`invoke` surface" that forward-links the Cross-mode semantics section in `docs/spec_topics/invocation.md`, and a bullet headed "No concurrent user sessions in the same host process" that forward-links the Session model paragraph in `docs/spec.md`.
- After T15a's co-resolved reduction lands, no occurrence of the phrases "V1 exposes no parallel-`invoke` surface" or "Concurrent *user sessions* in the same host process are out of scope for V1" (or structural variants restating those deferrals) remains inside the `<a id="session-model"></a>` paragraph in `docs/spec.md`.
- No edits are made to the Session-model paragraph in `docs/spec.md` or to any other Orientation, Scope, or Trust-boundary content under this finding.

## Relationships

- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — co-resolve (the reduction removes the deferrals from the paragraph in the same edit pass).
- T15b "Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection" — co-resolve (sibling restructure of the same paragraph).
- T38 "Non-goals are not consolidated into a single section" — must-follow (the lift target only exists once T38 lands).
- T22b "Multi-session contingency response is unspecified in Future Considerations" — co-resolve (T22b proposes a forward-link from the closing scope sentence to `future-considerations.md#v1-non-goals`; the lift performed here is the natural target for that forward-link).

---

# T16a — Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal

**Original heading:** Trust boundary bullet mixes scope decision, normative error contracts, and future-consideration
**Original section:** docs/spec.md — Orientation > Scope > Trust boundary
**Kind:** placement
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The SDK-surface clause of the Trust-boundary bullet under Orientation > Scope in `docs/spec.md` inlines the literal Pi-SDK pin `@mariozechner/pi-coding-agent ~0.72.1` while restating that Pi's `ExtensionAPI` and `ExtensionContext` surfaces expose no per-extension privilege facet. That literal pin is owned verbatim by **Host prerequisites — Pi SDK pin** in `docs/spec_topics/pi-integration-contract.md`; restating it inside the Trust-boundary bullet creates a second site that the **Pi version bump procedure** in `docs/spec_topics/pi-integration-contract.md` (anchor `id="pi-version-bump-procedure"`) expects to drift on the next bump. The behavioural property the scope decision actually rests on is the no-per-extension-privilege-facet property at the V1 Pi-SDK pin, not the literal version range.

## Solution approach

Rewrite the SDK-surface clause of the Trust-boundary bullet so it states only the behavioural property — that the peer packages expose no per-extension privilege facet at the V1 Pi-SDK pin — and forward-links **Host prerequisites — Pi SDK pin** in `docs/spec_topics/pi-integration-contract.md` in lieu of restating the pin. Drop the inline `~0.72.1` parenthetical entirely. Retain the build-time SDK surface-inventory assertion as a single sentence carrying its forward-link to the anchor `id="pi-version-bump-procedure"` in `docs/spec_topics/pi-integration-contract.md`.

## Solution constraints

- Edit only the SDK-surface clause of the Trust-boundary bullet under Orientation > Scope in `docs/spec.md`; do not edit `docs/spec_topics/pi-integration-contract.md` or any other Trust-boundary clause.
- The replacement clause MUST NOT inline the literal `~0.72.1` (or any structural variant restating the pin); the literal pin remains owned solely by **Host prerequisites — Pi SDK pin** in `docs/spec_topics/pi-integration-contract.md`.
- The replacement clause MUST forward-link **Host prerequisites — Pi SDK pin** in `docs/spec_topics/pi-integration-contract.md` in lieu of restating the pin, and MUST retain the existing forward-link to the anchor `id="pi-version-bump-procedure"` in `docs/spec_topics/pi-integration-contract.md` from the build-time SDK surface-inventory assertion sentence.
- The bullet's first sentence ("V1 looms execute inside the Pi extension-host process at full Node host-process privilege.") and the scope claim ("V1 imposes no loom-level sandbox.") MUST remain verbatim; the "no extra mediation" sentence with its forward-link to `docs/spec_topics/pi-integration-contract.md` MUST remain verbatim.
- The `bash` / `read` "illustrative" sentence — editorial colour, not scope-bearing — is dropped in this pass.
- The callable-set paragraph (owned by T16b), the host-side-denial paragraph (owned by T16c), and the closing capability-model sentence (owned by T16d) MUST remain present and unchanged in normative content under this finding.
- [default] Hard edit budget: at most one paragraph rewritten in `docs/spec.md`; no other edits.

## Success criteria

- No occurrence of the literal `~0.72.1` remains anywhere inside the Trust-boundary bullet under Orientation > Scope in `docs/spec.md`.
- The SDK-surface clause of the Trust-boundary bullet in `docs/spec.md` forward-links **Host prerequisites — Pi SDK pin** in `docs/spec_topics/pi-integration-contract.md`.
- The build-time SDK surface-inventory assertion remains a single sentence inside the Trust-boundary bullet in `docs/spec.md` and forward-links the anchor `id="pi-version-bump-procedure"` in `docs/spec_topics/pi-integration-contract.md`.
- The Trust-boundary bullet's first sentence, the no-loom-level-sandbox scope claim, and the no-extra-mediation forward-link sentence remain present and unchanged in `docs/spec.md`.
- No edits are made to `docs/spec_topics/pi-integration-contract.md` or to any other Trust-boundary clause in `docs/spec.md` under this finding.

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
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The callable-set paragraph in the Trust-boundary bullet under Orientation > Scope in `docs/spec.md` names packaging-level Pi-API identifiers — the `customTools` array on `createAgentSession` for subagent mode and the `pi.setActiveTools` snapshot/restore pair for prompt mode — to characterise how the per-mode callable-set wiring is enforced. Those identifiers are owned verbatim by the **Tool-registration lifetime and visibility** and **Conversation drive — subagent mode** sections of `docs/spec_topics/pi-integration-contract.md`; the aggregator restatement drifts the moment either Pi API surface is renamed, replaced, or restructured. The behavioural property the trust-boundary scope decision actually rests on is the per-mode wiring isolation, not the specific Pi APIs that implement it.

## Solution approach

Rewrite the callable-set paragraph in the Trust-boundary bullet so it states only the behavioural isolation rule — subagent-mode invocations see only the loom's declared callable set; prompt-mode invocations see the loom's declared callable set unioned with the user session's snapshot for the swap window — and forward-links the **Tool-registration lifetime and visibility** section in `docs/spec_topics/pi-integration-contract.md` for the SDK-call mechanism. Drop the inline `customTools`, `createAgentSession`, and `pi.setActiveTools` identifiers from the paragraph. The SDK-call mechanism remains owned by the linked PIC section.

## Solution constraints

- Edit only the callable-set paragraph of the Trust-boundary bullet under Orientation > Scope in `docs/spec.md`; do not edit `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/frontmatter.md`, or any other Trust-boundary clause.
- The replacement paragraph MUST NOT inline the literal identifiers `customTools`, `createAgentSession`, or `pi.setActiveTools`, and MUST NOT name any other Pi-API symbol used to wire callables for either mode; the SDK-call mechanism remains owned by the **Tool-registration lifetime and visibility** section in `docs/spec_topics/pi-integration-contract.md`.
- The replacement paragraph MUST forward-link the **Tool-registration lifetime and visibility** section in `docs/spec_topics/pi-integration-contract.md`.
- The replacement paragraph MUST preserve the *callable set* clarification — that the loom's declared callable set is a configuration knob over the *model's* reachable callable set, NOT a host-process sandbox — and MUST preserve the existing forward-link to [Parameters and Frontmatter — `tools`](./spec_topics/frontmatter.md#tools) for the absent-or-empty `tools:` default rule.
- The pre-existing Trust-boundary content above and below the callable-set paragraph — the privilege-model description, the SDK-pin / `ExtensionAPI` / `ExtensionContext` reference, the no-extra-mediation forward-link, the host-side-denial paragraph (owned by T16c), and the closing capability-model sentence (owned by T16d) — MUST remain present and unchanged in normative content under this finding.
- [default] Hard edit budget: at most one paragraph rewritten in `docs/spec.md`; no other edits.

## Success criteria

- No occurrence of the literal `customTools`, the literal `createAgentSession`, or the literal `pi.setActiveTools` remains anywhere inside the Trust-boundary bullet under Orientation > Scope in `docs/spec.md`.
- The callable-set paragraph of the Trust-boundary bullet under Orientation > Scope in `docs/spec.md` forward-links the **Tool-registration lifetime and visibility** section in `docs/spec_topics/pi-integration-contract.md`.
- The callable-set paragraph in `docs/spec.md` preserves the *callable set* clarification (the "configuration knob over the *model's* reachable callable set, NOT a host-process sandbox" framing) and its forward-link to [Parameters and Frontmatter — `tools`](./spec_topics/frontmatter.md#tools).
- No edits are made to `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/frontmatter.md`, or any other Trust-boundary clause in `docs/spec.md` under this finding.

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
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The host-side-denial paragraph in the Trust-boundary bullet under Orientation > Scope in `docs/spec.md` restates the full denial-routing rule for clean `execute()` denials (the `Err(QueryError { kind: "code_tool", cause: "execution", ... })` mapping), the non-conforming-return-envelope routing off `CodeToolError` to `loom/runtime/internal-error` with `details.kind = "tool-return-shape"`, the non-settling-Promise disposition, and the post-cancel late-settlement discard rule. These observable `execute()` outcomes are owned verbatim by the **Failures** section of `docs/spec_topics/tool-calls.md` and by **Tool execution from loom code** in `docs/spec_topics/pi-integration-contract.md` (anchor `id="tool-execution-from-loom-code"`); the aggregator restatement drifts the moment either source widens or reshapes its outcome enumeration.

## Solution approach

Rewrite the host-side-denial paragraph in the Trust-boundary bullet so it stops restating the routing rule and becomes a single sentence that names the host-side-denial pathway (denials of filesystem, network, or Pi-API access reaching loom code through the tool that issued the request), forward-links both `docs/spec_topics/tool-calls.md` (for the **Failures** / outcome-enumeration content) and the anchor `id="tool-execution-from-loom-code"` in `docs/spec_topics/pi-integration-contract.md` for the complete enumeration of observable `execute()` outcomes, and preserves the silent-success-on-denial prohibition. The normative routing content remains owned by the linked sources.

## Solution constraints

- Edit only the host-side-denial paragraph of the Trust-boundary bullet under Orientation > Scope in `docs/spec.md`; do not edit `docs/spec_topics/tool-calls.md`, `docs/spec_topics/pi-integration-contract.md`, or any other Trust-boundary clause.
- The replacement sentence MUST forward-link both `docs/spec_topics/tool-calls.md` (for the **Failures** section / outcome enumeration) and the anchor `id="tool-execution-from-loom-code"` in `docs/spec_topics/pi-integration-contract.md`.
- The replacement sentence MUST NOT inline the literal `Err(QueryError { kind: "code_tool", cause: "execution", ... })` (or any structural variant naming the `kind` / `cause` enum members), MUST NOT inline the literal `details.kind = "tool-return-shape"`, and MUST NOT enumerate the non-conforming-return-envelope, non-settling-Promise, or post-cancel-late-settlement dispositions — those belong to the linked sources only.
- The replacement MUST preserve the silent-success-on-denial prohibition (the rule that host-side denial cannot surface to loom code as success).
- The pre-existing Trust-boundary content above the host-side-denial paragraph — the privilege-model description, the SDK-pin / `ExtensionAPI` / `ExtensionContext` reference, the no-extra-mediation forward-link, and the callable-set paragraph — and the closing capability-model sentence (owned by T16d) MUST remain present and unchanged in normative content under this finding.
- [default] Hard edit budget: at most one sentence in `docs/spec.md`; no other edits.

## Success criteria

- The host-side-denial paragraph of the Trust-boundary bullet under Orientation > Scope in `docs/spec.md` consists of exactly one sentence, and that sentence forward-links both `docs/spec_topics/tool-calls.md` and the anchor `id="tool-execution-from-loom-code"` in `docs/spec_topics/pi-integration-contract.md`.
- No occurrence of the literal `Err(QueryError { kind: "code_tool", cause: "execution", ... })` (or any structural variant naming the `code_tool` / `execution` enum pair) and no occurrence of the literal `details.kind = "tool-return-shape"` remains inside the Trust-boundary bullet in `docs/spec.md`.
- No occurrence of the phrases `non-conforming return envelopes`, `non-settling Promises`, or `post-cancel late settlements` (or `late settlement` / `late-settlement`) remains inside the Trust-boundary bullet in `docs/spec.md`.
- The silent-success-on-denial prohibition remains present in the replacement sentence in `docs/spec.md`.
- No edits are made to `docs/spec_topics/tool-calls.md`, `docs/spec_topics/pi-integration-contract.md`, or any other Trust-boundary clause in `docs/spec.md` under this finding.

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
**Shape:** single
**State:** reduced

## Problem

The closing sentence of the Trust-boundary bullet under Orientation > Scope in `docs/spec.md` ("A per-loom capability model is **out of scope for V1** and is not anticipated by V1; introducing one would require a migration.") restates the per-loom-sandbox / capability-model deferral that is already owned by the **No per-loom sandbox or capability model** bullet under [Future Considerations — V1 non-goals](./spec_topics/future-considerations.md#v1-non-goals). The aggregator restatement drifts the moment the source bullet's framing changes; it should be a forward-link, not a paraphrase.

## Solution approach

Rewrite the closing capability-model sentence of the Trust-boundary bullet so it stops restating the deferral and becomes a single forward-link sentence pointing at the **No per-loom sandbox or capability model** bullet on `docs/spec_topics/future-considerations.md` (anchor `id="v1-non-goals"`). The replacement characterises the disposition only as out of V1 scope and forward-links the source bullet; the normative content of the deferral remains owned by `future-considerations.md`.

## Solution constraints

- Edit only the closing capability-model sentence of the Trust-boundary bullet under Orientation > Scope in `docs/spec.md`; do not edit any other Scope bullet, the V1 non-goals aggregator paragraph, or `docs/spec_topics/future-considerations.md`.
- The replacement sentence MUST forward-link the **No per-loom sandbox or capability model** bullet on `docs/spec_topics/future-considerations.md` via the existing anchor `id="v1-non-goals"`.
- The replacement sentence MUST NOT restate the deferral's content (the "not anticipated by V1" framing or the "would require a migration" framing) — that framing remains owned by the source bullet under [Future Considerations — V1 non-goals](./spec_topics/future-considerations.md#v1-non-goals).
- Do NOT author a doc-level Non-goals section in `docs/spec.md` under this finding — relocating the disclaimer to such a section is owned by T38.
- The pre-existing Trust-boundary content above the closing sentence — the privilege-model description, the SDK-pin / `ExtensionAPI` / `ExtensionContext` reference, the no-extra-mediation forward-link, the callable-set paragraph, and the host-side-denial paragraph — MUST remain present and unchanged in normative content.
- [default] Hard edit budget: at most one sentence in `docs/spec.md`; no other edits.

## Success criteria

- The Trust-boundary bullet under Orientation > Scope in `docs/spec.md` contains exactly one closing sentence on the capability-model disposition, and that sentence forward-links the anchor `id="v1-non-goals"` in `docs/spec_topics/future-considerations.md`.
- No occurrence of the phrase "is not anticipated by V1" and no occurrence of the phrase "would require a migration" remains inside the Trust-boundary bullet in `docs/spec.md`.
- The pre-existing Trust-boundary content above the closing sentence — the privilege-model description, the SDK-pin / `ExtensionAPI` / `ExtensionContext` reference, the no-extra-mediation forward-link, the callable-set paragraph, and the host-side-denial paragraph — remains present and unchanged in normative content.
- No edits are made to `docs/spec_topics/future-considerations.md` or to any other Scope bullet in `docs/spec.md` under this finding.

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
**Shape:** single
**State:** reduced

## Problem

The session-model paragraph in `docs/spec.md` (Orientation > Prerequisites; anchor `id="session-model"`) restates the channel literal (`console.error`) and the control-flow primitive (`try`/`catch`) for the teardown-handler last-resort sink in its `event.reason`-routing parenthetical, duplicating implementation choices that the **Diagnostic-emission isolation** rule in `docs/spec_topics/pi-integration-contract.md` (anchor `id="diagnostic-emission-isolation"`) already owns verbatim, so the aggregator drifts the moment that rule changes shape. Separately, the choice of `console.error` as the teardown-time last-resort sink rests on an implicit Pi extension-host stdio-capture assumption (the channel must remain operator-visible while the extension runtime is being torn down) that is reasoned about purely from the loom side in PIC and `docs/spec_topics/diagnostics.md`, with no Pi-side citation anchoring the warrant.

## Solution approach

Rewrite the session-model paragraph in `docs/spec.md` so every site naming the teardown-handler last-resort sink characterises it only by its behavioural contract — the sink reaches an out-of-band channel and emission failure does not unwind the teardown handler — and forward-links the **Diagnostic-emission isolation** anchor in PIC; remove the inline channel literal and the inline control-flow primitive. In `docs/spec_topics/pi-integration-contract.md`'s **Diagnostic-emission isolation** rule, attach an SP-1-compliant host-side warrant by exactly one of two paths: add one sentence citing a concrete Pi-side source under the `@mariozechner/pi-coding-agent` SDK pin (file path plus symbol or named section, with no line numbers, byte offsets, or commit hashes) for Pi's extension-stdio policy; or, if no authoritative source can be located, add a best-effort presupposition note pinned to the current SDK pin version, paired with a re-verify entry in PIC's **Pi version bump procedure** editorial-review checklist that references the **Diagnostic-emission isolation** anchor and a separately-filed `loom/host/*` follow-up finding for the verification gap.

## Solution constraints

- Edit only the session-model paragraph in `docs/spec.md` (anchor `id="session-model"` under Orientation > Prerequisites) and the **Diagnostic-emission isolation** rule in `docs/spec_topics/pi-integration-contract.md` (anchor `id="diagnostic-emission-isolation"`); do not edit `docs/spec_topics/diagnostics.md` or any other topic file.
- The session-model paragraph in `docs/spec.md` MUST NOT name the channel literal `console.error` or the `try`/`catch` control-flow primitive inline; the channel name and the wrap mechanism MUST live only in the **Diagnostic-emission isolation** rule in PIC.
- Apply the wording reduction at every structurally identical site in the session-model paragraph that names the teardown-handler last-resort sink, not only the first occurrence; each such site MUST forward-link the **Diagnostic-emission isolation** anchor in PIC.
- The PIC edit MUST be SP-1-compliant: do NOT paraphrase or assert Pi's stdio-capture, suppression, or surfacing policy in spec voice; resolve the citation gap by exactly one of (a) a Pi-side citation to a file path under `@mariozechner/pi-coding-agent` plus a symbol or named section (no line numbers, no byte offsets, no commit hashes), or (b) a best-effort presupposition note pinned to the current SDK pin version, paired with both a re-verify line in PIC's **Pi version bump procedure** editorial-review checklist that references the **Diagnostic-emission isolation** anchor and a separately-filed `loom/host/*` follow-up finding for the verification gap.
- The PIC edit is additive: leave the existing **Diagnostic-emission isolation** contract — the five enumerated teardown-handler diagnostic codes, the wrapped serialisation-and-emission sequence, the bare-`code` and two-token serialiser-throw fallbacks, the construction-site wrap, and the count-semantics invocation-site framing — intact; only the host-side warrant attaches.
- If a Path A citation establishes that Pi *does* capture or suppress extension stdio in a way that hides the channel during teardown, swapping the last-resort sink (e.g. to a loom-controlled file under `~/.pi/`) is out of scope for this finding and belongs in a separate follow-up.
- Do NOT introduce a new diagnostic code, a new always-log `kind`, a new `customType` value, a new MUST in `docs/spec.md`, or any change to acceptance criteria for any current plan leaf.
- [default] Hard edit budget: at most one paragraph reduced in `docs/spec.md` (no length increase) and, in PIC, at most one additional sentence (Path A) or one presupposition sentence plus one editorial-review-checklist line (Path B); no other edits.

## Success criteria

- The session-model paragraph in `docs/spec.md` (anchor `id="session-model"`) contains no occurrence of the literal `console.error` and no occurrence of the literal `try`/`catch` (or `try/catch`) inline; every site that names the teardown-handler last-resort sink in that paragraph forward-links the anchor `id="diagnostic-emission-isolation"` in `docs/spec_topics/pi-integration-contract.md` and characterises the sink only by its behavioural contract (out-of-band channel; emission failure does not unwind the teardown handler).
- The **Diagnostic-emission isolation** rule in `docs/spec_topics/pi-integration-contract.md` (anchor `id="diagnostic-emission-isolation"`) contains either (a) one sentence citing a concrete Pi-side source — a file path under `@mariozechner/pi-coding-agent` plus a symbol or named section, with no line numbers, byte offsets, or commit hashes — for Pi's extension-stdio capture / surfacing policy, or (b) a best-effort presupposition note pinning the unverified status to the current SDK pin version, paired with a corresponding entry in PIC's **Pi version bump procedure** editorial-review checklist that references the **Diagnostic-emission isolation** anchor and a separately-filed `loom/host/*` follow-up finding for the verification gap.
- The pre-existing **Diagnostic-emission isolation** contract in `docs/spec_topics/pi-integration-contract.md` — the five enumerated teardown-handler diagnostic codes, the wrapped serialisation-and-emission sequence, the bare-`code` and two-token serialiser-throw fallbacks, the construction-site wrap, and the count-semantics invocation-site framing — remains present and unchanged in normative content.
- No new diagnostic-code identifier appears in `docs/spec_topics/diagnostics.md` under this finding, and no other section of `docs/spec.md` or any other topic file is edited.

## Relationships

- T24 "Fork-reason watcher closure leaves the extension in an unspecified, silently degraded state" — co-resolve (both edit PIC step 4's per-step isolation paragraph and rely on the `console.error` last-resort sink).

---

# T18a — Append success-side null-policy paragraph to PIC Runtime event channel

**Original heading:** Success-outcome observability and operator-channel obligations undefined
**Original section:** docs/spec.md — Orientation > Scope > Runtime observability
**Kind:** completeness
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` enumerates the **always-log set** of failure outcomes that emit on the `loom-system-note` channel — including the explicit four-excluded-kinds paragraph (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`) — but never makes the symmetric statement on the success side: that a loom terminating with `Ok(v)`, including a child loom whose `Ok` flows to its `invoke` parent, emits no event on that channel. Reviewers must triangulate against `docs/spec_topics/invocation.md` and the per-mode bullets in `docs/spec_topics/slash-invocation.md` to confirm the success-visible surfaces are programmatic-only, and the sibling per-surface restatements (T18b in `slash-invocation.md`, T18c in `spec.md`) and the V18q test clause (T18d) have no central spec sentence to anchor against.

## Solution approach

Append one paragraph to the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md`, placed as a coherent peer of the always-log-set framing (around the four-excluded-kinds enumeration / discard-site disposition cluster, not interleaved with the `RuntimeEvent` payload normative text). The paragraph MUST name the `loom-system-note` channel, assert the zero-emission predicate on successful terminal outcomes (including the case where a child loom's `Ok` flows to its `invoke` parent), identify the success-visible surfaces as the driven conversation in prompt mode and the programmatic return value in every mode, and frame itself as the success-side counterpart of the always-log set's failure inventory. The paragraph scopes its null-policy to the *terminal* surface only — pre-evaluation surfaces remain operator-visible regardless of terminal outcome and are out of scope.

## Solution constraints

- Edit only `docs/spec_topics/pi-integration-contract.md`, only inside the **Runtime event channel** section; do not edit `docs/spec.md`, `docs/spec_topics/slash-invocation.md`, `docs/spec_topics/invocation.md`, `docs/spec_topics/glossary.md`, `docs/spec_topics/diagnostics.md`, or any other file under this finding.
- The new paragraph MUST name the `loom-system-note` channel, MUST assert the zero-emission predicate on successful termination, MUST cover both the standalone success case and the case where a child loom's `Ok` flows to its `invoke` parent, and MUST identify the success-visible surfaces as the driven conversation (prompt mode) and the programmatic return value (every mode).
- The paragraph MUST scope its null-policy to the *terminal* outcome surface; do NOT extend the null to pre-evaluation surfaces — the binder echo (`bind_echo: true`) and the no-params overflow note remain operator-visible regardless of terminal outcome.
- Do NOT add a "completed" parity note for subagent slash invocations; doing so re-opens the deferred aggregation / latency surface that is intentionally scoped out of V1.
- Preserve the existing always-log-set framing — the group A / group B partition, the four-excluded-kinds enumeration (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`), the discard-site disposition paragraph, the `display: false` durable-context paragraph, the engine-assumption carve-out, and the `RuntimeEvent` payload shape — unchanged in normative content.
- Do NOT author the per-mode operator-side null sentences in `slash-invocation.md` (owned by T18b), the `spec.md` **Runtime observability** aggregator forward-link (owned by T18c), or the V18q test clause (owned by T18d).
- Do NOT introduce a new diagnostic code, a new always-log `kind`, a new `customType` value, a new MUST anywhere outside this paragraph, or any other normative obligation; the edit is one additive paragraph.
- [default] Hard edit budget: roughly one paragraph (three to five sentences) inside the **Runtime event channel** section; no other edits on the page.

## Success criteria

- The **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` contains a paragraph that names the `loom-system-note` channel, asserts the zero-emission predicate on successful terminal outcomes, identifies the driven conversation (prompt mode) and the programmatic return value (every mode) as the success-visible surfaces, and explicitly covers the case where a child loom's `Ok` flows to its `invoke` parent — or wording of equivalent normative force naming the channel, the zero-emission predicate, both per-mode success-visible surfaces, and the `invoke`-parent `Ok` propagation case.
- The pre-existing always-log-set framing in the same section — the group A / group B partition, the four-excluded-kinds enumeration, the discard-site disposition paragraph, the engine-assumption carve-out, and the `RuntimeEvent` payload shape — remains present and unchanged in normative content.
- No "completed" parity note for subagent slash invocations is authored, no per-mode operator-side null sentence is authored inside `pi-integration-contract.md` (those remain owned by T18b in `slash-invocation.md`), and no edit is made to `docs/spec.md` or any other topic file under this finding.
- No new diagnostic-code identifier appears in `docs/spec_topics/diagnostics.md`, no new `customType` value or always-log `kind` appears anywhere, and the always-log-set partitioning by routing channel remains unchanged.

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
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **prompt mode** and **subagent mode** bullets under *Once a loom is invoked* in `docs/spec_topics/slash-invocation.md` describe the per-mode invocation and conversation-driving surfaces but neither bullet states the operator-side success-outcome null — that a successfully terminating loom emits no `loom-system-note` and that the operator-visible surfaces on success are the per-mode conversation / programmatic-return-value pair only. Sibling T18a installs the central success-side null-policy paragraph in the PIC **Runtime event channel** section, but a reader of `slash-invocation.md` must triangulate against PIC and `docs/spec_topics/invocation.md` to confirm the absence of a terminal operator-side note is deliberate rather than an under-specified surface.

## Solution approach

Add one per-surface null sentence to each of the **prompt mode** and **subagent mode** bullets under *Once a loom is invoked* in `docs/spec_topics/slash-invocation.md`. Each sentence restates, at the per-mode operator-surface level, the success-side null-policy that T18a installs centrally in the PIC **Runtime event channel** section: the prompt-mode sentence names `loom-system-note` and asserts no such note is emitted on successful termination, identifying the driven conversation as the operator-visible surface; the subagent-mode sentence asserts that the operator sees no terminal note on success (the subagent transcript is private and the return value reaches only the programmatic caller) and identifies the pre-start binder echo and the failure-side top-level `Err` note as the operator-visible surfaces. Do not author the central rule — restate the per-mode consequence and rely on T18a's PIC paragraph for the normative source.

## Solution constraints

- Edit only the **prompt mode** and **subagent mode** bullets under *Once a loom is invoked* in `docs/spec_topics/slash-invocation.md`; do not edit `docs/spec.md`, `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/invocation.md`, `docs/spec_topics/diagnostics.md`, `docs/spec_topics/glossary.md`, or any other file under this finding.
- The new sentence on the prompt-mode bullet MUST name `loom-system-note` and MUST assert the zero-emission predicate on successful termination, naming the driven conversation as the operator-visible surface.
- The new sentence on the subagent-mode bullet MUST assert that on successful termination the operator sees no terminal note (the subagent transcript is private; the return value reaches only the programmatic caller) and MUST name both the pre-start binder echo and the failure-side top-level `Err` note as the subagent-mode operator-visible surfaces.
- The pre-existing per-mode framing in both bullets — the prompt-mode current-conversation-driving description and the `Ok`-return-value-not-surfaced-to-user clause; the subagent-mode fresh-isolated-conversation description and the return-value-only-reaches-caller clause — MUST remain present and unchanged in normative content.
- Do not author the central success-side null-policy paragraph (owned by T18a), the `docs/spec.md` **Runtime observability** aggregator forward-link (owned by T18c), or the V18q success-side test clause (owned by T18d).
- Do not introduce a new diagnostic code, a new always-log `kind`, a new `customType` value, a new MUST anywhere outside the two bullets, or any other normative obligation; the edit is two additive per-surface sentences only.
- [default] Hard edit budget: roughly one sentence appended to each of the two bullets under *Once a loom is invoked*; no other edits on the page.

## Success criteria

- The **prompt mode** bullet under *Once a loom is invoked* in `docs/spec_topics/slash-invocation.md` contains text naming `loom-system-note` and asserting the zero-emission predicate on successful termination, with the driven conversation named as the operator-visible surface (or wording of equivalent normative force naming the channel, the zero-emission predicate, and the operator-visible surface).
- The **subagent mode** bullet under *Once a loom is invoked* in `docs/spec_topics/slash-invocation.md` contains text asserting that on successful termination the operator sees no terminal note (the subagent transcript is private; the return value reaches only the programmatic caller) and naming both the pre-start binder echo and the failure-side top-level `Err` note as the subagent-mode operator-visible surfaces.
- The pre-existing prompt-mode and subagent-mode framing in those bullets — the current-conversation-driving description and the `Ok`-return-value-not-surfaced-to-user clause; the fresh-isolated-conversation description and the return-value-only-reaches-caller clause — remains present and unchanged in normative content, and no other section of `docs/spec_topics/slash-invocation.md` is edited.
- No central success-side null-policy paragraph is authored in `docs/spec_topics/slash-invocation.md` (owned by T18a), no edit is made to `docs/spec.md` or any other topic file under this finding, and no new diagnostic-code identifier appears in `docs/spec_topics/diagnostics.md`.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-follow (the central rule must land first).
- T18c "Widen spec.md Runtime observability bullet to forward-link the null-policy" — co-resolve (sibling per-surface restatement; same edit pass).
- T18d "Add V18q test asserting zero `loom-system-note` emissions on successful termination" — co-resolve.

---

# T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy

**Original heading:** Success-outcome observability and operator-channel obligations undefined
**Original section:** docs/spec.md — Orientation > Scope > Runtime observability
**Kind:** completeness
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **Runtime observability** bullet under `### Scope` in `docs/spec.md` (Orientation > Scope) describes only failure-side events on the `loom-system-note` channel and neither names nor forward-links the success-side null-policy — that a loom terminating with `Ok(v)` emits no `loom-system-note` event. Reviewers auditing the operator-visibility contract from this aggregator bullet must triangulate against the PIC **Runtime event channel** section and `docs/spec_topics/slash-invocation.md` to confirm the absence of a success-side emission is deliberate. Sibling T18a installs the central success-side null-policy paragraph in the PIC **Runtime event channel** section and T18b installs the per-mode operator-side null sentences in `slash-invocation.md`, but the spec.md aggregator bullet still gives no forward link to either, so the rule cannot be reached from the canonical entry surface.

## Solution approach

Widen the **Runtime observability** bullet under `### Scope` in `docs/spec.md` by adding a clarifying sentence that names the success-side null-policy on the `loom-system-note` channel and forward-links both the PIC **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` (the central success-side null-policy owner) and the **Once a loom is invoked** section in `docs/spec_topics/slash-invocation.md` (the per-mode operator-surface owner). Do not author the rule itself in `spec.md` — characterise the policy in one short sentence and rely on the link targets that siblings T18a and T18b install for the normative content. Preserve the bullet's existing failure-side framing and existing forward-links unchanged.

## Solution constraints

- Edit only the **Runtime observability** bullet under `### Scope` in `docs/spec.md`; do not edit `docs/spec_topics/pi-integration-contract.md`, `docs/spec_topics/slash-invocation.md`, `docs/spec_topics/diagnostics.md`, `docs/spec_topics/glossary.md`, `docs/spec_topics/future-considerations.md`, or any other file under this finding.
- Preserve every existing forward-link in the bullet — to **Glossary** (for *always-log set*), to **Pi Integration Contract — Runtime event channel**, to **Diagnostics**, and to **Future Considerations — Richer runtime-event telemetry** — with link text and link targets unchanged.
- Preserve the bullet's existing failure-side framing — the *Operator*-facing runtime-failure framing on the `loom-system-note` channel via the *always-log set*, the disjoint `details`-shape sentence about parse / load / type / runtime-panic batches, and the deferred-aggregation sentence — unchanged in normative content.
- The widening MUST name both forward-link targets: the PIC **Runtime event channel** section as the central success-side null-policy owner, AND the `slash-invocation.md` per-mode operator-surface owner; do not collapse to one link.
- Do not author the central success-side null-policy paragraph itself (owned by T18a), the per-mode operator-side null sentences (owned by T18b), or the V18q test clause (owned by T18d); the edit is an aggregator-side mention plus forward-links only.
- Do not introduce a new diagnostic code, a new always-log `kind`, a new `customType` value, a new MUST, or any other normative obligation; the edit is additive forward-linking inside one bullet.
- [default] Hard edit budget: roughly one to two additional sentences inside the existing **Runtime observability** bullet; no other edits on the page.

## Success criteria

- The **Runtime observability** bullet under `### Scope` in `docs/spec.md` contains text characterising the success-side null-policy on the `loom-system-note` channel (i.e., a successfully terminating loom emits no event on that channel) — or wording of equivalent normative force naming the channel and the zero-emission predicate.
- The same bullet contains a Markdown link whose target resolves to the PIC **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` AND a Markdown link whose target resolves to the **Once a loom is invoked** section (or the file as a whole) in `docs/spec_topics/slash-invocation.md`, both reachable from the success-side mention.
- The pre-existing forward-links in the same bullet — to **Glossary**, **Pi Integration Contract — Runtime event channel**, **Diagnostics**, and **Future Considerations — Richer runtime-event telemetry** — remain present with link text and targets unchanged, and the bullet's failure-side framing remains present and unchanged in normative content.
- No central success-side null-policy paragraph is authored in `docs/spec.md` and no per-mode operator-side null sentence is authored in `docs/spec.md` (those rules remain owned by T18a and T18b respectively); no new diagnostic-code identifier appears in `docs/spec_topics/diagnostics.md` under this finding; and no other section of `docs/spec.md` is edited.

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
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The V18q **Tests.** bullet under `## V18q — Runtime event channel and always-log emission` in `docs/plan_topics/v18-cancellation.md` asserts via clause (b) that the four excluded `kind`s (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`) emit zero `loom-system-note` events on the always-log channel, but contains no symmetric clause asserting the success-side null: that a loom terminating with `Ok(v)` emits zero `loom-system-note` events on that channel. Sibling T18a installs the central success-side null-policy paragraph in PIC Runtime event channel; without a paired test clause in V18q, the leaf's **Ships when.** condition cannot catch a regression of that rule, and two compliant implementations could ship divergent success-side emission behaviour.

## Solution approach

Add one new lettered clause to the V18q **Tests.** bullet in `docs/plan_topics/v18-cancellation.md` asserting that a successful prompt-mode loom and a successful slash-invoked subagent-mode loom each emit zero `loom-system-note` events on the always-log channel. Mirror clause (b)'s structural shape (one clause covering both scenarios inline). The clause asserts against the success-side null-policy that sibling T18a installs centrally in PIC Runtime event channel; do not author the spec-side rule here.

## Solution constraints

- Edit only `docs/plan_topics/v18-cancellation.md`; do not edit `docs/spec.md` or any spec topic file (the central success-side null-policy rule is owned by T18a).
- Append the new clause to the existing V18q **Tests.** bullet using the next free letter after the existing (a)–(l) items; do not renumber, drop, reword, or reorder the existing clauses.
- The new clause MUST cover both modes — a successful prompt-mode loom AND a successful slash-invoked subagent-mode loom — and MUST assert zero `loom-system-note` emissions on the always-log channel for each.
- Do not weaken or reword clause (b)'s four-excluded-kinds enumeration (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`); the success-side null is additive to those guarantees, not a substitute.
- Do not edit any other field of V18q (**Spec.**, **Adds.**, **Deps.**, **Ships when.**) and do not edit any other plan leaf under this finding.
- Do not introduce a new diagnostic code, a new always-log `kind`, a new `customType` value, or any cross-leaf dependency change; the edit is a single Tests-clause append.
- [default] Hard edit budget: roughly one additional lettered clause inside the V18q **Tests.** bullet; no other edits on the page.

## Success criteria

- The V18q **Tests.** bullet under `## V18q — Runtime event channel and always-log emission` in `docs/plan_topics/v18-cancellation.md` contains a new lettered clause that names both a successful prompt-mode loom and a successful slash-invoked subagent-mode loom and asserts zero `loom-system-note` emissions on the always-log channel for each (or wording of equivalent normative force naming both modes and the zero-emission predicate).
- All pre-existing V18q Tests clauses (a) through (l), including clause (b)'s four-excluded-kinds enumeration, remain present in the same **Tests.** bullet with their original wording, lettering, and order unchanged.
- The V18q **Spec.**, **Adds.**, **Deps.**, and **Ships when.** lines remain textually unchanged, and no other `## V18` leaf in the file is edited.
- No new diagnostic-code identifier appears in `docs/spec_topics/diagnostics.md`, no new `customType` value or always-log `kind` appears anywhere, and no spec topic file is edited under this finding (the central PIC rule is owned by T18a).

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-follow.
- T18b "Add per-mode operator-side null sentences to slash-invocation.md" — co-resolve.
- T18c "Widen spec.md Runtime observability bullet to forward-link the null-policy" — co-resolve.

---

# T19a — Extend ActiveInvocationRegistry entry shape with invocationId

**Original heading:** Concurrent subagent sibling failure: no aggregation rule for parent or operator surface
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `ActiveInvocationRegistry` entry shape declared under `id="active-invocation-registry"` in `docs/spec_topics/pi-integration-contract.md` carries no per-invocation correlation key — its current `Set<{ loomAbort: AbortController; disposeBarrier: Promise<void>; shutdownReason: string | undefined; loom: string }>` shape lets two concurrent sibling invocations of the same loom be indistinguishable on every downstream operator surface that reads from the registry. Sibling T19b adds an `invocation_id` wire field to `RuntimeEvent`, T19c widens the always-log dedup tuple to include it, and T19d populates `details.event.invocation_id` on the per-invocation `cancelled-by-session-shutdown` emission — all three rely on a canonical registry-side source for the id that does not yet exist. Without a per-entry id minted at registry-insertion time, none of the sibling consumers can populate or dedup on a stable per-invocation discriminator, and same-tick sibling fan-out collapses on every operator surface regardless of how the wire shape evolves.

## Solution approach

Extend the `ActiveInvocationRegistry` entry-shape `Set<...>` declaration under `id="active-invocation-registry"` in `docs/spec_topics/pi-integration-contract.md` with a required `invocationId: string` member, and pin in the section's contract paragraph that each entry's `invocationId` is sourced via `crypto.randomUUID()` at the registry-insertion site (slash-command handler entry, `tool.execute(...)` adapter entry, and `invoke` spawn-site entry) inside the existing **Dispatch-site setup wrap** `try`/`catch` before any awaitable work, and is set on entry creation and never mutated thereafter. The exact identifier name, type, derivation primitive, and insertion-site placement are the substance of the change and are pinned as part of the registry-shape extension. Do not edit the `RuntimeEvent` wire shape, the dedup tuple, the `cancelled-by-session-shutdown` details payload, or any sibling-owned surface.

## Solution constraints

- Edit only `docs/spec_topics/pi-integration-contract.md`; do not edit `docs/spec.md` or any other topic file under this finding.
- The new entry-shape member MUST be named `invocationId` (camelCase, matching the surrounding `loomAbort` / `disposeBarrier` / `shutdownReason` / `loom` member naming) and typed as `string`; it MUST be required (no `?` optionality marker and no `| undefined` union).
- The previously-declared entry-shape members (`loomAbort: AbortController`, `disposeBarrier: Promise<void>`, `shutdownReason: string | undefined`, `loom: string`) MUST be preserved verbatim — same name, same type, same optionality marker — and MUST NOT be reordered.
- The derivation MUST be pinned as `crypto.randomUUID()` evaluated at the registry-insertion site (slash-command handler entry, `tool.execute(...)` adapter entry, `invoke` spawn-site entry) inside the existing **Dispatch-site setup wrap** `try`/`catch` (so a setup-time throw still has an id available for the runtime-defect emission); do not introduce a parallel id channel and do not re-derive an id at any downstream emission site.
- The `invocationId` field MUST be set on entry creation and never mutated thereafter, matching the lifetime guarantee the section already pins for the `loom` field; uniqueness across registry entries MUST rely on `crypto.randomUUID()` collision-resistance, with no registry-side uniqueness check introduced.
- Do not introduce the `RuntimeEvent` `invocation_id` wire field, the always-log dedup-tuple widening, the `cancelled-by-session-shutdown` `details.event.invocation_id` population, or the sibling real-time emission-timing paragraph — owned respectively by T19b, T19c, T19d, and T19e.
- Do not introduce a new diagnostic code, a new `details.kind` discriminator, an aggregation surface, a storm-detection layer, or any cross-sibling demultiplexing surface; the edit is a single-member addition to the registry entry shape plus the corresponding derivation-and-lifetime pin only.
- [default] Hard edit budget: roughly one additional member in the `Set<...>` declaration plus a few sentences inside the `id="active-invocation-registry"` section pinning derivation, insertion-site placement, and lifetime; no other edits on the page.

## Success criteria

- The `ActiveInvocationRegistry` entry-shape `Set<...>` declaration under `id="active-invocation-registry"` in `docs/spec_topics/pi-integration-contract.md` includes a required `invocationId: string` member (no `?` marker, no `| undefined` union, type `string`).
- The previously-declared entry-shape members `loomAbort: AbortController`, `disposeBarrier: Promise<void>`, `shutdownReason: string | undefined`, and `loom: string` remain present in the same `Set<...>` declaration with their original names, types, and optionality markers unchanged.
- The section under `id="active-invocation-registry"` pins that `invocationId` is sourced via `crypto.randomUUID()` at the registry-insertion site inside the existing **Dispatch-site setup wrap** `try`/`catch` and is set on entry creation and never mutated thereafter (or wording of equivalent normative force naming the derivation primitive, the insertion-site placement, and the once-and-immutable lifetime).
- No `RuntimeEvent` wire-field addition, dedup-tuple widening, `cancelled-by-session-shutdown` details change, or sibling timing-rule paragraph appears in this edit (each is owned by a sibling T19b/T19c/T19d/T19e), and no new diagnostic-code identifier is added to `docs/spec_topics/diagnostics.md`.

## Relationships

- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve.
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede (any decision to add operator-visibility for successful sibling outcomes will reuse the `invocation_id` field this child installs).
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.

---

# T19b — Add invocation_id field to RuntimeEvent payload declaration

**Original heading:** Concurrent subagent sibling failure: no aggregation rule for parent or operator surface
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `type RuntimeEvent = { ... }` declaration in the **Runtime event channel** section of `docs/spec_topics/pi-integration-contract.md`, introduced by the sentence pinning the shape as "normative and additive-only", carries no per-invocation correlation field. Sibling T19a sources an `invocationId` from the `ActiveInvocationRegistry` entry, but the wire payload has no destination for that value, so operator-side consumers of the always-log channel cannot distinguish concurrent-sibling emissions from the same loom. T19c's dedup-key widening and T19d's cancelled-by-session-shutdown details population both read this field and require it to be present on the wire shape.

## Solution approach

Add a required `invocation_id: string` field to the `type RuntimeEvent = { ... }` declaration in the **Runtime event channel** section of `docs/spec_topics/pi-integration-contract.md`. Rely on the existing "normative and additive-only" sentence above the declaration to characterise the addition; do not re-author that contract note here. Do not edit the surrounding prose, the dedup-tuple statements, or any sibling-owned surface.

## Solution constraints

- Edit only `docs/spec_topics/pi-integration-contract.md`; do not edit `docs/spec.md` or any other topic file under this finding.
- The new field MUST be named `invocation_id` (snake_case, matching the rest of the wire shape) and typed as `string`; it MUST be required (no `?` optionality marker).
- Every existing field of the `RuntimeEvent` declaration (`kind`, `code`, `loom`, `query_site`, `message`, `attempts`, `tokens_used`, `masked`, `occurred_at`) MUST be preserved verbatim — same name, same type, same optionality marker, same inline comment — and MUST NOT be reordered.
- Do not introduce the `ActiveInvocationRegistry` `invocationId` registry-entry field, the always-log dedup-tuple widening, the cancelled-by-session-shutdown details addition, or the sibling real-time emission-timing paragraph — owned respectively by T19a, T19c, T19d, and T19e.
- Do not introduce a new diagnostic code, a new `details.kind` discriminator, an aggregation surface, a storm-detection layer, or any cross-sibling demultiplexing surface; the edit is a single-field addition to the wire shape only.
- Hard edit budget: roughly one additional line inside the `type RuntimeEvent = { ... }` block; no other edits on the page.

## Success criteria

- The `type RuntimeEvent = { ... }` block in `docs/spec_topics/pi-integration-contract.md` declares a required `invocation_id: string` member (no `?` marker, type `string`).
- Every previously-declared `RuntimeEvent` field (`kind`, `code`, `loom`, `query_site`, `message`, `attempts`, `tokens_used`, `masked`, `occurred_at`) remains present in the same declaration with its original name, type, optionality, and inline comment unchanged.
- The sentence introducing the `type RuntimeEvent` block as "normative and additive-only" remains present and unchanged in the **Runtime event channel** section.
- No `ActiveInvocationRegistry` shape change, dedup-tuple widening, cancelled-by-session-shutdown details change, or sibling timing-rule paragraph appears in this edit (each is owned by a sibling T19a/T19c/T19d/T19e), and no new diagnostic-code identifier is added to `docs/spec_topics/diagnostics.md`.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve (this child consumes the field T19a sources).
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.

---

# T19c — Widen always-log dedup key to include invocation_id

**Original heading:** Concurrent subagent sibling failure: no aggregation rule for parent or operator surface
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **Deduplication and lifetime rules** sub-block of the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` pins the cascade-twin dedup tuple as `(kind, query_site, message, occurred_at)`, and rule PIC-1 (g) under `id="pic-1"` in the same file restates the same four-field tuple. The tuple has no per-invocation discriminator, so two same-loom sibling invocations whose always-log emissions stamp the same `kind`, `query_site`, `message`, and `occurred_at` collapse into a single dedup-equivalent occurrence even though they originated in distinct invocations. Sibling T19b adds an `invocation_id` field to the `RuntimeEvent` payload that this dedup rule could discriminate on, but the dedup tuple itself does not yet read that field.

## Solution approach

Widen the dedup tuple stated in the **Deduplication and lifetime rules** sub-block of the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` from `(kind, query_site, message, occurred_at)` to `(invocation_id, kind, query_site, message, occurred_at)`, and pin that the always-log channel is session-flat at the wire level while the dedup key is per-invocation. Mirror the same widening in rule PIC-1 (g) under `id="pic-1"` so the two enumerations of the dedup tuple in the same file remain identical. The widening reads the wire field that sibling T19b installs; do not re-author that field here.

## Solution constraints

- Edit only `docs/spec_topics/pi-integration-contract.md`; do not edit `docs/spec.md` or any other topic file under this finding.
- Both occurrences of the dedup tuple in the file — the consumer-deduplication clause inside the **Deduplication and lifetime rules** sub-block and the restatement in rule PIC-1 (g) under `id="pic-1"` — MUST be updated together; leaving them divergent is forbidden.
- The widened tuple MUST place `invocation_id` first (matching the recommendation's ordering) and MUST preserve the existing four field names (`kind`, `query_site`, `message`, `occurred_at`) verbatim and in their existing order; do not rename, drop, or reorder any of the existing four fields.
- Do not introduce the `ActiveInvocationRegistry` `invocationId` field, the `RuntimeEvent` `invocation_id` wire field, the cancelled-by-session-shutdown details addition, or the sibling real-time emission-timing paragraph — owned respectively by T19a, T19b, T19d, and T19e.
- Do not introduce a new diagnostic code, a new `details.kind` discriminator, an aggregation surface, a storm-detection layer, or any cross-sibling demultiplexing surface; the edit is a dedup-tuple widening plus a one-sentence wire-flat-vs-dedup-per-invocation pin only.
- The cascade-twin clause that references the tuple (the rule that two emissions sharing the tuple collapse to one occurrence and that re-emissions copy the originating instance verbatim including `occurred_at`) and the panic-emission `display: false`-not-applicable clause MUST remain textually unchanged apart from the tuple replacement itself.
- Hard edit budget: roughly two sentences updated in place (one in the dedup sub-block, one in PIC-1 (g)) plus one new sentence pinning the wire-flat / dedup-per-invocation distinction; no other edits on the page.

## Success criteria

- Every occurrence of the literal substring `(kind, query_site, message, occurred_at)` in `docs/spec_topics/pi-integration-contract.md` has been replaced with `(invocation_id, kind, query_site, message, occurred_at)`; no occurrences of the unwidened four-field tuple remain in that file.
- The **Deduplication and lifetime rules** sub-block of the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` contains a sentence stating that the always-log channel is session-flat at the wire level and that the dedup key is per-invocation (or wording of equivalent normative force naming both `invocation_id` and the per-invocation scope of the dedup key).
- Rule PIC-1 (g) under `id="pic-1"` in the same file states the dedup tuple identically to the **Deduplication and lifetime rules** sub-block (both five-field, `invocation_id`-first), and the `masked` non-inclusion clause in (g) remains present and applies to the widened tuple.
- No `ActiveInvocationRegistry` shape change, `RuntimeEvent` wire-field addition, cancelled-by-session-shutdown details change, or sibling timing-rule paragraph appears in this edit (each is owned by a sibling T19a/T19b/T19d/T19e), and no new diagnostic-code identifier is added to `docs/spec_topics/diagnostics.md`.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve.
- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve (this child reads the field T19b adds).
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.

---

# T19d — Populate cancelled-by-session-shutdown details with invocation_id

**Original heading:** Concurrent subagent sibling failure: no aggregation rule for parent or operator surface
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `Per-invocation operator visibility (clean-cancel path)` rule under `id="session-shutdown-semantics"` in `docs/spec_topics/pi-integration-contract.md` pins the per-invocation `finally`'s `loom/runtime/cancelled-by-session-shutdown` emission as the teardown-time operator-visibility surface, currently populating `details.event.reason` (read from the registry entry's `shutdownReason`) and `details.event.loom` (read from the registry entry's `loom`). Sibling T19a extends `ActiveInvocationRegistry` entries with an `invocationId` field and sibling T19b adds `invocation_id` to `RuntimeEvent`, but the cleanly-cancelled per-invocation note has no spec rule pinning that `details.event.invocation_id` is populated. Without it, cleanly-cancelled concurrent siblings of the same loom collapse onto the same operator-stream row at teardown even after the registry source and wire field exist. The `loom/runtime/cancelled-by-session-shutdown` row in `docs/spec_topics/diagnostics.md` and the nesting convention under `id="session-shutdown-details-conventions"` in the same file inherit the same gap on the diagnostics-side surface.

## Solution approach

Extend the `Per-invocation operator visibility (clean-cancel path)` rule under `id="session-shutdown-semantics"` in `docs/spec_topics/pi-integration-contract.md` to pin that the per-invocation `finally`'s `cancelled-by-session-shutdown` emission populates `details.event.invocation_id` by reading the registry entry's `invocationId` field (the same channel by which `details.event.loom` is read), not by re-deriving an id at the emission site. Mirror the addition in the `loom/runtime/cancelled-by-session-shutdown` row of `docs/spec_topics/diagnostics.md` and in the nesting-convention paragraph under `id="session-shutdown-details-conventions"` in the same file if and only if those locations enumerate the `details.event` field set; otherwise carry no diagnostics-side enumeration drift.

## Solution constraints

- Edit only `docs/spec_topics/pi-integration-contract.md` and (where the field set is enumerated) `docs/spec_topics/diagnostics.md`; do not edit `docs/spec.md` or any other topic file under this finding.
- Source `details.event.invocation_id` from the `ActiveInvocationRegistry` entry's `invocationId` field on the per-invocation `finally`; do not re-derive an id at the emission site and do not introduce a parallel id channel.
- Do not introduce the `invocationId` registry-entry field, the `RuntimeEvent` `invocation_id` wire field, the always-log dedup-key widening, or the sibling real-time emission-timing rule — owned respectively by T19a, T19b, T19c, and T19e.
- Do not introduce a new diagnostic code, a new `details.kind` discriminator, an aggregation surface, a storm-detection layer, or any cross-sibling demultiplexing surface; the edit is a payload-population pin only.
- The pre-existing `details.event.reason` clauses (including the `"quit" | "reload" | "new" | "resume" | "fork" | string` type pin, the four captured-value cases under the **Unknown-reason rule**, and the `"<unreadable>"` sentinel rules including the post-deadline residual-gap arm) and the `details.event.loom` clause MUST remain textually unchanged.
- Hard edit budget: roughly a few sentences inside the `Per-invocation operator visibility (clean-cancel path)` rule, plus a corresponding short addition to the matching `diagnostics.md` row and/or nesting-convention paragraph; no other edits on either page.

## Success criteria

- The `Per-invocation operator visibility (clean-cancel path)` rule under `id="session-shutdown-semantics"` in `docs/spec_topics/pi-integration-contract.md` names `details.event.invocation_id` and pins it as read from the `ActiveInvocationRegistry` entry's `invocationId` field on the per-invocation `finally`.
- If the `loom/runtime/cancelled-by-session-shutdown` row in `docs/spec_topics/diagnostics.md` or the nesting-convention paragraph under `id="session-shutdown-details-conventions"` in the same file enumerates the `details.event` field set, the enumeration lists `invocation_id` alongside `reason` and `loom`; if neither location enumerates the field set, neither location is edited.
- The pre-existing `details.event.reason` clauses (including the closed-set type pin and the `"<unreadable>"` sentinel rules) and the `details.event.loom` clause in the same `Per-invocation operator visibility (clean-cancel path)` rule remain textually unchanged.
- No new diagnostic-code identifier is added to `docs/spec_topics/diagnostics.md`, no new `details.kind` discriminator appears, and no `ActiveInvocationRegistry` shape change, `RuntimeEvent` wire-field change, dedup-key change, or sibling timing-rule change appears in this edit (each is owned by a sibling T19a–T19e).

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve (this child reads the registry entry T19a defines).
- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve.
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.

---

# T19e — Add real-time sibling emission timing paragraph

**Original heading:** Concurrent subagent sibling failure: no aggregation rule for parent or operator surface
**Original section:** docs/spec.md — Orientation > Session model
**Split from:** "Concurrent subagent siblings: no operator demultiplexing or sibling-failure timing rule" (entry 5 of 5, second reshape pass 2026-05-11; chosen Option A's `Spec edits` block)
**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` pins exactly-once-per-origin emission semantics for `loom-system-note` always-log notes and lists Deduplication and lifetime rules, but does not pin emission timing across concurrent sibling invocations. An implementer reading the section could legally batch sibling always-log emissions until the parent's tool-loop round closes — deferring operator-visible failure timing — without violating any existing rule on the page. The omission also leaves V18q's concurrent-sibling emission tests without a normative anchor for whether sibling failures must surface in real time at the originating site.

## Solution approach

Append one paragraph to the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` that pins sibling always-log emissions on `loom-system-note` to surface in real time at the originating emission site, forbids batching across the parent's tool-loop round, and names the JavaScript event-loop scheduling order as the interleaving order across concurrent sibling origins. The interleaving-order clause is operator-observable but explicitly non-normative for tests.

## Solution constraints

- Edit only `docs/spec_topics/pi-integration-contract.md`; do not edit `docs/spec.md` or any other topic file under this finding.
- Place the new paragraph inside the **Runtime event channel** section alongside the existing exactly-once-per-origin rule and the Deduplication and lifetime rules; do not relocate or reword the existing paragraphs in that section.
- The interleaving-order clause MUST be non-normative for tests — V18q (and any other test leaf) must not be required to assert a specific sibling interleaving order; only operator-observability of the JavaScript event-loop scheduling order is asserted.
- Do not pre-install `invocation_id` wire-field, `ActiveInvocationRegistry` entry-shape, dedup-key widening, or cancelled-by-session-shutdown details changes — those are owned by sibling findings T19a, T19b, T19c, and T19d respectively.
- Do not introduce a new diagnostic code, a new `details.kind` discriminator, an aggregation surface, a storm-detection layer, or any cross-sibling demultiplexing surface; the edit is a timing-rule pin only.
- Hard edit budget: roughly one paragraph appended to the **Runtime event channel** section; no other edits on the page.

## Success criteria

- The **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` contains exactly one new paragraph that names sibling always-log emissions on `loom-system-note`, asserts real-time emission at the originating site, and forbids deferring sibling emissions across the parent's tool-loop round.
- The same paragraph names the JavaScript event-loop scheduling order as the interleaving order across concurrent sibling origins, marks that order as operator-observable, and explicitly states the order is non-normative for tests (i.e. tests are not required to assert any specific interleaving).
- The exactly-once-per-origin clause and the Deduplication and lifetime rules earlier in the same section remain textually unchanged; the timing rule is added without weakening or rewording the emission-count guarantees.
- No new diagnostic code identifier appears in `docs/spec_topics/diagnostics.md`, and no `invocation_id` wire field, `ActiveInvocationRegistry` shape change, dedup-key change, or cancelled-shutdown details change appears in this edit (each is owned by a sibling T19a–T19d).

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve.
- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve.
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.

---

# T20 — Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes

**Original heading:** No admission cap: resource exhaustion on concurrent subagent invocations is unspecified
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** error-model
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The paragraph anchored at `id="no-invocation-cap"` in `docs/spec_topics/implementation-notes.md` carries a parenthetical disclaimer stating that the no-admission-cap rule does not promise resource unboundedness, but the parenthetical enumerates only one resource class — runtime-value heap — split into the catchable `RangeError` family (routed through `loom/runtime/internal-error`) and uncatchable V8 heap-OOM (host-process termination). Two other classes that scale with concurrent-subagent fan-out are not named in the disclaimer: OS-level descriptor / port / child-process-slot exhaustion, and provider rate-limit / quota responses. Each class already has an existing surface (catchable host throws fall through `loom/runtime/internal-error` per `docs/spec_topics/errors-and-results.md`; per-query 429s surface as `TransportError` on the same page), but the silence leaves implementers and operators without confirmation that those classes inherit the disclaimer and without notice that V1 provides no cross-sibling aggregation surface.

## Solution approach

Widen the existing resource-unboundedness parenthetical inside the `id="no-invocation-cap"` paragraph in `docs/spec_topics/implementation-notes.md` so it enumerates the three resource classes the disclaimer covers: runtime-value heap (citing `NOCEIL-3` in `docs/spec_topics/hard-ceilings.md`, with the existing catchable-`RangeError` → `loom/runtime/internal-error` and uncatchable host-fatal split preserved); OS-level descriptor / port / child-process-slot exhaustion (catchable host throws routed through `loom/runtime/internal-error`, uncatchable host fatals out of scope); and provider rate-limit / quota (per-query `TransportError` per `docs/spec_topics/errors-and-results.md`, with the disclaimer naming the absence of any cross-sibling aggregation surface in V1). The Session-model paragraph in `docs/spec.md` is not edited; its existing forward-link to the disclaimer carries the widened wording.

## Solution constraints

- Edit only `docs/spec_topics/implementation-notes.md`; do not edit `docs/spec.md`, `docs/spec_topics/hard-ceilings.md`, `docs/spec_topics/errors-and-results.md`, or `docs/spec_topics/diagnostics.md`.
- Do not introduce a new diagnostic-code identifier, a new `details.kind` discriminator on `loom/runtime/internal-error`, a new threshold seam, or any cross-sibling aggregation / storm-detection surface — these belong to the rejected option B and are out of scope for this finding.
- Do not weaken, relocate, or restate the `MUST NOT introduce an admission cap` clause that precedes the parenthetical, and do not introduce any new MUST or SHOULD against the runtime — the edit is a widening of an existing parenthetical disclaimer, not a new normative obligation.
- The widened parenthetical must explicitly name the absence of aggregation across siblings in V1 for the provider-rate-limit class, so no implementer infers a `loom-system-note` storm-detection layer.
- Cross-references must use stable landmarks: cite `NOCEIL-3` by identifier, link `loom/runtime/internal-error` and `TransportError` to their existing targets in `docs/spec_topics/errors-and-results.md`, and do not introduce, rename, or relocate any anchor.
- Hard edit budget: roughly one paragraph (the existing parenthetical replaced in place); no other edits on the page.

## Success criteria

- The paragraph anchored at `id="no-invocation-cap"` in `docs/spec_topics/implementation-notes.md` names all three resource classes — runtime-value heap (referencing `NOCEIL-3`), OS-level descriptor / port / child-process-slot exhaustion, and provider rate-limit / quota — within its resource-unboundedness disclaimer.
- The same paragraph contains a clause naming both "siblings" and the absence of aggregation (e.g. "no aggregation across siblings") on the provider-rate-limit class.
- The same paragraph contains a link to `TransportError` whose target resolves in `docs/spec_topics/errors-and-results.md`, and the existing routing reference to `loom/runtime/internal-error` per the same file is preserved.
- The clause forbidding an admission cap (`MUST NOT introduce an admission cap` or equivalent) earlier in the same paragraph remains present and textually unchanged.
- No new diagnostic-code identifier is added to `docs/spec_topics/diagnostics.md` and no new `details.kind` literal appears anywhere under `docs/spec_topics/` as part of this edit.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — same-cluster (same Session-model paragraph; addresses sibling-diagnostic correlation; co-resolve siblings T19b/c/d/e also relevant).
- T15b "Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection" — same-cluster (the relocated concurrency-model home is the natural surface for the resource-exhaustion disclaimer).

---

# T21 — Pi-side slash-handler promise lifecycle taken as given

**Original heading:** `ctx.signal` propagation semantics taken as given
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** assumptions
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The runtime side of the slash-command cancellation chain is fully pinned: the **Cancellation source** section (`id="cancellation-source"`) of `docs/spec_topics/pi-integration-contract.md` and the orientation Session model paragraph (`id="session-model"`) of `docs/spec.md` together specify that `ctx.signal` triggers `loomAbort.abort(reason)`, that the symmetric direction unblocks `await ctx.waitForIdle()`, and that the `session_shutdown` handler awaits `Promise.allSettled(activeInvocations.map(inv => inv.disposeBarrier))`. The Pi side of the same chain is not pinned anywhere: nothing states whether Pi awaits the slash-handler promise for the full invocation, whether Pi imposes an internal deadline, or whether `ctx.signal` is Pi's only out-of-band interaction with the in-flight handler. SDK capability inventory item 5 (`id="sdk-cap-cancellation-propagation"`) only requires that Pi *supplies* the `AbortSignal` at the two entry points. A reader cross-checking the cancellation chain has nothing to verify against, and a future Pi change in this area would not be caught by any spec gate.

## Solution approach

In `docs/spec_topics/pi-integration-contract.md`, add one new loom-side consumption-posture paragraph inside the **Cancellation source** section under `id="cancellation-source"`, immediately following the existing `ctx.signal` JSDoc quote, naming the three loom-side presuppositions about Pi's slash-handler scheduling (Pi awaits the handler's returned `Promise` for the full invocation including any time after `ctx.signal` aborts; Pi imposes no internal deadline; `ctx.signal` is Pi's only out-of-band interaction with the in-flight handler). Resolve the paragraph's citation slot via **exactly one** of two paths under the boundary-discipline-at-external-entities principle (SP-1; see `docs/spec-principles.md`): **Path A** — a Pi-side source citation against the `@mariozechner/pi-coding-agent` SDK pin; or **Path B** — a best-effort disclaimer naming the SDK pin version plus a corresponding audit-step item appended to the editorial-review checklist under `id="pi-version-bump-procedure"`. Frame the paragraph strictly in loom-consumption voice; do not author Pi-side guarantees.

## Solution constraints

- Edit only `docs/spec_topics/pi-integration-contract.md`; no `docs/spec.md` edit is required (the orientation Session model paragraph already forward-links SDK capability inventory item 5).
- The new paragraph MUST use loom-side voice (e.g. "the runtime presupposes", "this spec consumes", "the loom relies on"); it MUST NOT contain the strings `Pi MUST`, `Pi SHALL`, or `Pi REQUIRED`, and MUST NOT paraphrase Pi behaviour in spec voice (SP-1.1).
- Resolve the citation slot by exactly one of Path A or Path B; no middle path is permitted. Path A citations name a file path under the SDK pin plus a symbol or named section, with no exact line numbers, no byte offsets, and no commit hashes (SP-1.2). If a fix-loop pass cannot decide between Path A and Path B, prefer Path B (SP-1.4) over speculative paraphrase.
- If Path B is taken, append exactly one new lettered audit-step item to the editorial-review checklist under `id="pi-version-bump-procedure"`, alongside the existing items, that links to the new paragraph's anchor and instructs the contributor to re-examine whether Path A has become reachable on the next Pi pin bump. Item (f) of that checklist is owned by T22c (must-precede); do not pre-install or relocate it here.
- Do NOT widen SDK capability inventory item 5 (`id="sdk-cap-cancellation-propagation"`) — or any other capability-inventory item — to add a clause about handler-promise settle time, internal deadline, force-resolve, abandon, or detach. Capability-inventory items enumerate behavioural surfaces the loom probes at entry, not Pi-side guarantees authored by this spec.
- Out of scope: the `tool.execute(...)` adapter promise lifecycle (governed independently by the *Tool execution from loom code* outcome-routing summary), and any extension of the cancellation chain into `docs/spec_topics/cancellation.md` (the runtime side is already pinned there).
- Hard edit budget: roughly one paragraph in **Cancellation source**, plus on Path B one lettered checklist item under `id="pi-version-bump-procedure"`.

## Success criteria

- The **Cancellation source** section under `id="cancellation-source"` in `docs/spec_topics/pi-integration-contract.md` contains exactly one new paragraph that names the three loom-side presuppositions about Pi's slash-handler promise lifecycle (handler awaited for the full invocation duration including post-`ctx.signal` time; no internal deadline; `ctx.signal` is the only out-of-band interaction).
- The new paragraph contains no occurrence of the substrings `Pi MUST`, `Pi SHALL`, or `Pi REQUIRED`; the only modal verbs in the paragraph are loom-side.
- The new paragraph's citation slot resolves via **exactly one** of: (Path A) a citation matching the shape `Pi source: ./node_modules/@mariozechner/pi-coding-agent/<file-path> — <symbol-or-anchor>` with no line numbers, byte offsets, or commit hashes; or (Path B) a best-effort disclaimer that names the SDK pin version and includes a re-verify-at-next-pin-bump phrase.
- If Path B is taken, the editorial-review checklist under `id="pi-version-bump-procedure"` in the same file contains exactly one new lettered item whose link target resolves to the new paragraph's anchor and whose body instructs the reviewer to re-examine the Path A citation gap on the next pin bump.
- The clause text under `id="sdk-cap-cancellation-propagation"` is unchanged in scope: no new sentence about handler-promise settle time, deadline, force-resolve, abandon, or detach is added there or to any other capability-inventory item.

## Relationships

- T22a "Single-active-session premise lacks a Pi-source citation in PIC" — same-cluster (parallel SP-1.2 citation pattern; T22a's resolution may produce the citation-search recipe Path A reuses).
- T22b "Multi-session contingency response is unspecified in Future Considerations" — same-cluster.
- T22c "Pi version-bump procedure has no step for the session-binding contract" — same-cluster (Path B's bump-procedure audit step joins the (a)–(f) checklist T22c is also extending).
- T23 "Pi's per-session slash-handler serialisation is asserted without a verifiable Pi source" — same-cluster (sibling SP-1.2 citation gap on Pi-side scheduling).

---

# T22c — Pi version-bump procedure has no step for the session-binding contract

**Original heading:** Concurrent user sessions: Pi guarantee uncited; fallback if Pi adds support undefined (split from T22, part 3 of 3)
**Original section:** docs/spec_topics/pi-integration-contract.md — Pi version-bump procedure
**Kind:** completeness
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The "Editorial-review checklist for unpinned host presuppositions" sub-block under step 1 of the `#pi-version-bump-procedure` section in `docs/spec_topics/pi-integration-contract.md` enumerates audit items (a)–(e) for unpinned host presuppositions on each Pi minor bump but contains no item that re-confirms the single-active-session binding contract pinned at `#session-binding-contract` (installed by T22a1). A Pi minor that quietly broadened the binding — for example, by changing `ExtensionAPI` lifetime from per-session to per-process while keeping every named member intact — would pass step 2(a)'s literal-read inventory, step 2(b)'s closure audit, and the (a)–(e) editorial-review items, leaving the runtime's single-active-session assumptions (factory-captured `pi`, `ActiveInvocationRegistry`, prompt-mode `pi.setActiveTools` snapshot/restore) exposed to silent breakage. The detection mechanism for the binding contract is therefore missing from the bump procedure that gates every other host-presupposition re-validation.

## Solution approach

In `docs/spec_topics/pi-integration-contract.md`, append one new lettered item (f) to the editorial-review checklist immediately after item (e) under step 1 of `#pi-version-bump-procedure`, instructing the contributor on each Pi minor bump to re-read the Pi-source paragraph cited under `#session-binding-contract` against the candidate minor's lifecycle documentation and confirm the single-active-session guarantee still holds. The new item is SHOULD-level and carries an inline escalation clause stating that the obligation upgrades to MUST plus a build-time pin once Pi exposes a typed session-lifetime contract that the surface-inventory probe can mechanically verify. Update the checklist preamble's lettered range from "(a)–(e)" to "(a)–(f)".

## Solution constraints

- Edit only `docs/spec_topics/pi-integration-contract.md`; do not edit `docs/spec.md`, `docs/spec_topics/future-considerations.md`, or any other topic file under this finding.
- The new item (f) is SHOULD-level only; do not introduce a MUST verb, plan-leaf coverage obligation, or test-fixture obligation in V1.
- The only forward-looking clause permitted in item (f) is the escalation trigger naming a typed Pi session-lifetime contract verifiable by the surface-inventory probe; do not enumerate other hypothetical Pi changes.
- The `#session-binding-contract` anchor is installed by T22a1 (must-precede); do not introduce, restate, or relocate the anchor under this finding.
- Forward-links from `docs/spec.md` into `#session-binding-contract` are owned by T22a1; cross-references from `docs/spec_topics/future-considerations.md` are owned by T22b — do not pre-install either here.
- Hard edit budget: roughly one paragraph appended to the (a)–(e) checklist plus the preamble's lettered-range edit; no other edits on the page.

## Success criteria

- The editorial-review checklist under `#pi-version-bump-procedure` in `docs/spec_topics/pi-integration-contract.md` contains exactly one new lettered item (f) immediately following item (e), and the checklist preamble's lettered range reads "(a)–(f)" with no remaining "(a)–(e)" phrasing for that range.
- Item (f) contains a link whose target resolves to the `id="session-binding-contract"` anchor in the same file.
- Item (f) uses SHOULD (not MUST) for its audit obligation and contains the escalation clause naming a typed Pi session-lifetime contract verifiable by the surface-inventory probe.
- Item (f)'s body contains no new MUST verb, no plan-leaf reference, and no test-fixture obligation.

## Relationships

- T22a "Single-active-session premise lacks a Pi-source citation in PIC" — must-precede (T22a installs the `#session-binding-contract` anchor this step audits against; resolving T22c first leaves the anchor dangling).
- T22b "Multi-session contingency response is unspecified in Future Considerations" — independent (no shared edit surface; either order works after T22a).
- T21 "Pi-side slash-handler promise lifecycle taken as given" — same-cluster (sibling Pi-side guarantee under PIC).
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — independent (T15a restructures `spec.md`'s Orientation block; this finding edits PIC only).

---

# T22b — Multi-session contingency response is unspecified in Future Considerations

**Original heading:** Concurrent user sessions: Pi guarantee uncited; fallback if Pi adds support undefined (split from T22, part 2 of 3)
**Original section:** docs/spec_topics/future-considerations.md — V1 non-goals
**Kind:** completeness
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The "No concurrent user sessions in the same host process" entry under `<a id="v1-non-goals"></a>` in `docs/spec_topics/future-considerations.md` records the V1 scope decision but does not state the runtime's response if Pi quietly relaxes the single-active-session binding within the `~0.72.1` tilde range or a subsequent pin. The closing sentence of the `id="session-model"` paragraph in `docs/spec.md` likewise reads as a flat scope decision rather than a documented disposition. A future maintainer reading the entry after Pi relaxes the binding has no guidance on whether the V1 runtime should refuse to load, bind to the first session, key the registry by session, or emit a host-incompatibility diagnostic.

## Solution approach

In `docs/spec_topics/future-considerations.md`, augment the existing "No concurrent user sessions in the same host process" entry with one disposition sentence stating that every single-session-scoped site stays so scoped and any second session reaching the extension is out of V1 scope, and add `pi-integration-contract.md#session-binding-contract` to that entry's `*Recorded at:*` list. In `docs/spec.md`, rewrite the closing sentence of the `id="session-model"` paragraph as a forward-link into the V1 non-goals entry. The change is documentation-only and adds no normative obligations.

## Solution constraints

- Augment the existing "No concurrent user sessions in the same host process" entry under `id="v1-non-goals"` in place; do not add a duplicate or sibling V1 non-goals entry.
- The appended disposition is documentation-only — no MUST verbs, no plan-leaf obligations, no test fixtures.
- The only `docs/spec.md` edit permitted is the closing sentence of the `id="session-model"` paragraph; the opening-sentence forward-link is owned by T22a1.
- Do not edit `docs/spec_topics/pi-integration-contract.md`; the `#session-binding-contract` anchor is owned by T22a1 and must already exist (must-precede).
- Do not pre-install the Pi version-bump checklist item over the `#session-binding-contract` anchor; that is owned by T22c.

## Success criteria

- The "No concurrent user sessions in the same host process" entry under `id="v1-non-goals"` in `docs/spec_topics/future-considerations.md` contains a disposition sentence naming the three single-session-scoped sites (factory-captured `pi`, `ActiveInvocationRegistry`, prompt-mode `pi.setActiveTools` snapshot/restore protocol) and stating that any second session reaching the extension is out of V1 scope.
- The same entry's `*Recorded at:*` list contains a link that resolves to `./pi-integration-contract.md#session-binding-contract`.
- The closing clause of the `id="session-model"` paragraph in `docs/spec.md` resolves as a link to `./spec_topics/future-considerations.md#v1-non-goals`.
- No occurrence of the bare sentence "Concurrent *user sessions* in the same host process are out of scope for V1 because Pi does not support them." remains in `docs/spec.md`.

## Relationships

- T22a "Single-active-session premise lacks a Pi-source citation in PIC" — must-precede (the anchor `#session-binding-contract` and the spec.md opening-sentence forward-link both come from T22a; resolving T22b first would leave dangling links).
- T22c "Pi version-bump procedure has no step for the session-binding contract" — independent (no shared edit surface; either order works after T22a).
- T15c "Lift Session-model scope deferrals into Non-goals (V1) section" — co-resolve (T15c extracts the closing scope sentence into the Non-goals (V1) section; the forward-link this finding installs is the natural target for that extraction).

---

# T22a1 — Session-binding contract anchor and forward-link missing in PIC and spec.md

**Original heading:** Single-active-session premise lacks a Pi-source citation in PIC (further split from T22a, anchor + paraphrase + forward-link only)
**Original section:** docs/spec_topics/pi-integration-contract.md — Host prerequisites
**Kind:** placement
**Importance:** medium
**Shape:** single
**State:** reduced
**Split from:** T22a (further sub-split 2026-05-12 — see `spec-review-needs-reshape.md` "Reshape rationale" for context; the parent T22a was parked under criterion 4 because of its citation block, which is now isolated to T22a2; this child carries only the anchor + paraphrase + forward-link, none of which trigger criterion 4).

## Problem

The `*Session model.*` paragraph in `docs/spec.md` (anchor `id="session-model"`) opens with the bare assertion "A Pi extension instance is bound to exactly one active user session at a time" without grounding the claim in `pi-integration-contract.md`. PIC's `**Host prerequisites.**` section currently exposes no anchor that sibling findings T22b (Future Considerations contingency cross-link) and T22c (Pi version-bump checklist item) can target for their forward-references. As a result, the single-active-session premise has no canonical home under which session-binding obligations are gathered, and the T22b / T22c cross-links would dangle.

## Solution approach

Add a new sub-section in `docs/spec_topics/pi-integration-contract.md` under `**Host prerequisites.**` — placed adjacent to the existing `ActiveInvocationRegistry` material — titled "Session-binding contract" and carrying the stable HTML anchor `id="session-binding-contract"`. The body is exactly the one existing-paraphrase sentence: "A Pi extension instance is bound to exactly one active user session at a time." Then rewrite the opening sentence of the `id="session-model"` paragraph in `docs/spec.md` as a forward-link to that new anchor. Install only the anchor, the paraphrase sentence, and the forward-link.

## Solution constraints

- The new PIC sub-section MUST contain exactly the one paraphrase sentence plus the anchor element; do not add any Pi-source citation, SDK-doc pointer, fallback condition, or normative MUST under this sub-section. Citation-block work is owned by T22a2.
- Do not pre-install the Future-Considerations contingency cross-link (owned by T22b) or the Pi version-bump checklist item (owned by T22c).
- Do not modify the closing sentence of the `id="session-model"` paragraph in `docs/spec.md` about concurrent user sessions being out of scope; that is owned by T22b. The only `docs/spec.md` edit permitted under this finding is the opening-sentence forward-link rewrite.
- Do not edit `docs/spec_topics/pi-integration.md`; cross-check only that session-lifecycle vocabulary is not duplicated there.
- Do not extend the H1 SDK surface-inventory test (`test/extension/pinned-surface.test.ts`); the single-active-session premise is a Pi-side lifecycle invariant and lives in prose, not in the probe inventory.

## Success criteria

- An anchor with `id="session-binding-contract"` exists in `docs/spec_topics/pi-integration-contract.md`, located inside the `**Host prerequisites.**` section.
- The sub-section under that anchor contains exactly one prose sentence stating the single-active-session paraphrase and contains no source citation, SDK-doc pointer, or normative MUST.
- A link in `docs/spec.md`'s `id="session-model"` paragraph resolves to `./spec_topics/pi-integration-contract.md#session-binding-contract`.
- No occurrence of the bare sentence "A Pi extension instance is bound to exactly one active user session at a time." remains in `docs/spec.md` outside the forward-linked rewrite (i.e. the spec.md opening sentence is no longer un-linked).

## Relationships

- T22a2 "Session-binding contract Pi-source citation upgrade in PIC" — must-follow (T22a2 augments the sub-section installed here by adding the Pi-source citation block; T22a2 is parked in `spec-review-needs-reshape.md` pending human SDK verification).
- T22b "Multi-session contingency response is unspecified in Future Considerations" — must-precede (this finding installs the `#session-binding-contract` anchor T22b's cross-link consumes).
- T22c "Pi version-bump procedure has no step for the session-binding contract" — must-precede (this finding installs the `#session-binding-contract` anchor T22c's checklist item consumes).
- T15c "Lift Session-model scope deferrals into Non-goals (V1) section" — must-precede (T15c's extraction of the 'concurrent user sessions … out of scope' sentence interacts with the forward-link this finding installs on the opening sentence).
- T23 "Pi's per-session slash-handler serialisation is asserted without a verifiable Pi source" — co-resolve (same Session-model paragraph; T23's citation, when it lands, should target the same PIC sub-section).
- T34 "Trust-boundary 'no privilege facet' claim is asserted but not gated by any audit the spec cites" — same-cluster (uncited-Pi-internals pattern).
- T21 "Pi-side slash-handler promise lifecycle taken as given" — same-cluster.
- T36 "`SessionShutdownEvent.reason` closed set has no build-time pin against the SDK type" — same-cluster (diff-audit-on-pin-bump remedy).
