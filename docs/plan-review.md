# Triaged Plan Review — plan

_Generated: 2026-06-10T14:05:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T28) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 2 medium retained; 20 low discarded; 5 low findings merged into 2 medium findings; 27 NIT dropped; 0 false dropped._

---

# T01 — Un-anchored-MUST closing-gate recogniser claims exact precision and recall over free-form prose

**Original heading:** Un-anchored-MUST recogniser over-claims exact precision + recall over free-form prose
**Original section:** docs/plan_topics/conventions.md
**Kind:** overclaim
**Importance:** medium
**Score:** 25
**MustFix:** true

## Finding

The *REQ-ID discipline* cross-cutting rule (`conventions.md`, final sentence of the bullet) asserts that the closing gate's un-anchored-obligation recogniser "matches exactly that class — `PREFIX-N`-less, registry-code-less, non-seam normative MUST/MUST-NOT — so it neither over-fires on an already-anchored or code-keyed obligation nor lets the residue class slip." This claims simultaneous zero false positives and zero false negatives for what is, mechanically, a MUST/MUST-NOT-token text scan over the `spec_topics/**` markdown corpus (operationalised at `H5a`, made live at `H6a`).

A token scan cannot deliver that guarantee. It misses normative obligations phrased without the literal `MUST`/`MUST NOT` token — RFC-2119 alternatives such as "shall" / "is required to", lowercase or split-across-table-cell phrasings, and obligations expressed as declarative requirements. It cannot distinguish a genuinely normative MUST from a MUST appearing inside narrative prose, an illustrative example, or a quoted passage. And it cannot statically hold the plan-wide, evolving set of named cross-leaf seam names that the rule's own "non-seam" qualifier depends on, so the seam-exclusion arm is itself approximate. Each gap is a *false negative* in the exact class the gate exists to certify, and the seam-qualifier approximations are potential *over-fires*.

This recogniser guards the loom 1.0 release criterion: an un-anchored normative obligation that slips past it has no enumerated closing leaf and ships unimplemented while the gate stays green. The unconditional "neither over-fires nor lets the residue class slip" wording invites a reader to treat the mechanical gate as authoritative-and-complete and to forgo the release-time editorial corpus review that is the actual backstop for the non-token and non-local cases.

## Plan Documents

- `docs/plan_topics/conventions.md` — *REQ-ID discipline* cross-cutting rule (final sentence) (edited)
- `docs/plan_topics/H5a-closing-gate-automation.md` — closing-gate machinery; un-anchored-MUST fixture tests (read-only)
- `docs/plan_topics/H6a-live-corpus-activation.md` — live-corpus gate activation (read-only)
- `docs/plan_topics/coverage-matrix.md` — *Code-keyed obligation areas (no numbered REQ-IDs)* table (read-only)

## Spec Documents

None — the fix softens plan-side convention prose and points at the release-time editorial corpus review that already exists in governance (`spec_topics/governance/source-language-stability.md` GOV-15 reviewer-inspection step). No spec rule is added or changed.

## Affected Leaves

**Phases:** None

**Leaves (implementation order):**

None — the defect is in a cross-cutting convention sentence. Softening it does not change any leaf's Tests or Ships-when: `H5a` already scopes its assertions to seeded fixtures and `H6a` to the live corpus without restating the exact-precision claim, so the wording fix does not propagate to leaf acceptance criteria.

## Consequence

**Severity:** correctness

A reader trusting the "neither over-fires nor lets the residue class slip" guarantee treats the mechanical gate as a complete closure check for un-anchored normative obligations. Obligations phrased without the literal `MUST` token (e.g. "shall", "is required to", split-cell, or narrative-embedded) then ship with no enumerated closing leaf while the gate stays green at the loom 1.0 release criterion — the precise defect class the gate was built to certify. The overstated guarantee also discourages the release-time editorial corpus review that is the real backstop for those cases.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** `0603eb4` — "pi-loom plan: resolve 'un-anchored normative MUSTs invisible to closing gate'" (2026-06-10)
**History:** The *REQ-ID discipline* bullet predates this commit (corpus build `c6a664e`), but the overclaiming phrasings ("matches exactly that class", "neither over-fires", "lets the residue class slip") were all introduced together in `0603eb4` — the commit that added the third (un-anchored-MUST) closing-gate surface. `git log -S` for each phrase against `docs/plan_topics/conventions.md` returns only `0603eb4`. The overclaim was co-introduced with the gate feature it characterises: the edit that added the un-anchored-MUST recogniser asserted its own completeness in the same stroke.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/conventions.md`, rewrite the closing sentence of the *REQ-ID discipline* bullet — currently:

> The gate's recogniser matches exactly that class — `PREFIX-N`-less, registry-code-less, non-seam normative MUST/MUST-NOT — so it neither over-fires on an already-anchored or code-keyed obligation nor lets the residue class slip.

to a best-effort framing that states the recogniser's mechanical limit inline and routes the residue to release-time editorial review. The replacement must convey:

- The recogniser is a `MUST`/`MUST NOT`-token text scan over non-narrative `spec_topics/**` pages, excluding obligations already carrying a `PREFIX-N` REQ-ID, a `loom/...` registry code, or a named cross-leaf seam.
- It cannot mechanically catch obligations phrased without the literal `MUST`/`MUST NOT` token (e.g. "shall", "is required to", lowercase, or split-across-table-cell phrasings), cannot distinguish normative MUSTs from narrative / example / quoted MUSTs, and approximates the evolving cross-leaf seam-name set its "non-seam" arm depends on.
- That residue is caught by the release-time editorial corpus review (`governance.md` GOV-15 reviewer-inspection step), not by the mechanical gate.

Mirror the caveat discipline already used for the H3a direct-reference-only scan: scope the gate's claim to what the token scan witnesses and name review as the backstop for the rest. Keep the final sentence ("Re-anchoring any individual MUST … is a spec-side GOV-22 decision …") intact — it is a separate, accurate statement of ownership boundary.

## Relationships

- T03 "Closing gate checks numbered-REQ-ID matrix mapping exists, but not that any test asserts the REQ-ID" — same-cluster (sibling closing-gate surface under the same *REQ-ID discipline* rule; this finding's best-effort framing is the model for T03's recogniser-limit caveat).
- T02 "Architectural- and test-bullet completeness overclaims over partial-coverage mechanisms" — same-cluster (same overclaim pattern; resolves independently).
- T20 "`Sequential by default` carve-out admits only a numbered REQ-ID, but spec-mandated concurrency sites are anchored as code-keyed obligations" — same-cluster (same `conventions.md` REQ-ID-discipline / un-anchored-obligation machinery).

---

# T02 — Architectural- and test-bullet completeness overclaims over partial-coverage mechanisms (H2a no-singleton, V8b PIC-12/20, V17a checkpoint-exhaustivity)

**Original headings:**

- "fails on any global / static / singleton" exceeds the tested mechanism
- PIC-12 / PIC-20 ambient-access bans restate the direct-reference-only scan without its caveat
- "exhaustivity arm" / checkpoint "at no other site" over-claims a representative-category check

**Original section:** H2a — cross-cutting gates; V8b — Clock, FileSystem, IdSource, FileWatcher, TokenEstimator seams; V17a — cancellation core
**Kind:** overclaim
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

Three Tests/Adds bullets across three leaves assert mechanical *completeness* their underlying scan or observation does not deliver, each diverging from the caveat discipline `H3a` already models for its own identifier-keyed scan ("catches only direct references; indirect forms … are not mechanically detected and are enforced by contributor discipline / review").

- **H2a (no-singleton gate).** Adds describes "the `src/**` architectural test that fails on any global / static / singleton" and Ships-when promises rejection of "a singleton in `src/**`", but the sole exercising Tests bullet scopes the assertion to a "module-level mutable singleton". Closure-captured state, lazy module-cache memoisation, and DI-container-registered singletons escape the tested mechanism while the prose certifies they are caught.
- **V8b (PIC-12 / PIC-20 ambient-access bans).** PIC-12 asserts "no ambient timing call outside the `WallClock` adapter" and PIC-20 asserts "`IdSource.newInvocationId()` is the only `crypto.randomUUID` site". Both reuse the `H3a` identifier-keyed scan, which flags only direct textual references; the absolute wording claims zero-escape coverage the scan does not provide.
- **V17a (checkpoint granularity).** The Checkpoint-granularity bullet adds: "The exhaustivity arm asserts *absence*: the seam witnesses no checkpoint inside a primitive operation … and none at a straight-line statement boundary, not merely presence at the five." A finite seam-driven test observes only the node categories the test corpus executes; "exhaustivity" and "at no other site" assert a grammar-wide negative the mechanism does not establish.

## Plan Documents

- `docs/plan_topics/H2a-cross-cutting-gates.md` — Adds; Ships when (edited)
- `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md` — Tests (PIC-12, PIC-20 bullets) (edited)
- `docs/plan_topics/V8b-T-clock-fs-id-watch-token-seams.md` — Tests (PIC-12, PIC-20 bullets) (edited)
- `docs/plan_topics/V17a-cancellation-core.md` — Tests → Checkpoint granularity bullet (edited)
- `docs/plan_topics/V17a-T-cancellation-core.md` — Tests → Checkpoint granularity bullet (edited)
- `docs/plan_topics/H3a-di-seam-skeleton.md` — Tests (caveat-discipline precedent) (read-only)
- `docs/plan_topics/conventions.md` — Cross-cutting rules, *No globals, statics, singletons* (read-only)

## Spec Documents

- `docs/spec_topics/cancellation.md` — Granularity (read-only)

## Affected Leaves

**Phases:** Horizontal; Vertical slices (V8, V17)

**Leaves (implementation order):**

- H2a — Cross-cutting lint and architectural gates — (modified)
- V8b — `Clock`, `FileSystem`, `IdSource`, `FileWatcher`, `TokenEstimator` seams — (modified)
- V8b-T — host-seam tests — (modified)
- V17a — Cancellation core — (modified)
- V17a-T — Cancellation core (tests) — (modified)

## Consequence

**Severity:** advisory

A contributor or test author reading any of these bullets in isolation trusts a completeness the mechanism does not deliver: a closure-captured or DI-container singleton passes `npm test` green; indirect ambient access (aliased / destructured / computed / re-exported) silently passes the PIC-12/20 scan; a checkpoint emitted at an interpreter node kind outside the test corpus ships green. The conventions are then partially enforced while presented as fully enforced, and the residual relies on self-review that the over-claims discourage.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen); 20e5812 — pi-loom plan: resolve "Ambient-access ban asserts soundness it cannot deliver" (2026-06-10, Thomas Andersen); 319b277 — pi-loom plan: resolve "Cancellation checkpoint granularity set unverified" (2026-06-10, Thomas Andersen)
**History:** `c6a664e` authored H2a, V8b/V8b-T, and H3a with the same absolute ambient/singleton wording. `20e5812` added the direct-reference-only caveat to `H3a`'s scan bullet but did not propagate it to V8b's PIC-12/PIC-20 bullets, and the H2a "any … singleton" over-claim was never narrowed. `319b277` added the V17a checkpoint-granularity "exhaustivity arm asserts *absence* … at no other site" wording while resolving an earlier under-verification finding, swinging that bullet from "unverified" to an absolute completeness claim. The completeness overclaims are the product of these interacting commits, each leaving the H3a caveat un-inherited.

## Solution Space

**Shape:** single

### Recommendation

In each leaf, replace the absolute wording with mechanism-scoped wording that names the detected form and the residual, mirroring the `H3a` caveat the scan already invokes.

- **H2a** — in Adds, narrow "fails on any global / static / singleton" to "fails on a module-level global / static / mutable singleton binding (closure-captured, lazy module-cache, and DI-container singletons are not mechanically detected and are enforced by contributor discipline / review)"; in Ships when, narrow "a singleton in `src/**`" to "a module-level mutable singleton in `src/**`". Leave the `conventions.md` *No globals, statics, singletons* rule unchanged (it is the aspirational convention); the Tests bullet already matches the mechanism.
- **V8b / V8b-T** — change PIC-12 to assert no *direct* ambient timing reference outside the `WallClock` adapter, and PIC-20 to "is the only *direct* `crypto.randomUUID` reference; indirect forms are enforced by review", anchoring the caveat to the `H3a` scan rather than restating the full list. PIC-13's "reads … directly" already carries the qualification.
- **V17a / V17a-T** — strike `and at no other site`, `The exhaustivity arm asserts *absence*`, and `not merely presence at the five`; replace with best-effort framing scoped to the enumerated non-checkpoint categories the test drives (primitive operations — arithmetic / comparison / field-index access — and straight-line statement boundaries), stating inline that a checkpoint at a node kind outside the test corpus is not caught by this assertion.

Keep paired `-T` bullets byte-identical to their impl counterparts in the same edit. `conventions.md` and `cancellation.md` are read-only.

## Relationships

- T01 "Un-anchored-MUST closing-gate recogniser claims exact precision and recall over free-form prose" — same-cluster (same overclaim / caveat-discipline pattern).
- T17 "V17a's `Ships when` gate observes only a subset of the cancellation obligations its Tests enumerate" — same-cluster (same V17a leaf; under a split the checkpoint bullet moves to the checkpoint sub-leaf).
