# Triaged Plan Review — plan

_Generated: 2026-06-10T14:05:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T28) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 6 high, 18 medium retained; 20 low discarded; 5 low findings merged into 2 medium findings; 27 NIT dropped; 0 false dropped._

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

---

# T03 — Closing gate checks numbered-REQ-ID matrix mapping exists, but not that any test asserts the REQ-ID

**Original heading:** Closing gate verifies numbered-REQ-ID mapping existence, not that a test asserts the REQ-ID
**Original section:** docs/plan_topics/conventions.md
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The loom 1.0 closing gate covers two sibling traceability surfaces with asymmetric strength. For **diagnostic codes** the gate reconciles the diagnostics registry against the *asserting tests* in both directions: a registry code with no asserting test fails CI, and an asserted code absent from the registry fails CI (`conventions.md` *REQ-ID discipline* final paragraph; `H5a` Tests bullet 2; `V7b` Tests `DIAG-2`). For **numbered REQ-IDs** (`TYPE-*`, `ERR-*`, `PIC-*`, `BNDR-*`, …) the gate only checks that a `coverage-matrix.md` *row* exists — "a spec REQ-ID without a coverage-matrix mapping … as a CI failure" (`conventions.md` *REQ-ID discipline*; `H5a` Tests bullet 1; `coverage-matrix.md` header). The coverage matrix maps each REQ-ID to a closing leaf and asserts "its green tests are the closure evidence", but nothing mechanically verifies that the closing leaf actually contains a test that asserts that REQ-ID.

Consequently a leaf can land with one of its claimed REQ-ID's tests omitted while the manually-maintained matrix row keeps the row present and CI green. Numbered-REQ-ID coverage therefore rests on TDD discipline plus manual coverage-matrix bookkeeping, not on a gate — unlike the diagnostic-code surface, where the same omission reddens CI.

This asymmetry sits on the loom 1.0 release-gate path (`plan.md` item 5, activated by `H6a`), so the class the numbered-REQ-ID surface can miss — a mapped-but-unasserted REQ-ID — is exactly the class the gate exists to certify on the live corpus.

## Plan Documents

- `docs/plan_topics/conventions.md` — *REQ-ID discipline* (edited)
- `docs/plan_topics/H5a-closing-gate-automation.md` — Adds. / Tests. / Ships when. (edited)
- `docs/plan_topics/H6a-live-corpus-activation.md` — Adds. / Tests. (edited)
- `docs/plan_topics/coverage-matrix.md` — *Numbered REQ-IDs (runtime obligations)* table (read-only)
- `docs/plan.md` — item 5 / `## Release gate` (read-only)

## Spec Documents

None — the numbered REQ-IDs already exist in the spec corpus; the fix is internal to the plan's gate machinery and conventions.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H5a — REQ-ID / diagnostic-code closing-gate automation — (modified)
- H6a — Live-corpus closing-gate activation (loom 1.0 release gate) — (modified)

## Consequence

**Severity:** correctness

A numbered REQ-ID can ship with its asserting test omitted while a manually-kept coverage-matrix row keeps CI green; the gate's numbered-REQ-ID surface then passes vacuously for that REQ-ID. The release-gate guarantee in `plan.md` item 5 ("every executable spec REQ-ID has at least one closing leaf … whose green tests are the closure evidence") is enforced for diagnostic codes but only assumed for numbered REQ-IDs.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** c1e5d64 — spec: REQ-ID infrastructure + Phase 12a heading promotion on five named pages (2026-05-05, Thomas Andersen); 3968bda — pi-loom plan: resolve "V18o closing gate ignores the diagnostic-code registry" (2026-05-05, Thomas Andersen)
**History:** c1e5d64 established the numbered-REQ-ID closing-gate surface as a coverage-matrix mapping-existence check ("a spec REQ-ID without a coverage-matrix mapping"). The same-day commit 3968bda then added the diagnostic-code surface with a stronger registry↔asserting-test reconciliation ("a registry code without an asserting test") but did not retrofit the numbered-REQ-ID surface to the same test-level strength. The resulting asymmetry has been carried verbatim through the 2026-05-25 scaffold reset and every subsequent `conventions.md` / `H5a` / `H6a` edit to today.

## Solution Space

**Shape:** single

### Recommendation

Bring the numbered-REQ-ID surface to parity with the diagnostic-code surface. Add a numbered-REQ-ID citation discipline mirroring the existing *Diagnostic message anchors* rule: a test asserting a numbered REQ-ID carries an inline citation of that REQ-ID in the test source, and the closing gate fails when a `coverage-matrix.md`-mapped REQ-ID has no citing test in the test corpus.

- `conventions.md` *REQ-ID discipline*: add that a test asserting a numbered REQ-ID cites that REQ-ID inline in the test source, and that the closing gate treats a coverage-matrix-mapped REQ-ID with no citing test as a CI failure (parallel to the registry-code↔asserting-test clause already present for diagnostic codes).
- `H5a` Adds. / Tests. / Ships when.: extend the gate to reconcile coverage-matrix numbered-REQ-ID mappings against citing tests, and add a seeded fixture pair — a no-violation fixture where every mapped REQ-ID has a citing test, and a violation fixture where a mapped REQ-ID's citing test is absent — so the new failure mode is exercised at `H5a` on the same seeded footing as the existing surfaces.
- `H6a` Adds. / Tests.: extend the live-corpus activation so the numbered-REQ-ID citing-test reconciliation flips to the live corpus alongside the existing unmapped-REQ-ID and un-anchored-MUST modes.

Edge cases: state the citing-test recogniser's text-scan limit inline rather than claiming exact recall (mirror the H3a/H4a caveat discipline), and keep `H6a`'s `Deps.` transitively complete so the live-corpus citing-test mode does not activate against still-landing coverage.

## Relationships

- T01 "Un-anchored-MUST closing-gate recogniser claims exact precision and recall over free-form prose" — same-cluster (sibling closing-gate surface under the same *REQ-ID discipline* rule; its best-effort framing is the model for this fix's recogniser-limit caveat).
- T12 "CNCL-4 session-shutdown reason facet is asserted in V9g but never authored red in V9g-T or gated by Ships-when" — same-cluster (a concrete instance of the mapped-but-unasserted REQ-ID class this gate-extension would catch mechanically).

---

# T04 — NOCEIL-2 and NOCEIL-4 closing leaves carry no trace annotation their siblings (NOCEIL-1/NOCEIL-3) have

**Original headings:**

- NOCEIL-2 has no trace annotation in its closing leaf
- NOCEIL-4 has no trace annotation in its closing leaf

**Original section:** V4d — QueryError variants; V15b — invoke depth bound and cycle detection
**Kind:** traceability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The coverage matrix distributes the four NOCEIL non-existence claims to per-leaf closures: "NOCEIL-2 → `V4d`'s `ContextOverflowError` / ERR-14/15/17" and "NOCEIL-4 → `V15b`'s `INV-4` invoke-depth bound". Neither `V4d`/`V4d-T` nor `V15b`/`V15b-T` carries a NOCEIL label in its Tests field. This breaks the leaf-level trace pattern the other two NOCEIL seams establish: `V6a` tags its bullet `(NOCEIL-1 seam)` and `V4b` tags its bullet `(NOCEIL-3 uncatchable carve-out)`, each in both the impl leaf and its `-T` partner.

NOCEIL closure is a GOV-15 release-time corpus-review obligation, not a mechanical gate. An auditor following the matrix to `V4d` (for NOCEIL-2) or `V15b` (for NOCEIL-4) then finds no marker in the leaf to confirm closure against — leaving NOCEIL-2 and NOCEIL-4 the two outliers of the four-claim set with a one-directional trace.

## Plan Documents

- `docs/plan_topics/V4d-queryerror-variants.md` — Tests (edited)
- `docs/plan_topics/V4d-T-queryerror-variants.md` — Tests (edited)
- `docs/plan_topics/V15b-invoke-depth-cycle.md` — Tests (edited)
- `docs/plan_topics/V15b-T-invoke-depth-cycle.md` — Tests (edited)
- `docs/plan_topics/coverage-matrix.md` — GOV NOCEIL paragraph (read-only)
- `docs/plan_topics/V6a-frontmatter-contract.md` — Tests, NOCEIL-1 annotation pattern (read-only)
- `docs/plan_topics/V4b-runtime-panics.md` — Tests, NOCEIL-3 annotation pattern (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices (V4, V15)

**Leaves (implementation order):**

- V4d-T — `QueryError` variant schema (tests) — (modified)
- V4d — `QueryError` variant schema — (modified)
- V15b-T — Invoke depth bound and cycle detection (tests) — (modified)
- V15b — Invoke depth bound and cycle detection — (modified)

## Consequence

**Severity:** advisory

The behavioural closures exist (the `ContextOverflowError` / ERR-14/15/17 surface and the `INV-4` depth-bound test do enforce what NOCEIL-2 and NOCEIL-4 assert) and the H5a/H6a gate — which checks row existence, not the leaf label — still passes. The cost is to the GOV-15 release-time auditor, who cannot confirm NOCEIL-2 or NOCEIL-4 closure from the leaf the way they can from the annotated `V6a` / `V4b`, leaving two of the four NOCEIL claims with a one-directional trace.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen); 2565ddd — pi-loom plan: resolve "V16a NOCEIL Adds. claim with no backing Tests" (2026-06-10, Thomas Andersen)
**History:** c6a664e authored `V4d`/`V4d-T` (ERR-14/15/17/19, no NOCEIL-2 label) and `V15b`/`V15b-T` (`INV-4`, `loom/load/invocation-cycle`, no NOCEIL-4 label) while giving `V6a` and `V4b` explicit NOCEIL-1/NOCEIL-3 annotations; the matrix at that point attributed NOCEIL content to `V16a`/`V11f`. 2565ddd rewrote the matrix NOCEIL paragraph to distribute NOCEIL-1…4 to `V6a`/`V4d`/`V4b`/`V15b`, introducing the NOCEIL-2 → V4d and NOCEIL-4 → V15b mappings, but touched only `coverage-matrix.md` and did not backfill the matching annotations into `V4d`/`V4d-T` or `V15b`/`V15b-T`. The matrix-claims-vs-leaf-carries divergence is the product of the two commits in both cases.

## Solution Space

**Shape:** single

### Recommendation

Add the missing inline NOCEIL markers, mirroring the `V6a` (`(NOCEIL-1 seam)`) and `V4b` (`(NOCEIL-3 uncatchable carve-out)`) form, in both the impl leaf and its `-T` partner so the pairs stay aligned:

- `V4d` / `V4d-T`: attach a `(NOCEIL-2 seam)` marker to the Tests bullet that asserts the `ContextOverflowError` / ERR-14/15/17 surface (the surface the matrix says NOCEIL-2 closes at).
- `V15b` / `V15b-T`: attach a `(NOCEIL-4 frame-depth seam)` marker to the `INV-4` Tests bullet (the 32-frame invoke-depth bound the matrix says NOCEIL-4 closes at).

The matrix paragraph already names both leaves and needs no change.

## Relationships

None

---

# T05 — Real-host verification gap — every end-to-end and release gate runs only against the H4a session double

**Original heading:** Real-host verification gap — end-to-end gates run only against the H4a session double (H4a, H7a, M, V18c, H6a)
**Original section:** Cross-cutting / multiple leaves
**Kind:** risk, validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

Every end-to-end and release gate in the plan executes against the in-process Pi session double established by `H4a`, never a live Pi host. `H4a`'s harness loads the extension against the double and asserts a four-axis **session-double fidelity contract** (streamed-token order relative to `ctx.waitForIdle()`, single-turn prompt-mode append, the `pi.on` cancel-forward subscription, cancellation propagation) via a self-check; `H4a` states plainly that "loom 1.0 has no mechanical real-host fidelity gate" and that the double's fidelity to real Pi is a host-behaviour presupposition audited only by editorial review. `M`'s SLSH-2 dispatch runs "through the harness", `H7a`'s terminal integration-acceptance run executes against the same double, `V18c`'s version-bump runtime-evidence gate is explicitly "bounded by the `H4a` session double's fidelity to the bumped pin … not real-host coverage", and `H6a`'s release gate reconciles coverage by running `npm test` (the same double-backed suite).

The consequence is a verification blind spot shared by all of them: a divergence between the double and real Pi — turn-append semantics, streaming order relative to `waitForIdle()`, cancel-forwarding, or a behavioural SDK skew introduced at a bumped pin — leaves every gate green while the shipped extension is broken against the real host. `V9a`'s capability probe does not close the gap: it is a structural check (PIC-4 restricts it to `typeof`/`in`, no arity/return-shape sniffing), so it refuses on a missing member but not on a member whose runtime *behaviour* has skewed.

The plan's T20 resolution made this an explicit accepted presupposition, but the acknowledgement stops at "audited by editorial review" — it names no concrete post-merge detection mechanism and no behavioural-divergence revert trigger. The residual risk is real and uncovered by any mechanical gate.

## Plan Documents

- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Adds / Tests (session-double fidelity contract) (edited)
- `docs/plan_topics/V18c-version-bump-checklist.md` — runtime-evidence gate + revert path (edited)
- `docs/plan_topics/H7a-integration-acceptance.md` — Adds / Tests / Ships when (read-only)
- `docs/plan_topics/M-minimal-slash-command.md` — Tests / Ships when (read-only)
- `docs/plan_topics/H6a-live-corpus-activation.md` — release-gate Tests / Ships when (read-only)
- `docs/plan.md` — `## Release gate` section (read-only)
- `docs/plan_topics/conventions.md` — end-to-end harness convention (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — unpinned-presupposition list (edited)
- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — bump-procedure output (c) (read-only)
- `docs/spec_topics/pi-integration-contract/version-bump-intro.md` — Pi version-bump procedure (read-only)

## Affected Leaves

**Phases:** Horizontal phases, MVP phase, Vertical slices (V18), Release gate

**Leaves (implementation order):**

- H4a — Extension factory shell and end-to-end harness — (modified)
- H7a — Terminal integration-acceptance run — (modified)
- M — Minimal end-to-end `.loom` slash command — (modified)
- V18c — Pi version-bump procedure and gates — (modified)
- H6a — Live-corpus closing-gate activation — (modified)

## Consequence

**Severity:** correctness

Every gate the plan relies on to certify real behaviour — `M` (SLSH-2), `H7a` (cross-slice integration), `V18c` (version-bump runtime evidence), and `H6a` (release gate) — can pass green while the extension is broken against a real Pi host, because all of them observe only the in-process double. A double-vs-real divergence (turn-append, streaming-before-`waitForIdle` ordering, cancel-forward, or an SDK behavioural skew at a bumped pin) ships undetected; the sole fallback is editorial review of an unpinned presupposition.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The session-double-only harness design was present in the first plan commit (c6a664e), where `H4a`'s harness loads the extension "against an in-process Pi session double" and `M` dispatches "through the harness" — no leaf provided a real-host gate. Later commits extended the same pattern to every end-to-end/release gate (e7e51cc added `H7a`; 5353dd7 added `H6a`; 81ab342 refined `V18c`'s runtime-evidence gate) and reframed the acknowledgement: eeb0014 added the four-axis fidelity contract while still labelling `V18c` the "real-host backstop", and 07403da (T20 Branch A) corrected that to "no mechanical real-host fidelity gate … audited by editorial review". None of these introduced the gap — they surfaced and re-described a verification blind spot inherent in the inaugural double-only harness.

## Solution Space

**Shape:** single

### Recommendation

Keep the double-only gates but make the accepted residual risk concrete: name a specific post-merge real-host detection mechanism and a revert trigger fired on observed behavioural divergence, beyond the current "audited by editorial review" wording. This matches the plan's deliberate design choice to keep the harness host-free and self-contained, and the gap is already framed as an accepted presupposition — the remaining work is to make that acceptance concrete rather than to add a real-host CI dependency.

- In `H4a`'s fidelity-contract Tests note, state the named detection mechanism (e.g. a scheduled/manual real-host smoke checked at each version bump).
- In `V18c`, widen the revert-path trigger — currently keyed only to red surface-inventory / runtime-evidence acceptance evidence (both double-backed) — so a confirmed real-host behavioural-divergence finding also forces restoration of the prior pin; otherwise the annotation has no enforcement hook.
- Optionally extend the unpinned-presupposition entry in `host-prerequisites.md` to name the detection mechanism and revert trigger.

## Relationships

- T06 "Streamed-token-before-`waitForIdle()` ordering is routed to editorial review by H4a but has no version-bump checklist item" — decision-overlap (same double-vs-real root; whichever real-host confirmation mechanism this finding chooses also governs where that finding's streaming-before-`waitForIdle` presupposition is confirmed — settle a consistent answer).
- T26 "Session-only degraded-state presupposition (a) contradicts Pi's documented teardown-and-rebind extension lifecycle" — decision-overlap (a real-host smoke or accepted post-merge detection surface is the mechanism that would catch that presupposition being false; resolve the detection footing consistently).

---

# T06 — Streamed-token-before-`waitForIdle()` ordering is routed to editorial review by H4a but has no version-bump checklist item

**Original heading:** V12a/V9c assume real Pi streams assistant tokens before `waitForIdle()` resolves — verified only against the double
**Original section:** V9c — prompt-mode conversation drive and active-set gating
**Kind:** risk, assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V12a`'s SLSH-2 test asserts that streamed assistant tokens are observable in the user transcript *before* the interpreter resumes — i.e. before `ctx.waitForIdle()` resolves — "so a buffer-then-append-after-resume implementation fails." This guarantee is not purely loom-side: even though loom performs no buffering, the user only sees tokens before the loom resumes if Pi's TUI streams them into the transcript before it fires `agent_end` (the event that settles `waitForIdle()`). A Pi minor that buffered the assistant response until `agent_end` would make SLSH-2's user-visible-streaming property false against real Pi while every loom test stayed green. This is therefore an unpinned Pi *behavioural* presupposition, identical in kind to the ones enumerated under the version-bump procedure.

`H4a` names exactly this behaviour as axis (i) of its session-double fidelity contract and states that "the Pi behaviours the four contract axes model are audited by editorial review under the Pi version bump procedure … via that checklist's existing presupposition items." But no checklist item in `version-bump-step2.md` (items (a)–(aj)) covers the streaming-visibility ordering. The neighbouring presuppositions are all routed: the driven-turn session-commit ordering that `V9c` relies on is routed to item (ac); turn-liveness to (j); `AgentMessage[]` ordering to (h)/(ag); the cancel-forwarding axes to (v)/(ah)/(ad). Only the user-visible streaming axis has no backing item. The checklist's own closing rule requires that any such presupposition "MUST be added to this checklist in the same edit", so H4a's claim that axis (i) is editorially audited "via existing presupposition items" is unsupported.

The actionable gap is the streaming-visibility half (`V12a` / `H4a` axis (i)). The commit-ordering half that `V9c` depends on is already routed to item (ac).

## Plan Documents

- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Tests, session-double fidelity-contract self-check note (edited)
- `docs/plan_topics/V12a-slash-dispatch.md` — SLSH-2 streaming bullet / Adds (edited)
- `docs/plan_topics/V12a-T-slash-dispatch.md` — SLSH-2 streaming bullet (edited)
- `docs/plan_topics/V9c-conversation-drive.md` — trailing-turn extraction; commit-ordering reliance already routed to item (ac) (read-only)
- `docs/plan_topics/V18c-version-bump-checklist.md` — editorial-review checklist items (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — editorial-review checklist for unpinned host presuppositions, items (a)–(aj) (edited — add the streaming-visibility item)
- `docs/spec_topics/slash-invocation.md` — SLSH-2 user-visible streaming (edited — add a presupposition anchor the new checklist item links to)
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — alternative anchor home next to `#driven-turn-commit-ordering-presupposition` (option-dependent)

## Affected Leaves

**Phases:** Horizontal phases, Vertical slices (V9, V12, V18)

**Leaves (implementation order):**

- H4a — Extension factory shell and end-to-end harness — (modified)
- V9c — Prompt-mode conversation drive and active-set gating — (modified)
- V12a-T — Slash dispatch, overflow, and streaming (tests) — (modified)
- V12a — Slash dispatch, overflow, and streaming — (modified)

## Consequence

**Severity:** correctness

On a future Pi minor bump the contributor has no checklist prompt to re-confirm that Pi still streams assistant tokens into the transcript before `waitForIdle()` resolves. A Pi change that buffered streaming until `agent_end` would silently falsify SLSH-2's user-visible-streaming guarantee with no build-time SDK-surface signal and no editorial-review prompt — the same class of behavioural regression every other contract axis is protected against. The checklist's completeness gate (its MUST-add rule) passes vacuously for this presupposition.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** `07403da2bf2419b8dea952848184dd169b3bbd52` — "pi-loom plan: resolve T20 (Branch A) — H4a double fidelity is an editorial-review presupposition, not a real-host backstop; unpark" (2026-06-10)
**History:** `git log -S` on the H4a session-double fidelity-contract note shows commit `07403da` rewrote it. The prior text (`eeb0014`, `c6a664e`) framed `V18c`'s version-bump runtime-evidence gate as the real-host backstop for the four contract axes. `07403da` replaced that with "audited by editorial review under the Pi version bump procedure … via that checklist's existing presupposition items," naming only the `ctx.waitForIdle()`-settling / turn-liveness and `AgentMessage[]`-ordering axes. That commit touched only `H4a-factory-shell-and-harness.md` and `plan-review-parked.md`; it added no checklist item for the streamed-token-before-`waitForIdle()` axis. `git log` on `version-bump-step2.md` confirms no streaming-visibility item (a)–(aj) was ever present. The defect entered with `07403da`'s reframing of the backstop into an editorial-review presupposition.

## Solution Space

**Shape:** single

### Recommendation

Close the unrouted presupposition and align the leaf that over-claims it is routed:

1. **Spec — add the missing checklist item.** In `version-bump-step2.md`, add a new editorial-review checklist item (next free letter) covering the user-visible streaming ordering: that on a driven prompt-mode turn the candidate `@earendil-works/pi-coding-agent` minor's TUI streams assistant tokens into the user transcript before `ctx.waitForIdle()` resolves (rather than buffering until `agent_end`), so SLSH-2's guarantee holds against real Pi. Use the same SHOULD-level audit + per-item-recording framing as the neighbouring behavioural items, and link it to a presupposition anchor.
2. **Spec — give it an anchor.** Add a consumption-posture / presupposition paragraph with a stable anchor that the new item references — naturally in `slash-invocation.md` SLSH-2 (e.g. `#user-visible-streaming-ordering-presupposition`), or adjacent to the existing `#driven-turn-commit-ordering-presupposition` in `conversation-drive.md`.
3. **Plan — fix H4a's over-claim.** In `H4a`, point axis (i) at the new item rather than vaguely at "existing presupposition items".
4. **Plan — optional consumer cross-reference.** In `V12a` / `V12a-T`, the SLSH-2 streaming bullet may add a cross-reference to the new checklist item.

The `V9c` commit-ordering reliance needs no new routing — it is already covered by item (ac).

## Relationships

- T05 "Real-host verification gap — every end-to-end and release gate runs only against the H4a session double" — decision-overlap (how the broad double-vs-real-Pi fidelity gap is resolved determines whether the streaming-visibility axis is closed by a new checklist item or by a real-host gate; settle a consistent answer).

---

# T07 — H1a omits the `engines.node` field that downstream gates presuppose

**Original heading:** package.json silently omits `engines.node`, presupposed downstream
**Original section:** H1a — scaffold and toolchain
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H1a` authors `package.json` and enumerates its contents explicitly — the four `@earendil-works/pi-*` peers plus `typebox` in `peerDependencies`, `ajv`/`semver`/`chokidar` in `dependencies`, and the `npm test` / `npm run build` scripts — but never names an `engines.node` field. No leaf establishes that field or its value.

Downstream gates presuppose the literal already exists. `V18c`'s version-bump procedure runs an `engines.node` literal-read test that asserts a three-way equality whose operand (i) is the loom `package.json#engines.node` literal (`version-bump-step2b.md` step 3). The orientation rule in `overview-and-orientation.md` §"Node version floor" likewise requires a build-time `package.json` `engines.node` literal-read test equal to `@earendil-works/pi-coding-agent`'s floor. The pinned floor value (`>=22.19.0`) is owned by the capability-probe spec (`capability-probe.md` §(a); `host-prerequisites.md`).

Because no leaf is named as the initial-population owner, an implementer following `H1a` produces a `package.json` with no `engines.node`, and the downstream literal-read gate has no operand (i) to read against. Either the field is invented ad hoc with an unowned value, or the `V18c` equality gate cannot evaluate.

## Plan Documents

- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — Adds (edited)
- `docs/plan_topics/V18c-version-bump-checklist.md` — Tests/Ships-when `engines.node` literal-read gate (read-only)
- `docs/plan_topics/V18a-capability-inventory.md` — `SDK_SURFACE_INVENTORY` `pi-engines-node` row (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/capability-probe.md` — §(a) Node floor (`>=22.19.0`); value source (read-only)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — host-prerequisites item 1 (read-only)
- `docs/spec/overview-and-orientation.md` — §"Node version floor"; build-time literal-read test (read-only)

## Affected Leaves

**Phases:** Horizontal, Vertical slice V18

**Leaves (implementation order):**

- H1a — Project scaffold and toolchain — (modified)
- V18c — Pi version-bump procedure and gates — (blocked)

## Consequence

**Severity:** correctness

Two reasonable implementers of `H1a` diverge: one omits `engines.node` entirely (matching the current leaf text), another invents the field with a guessed value and location. The first case leaves `V18c`'s `engines.node` three-way equality gate and the orientation-mandated build-time literal-read test with no operand to read; the second risks a value that does not match the pinned floor owned by the capability-probe spec.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e ("pi-loom plan: build/update plan for spec.md + review", 2026-06-10)
**History:** `docs/plan_topics/H1a-scaffold-and-toolchain.md` was first added in c6a664e and has never contained an `engines.node` reference. The downstream presupposers `V18c-version-bump-checklist.md` and `V18a-capability-inventory.md` were added in the same commit. The omission and the presupposition that depends on it entered together at the leaf-authoring commit; the only later H1a edit (83c25b9) addressed the typebox-range obligation and did not touch `engines.node`.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/H1a-scaffold-and-toolchain.md`, extend the `Adds.` enumeration of `package.json` contents so it establishes the `engines.node` field as part of the scaffold, naming `H1a` as the field's initial-population owner. Source the value from the pinned Node floor owned by the capability-probe spec — `capability-probe.md` §(a) / `host-prerequisites.md` (`>=22.19.0`) — rather than restating a literal in the plan. The added Adds text should make explicit that this is the `package.json#engines.node` literal consumed by the build-time literal-read test (`overview-and-orientation.md` §"Node version floor") and by `V18c`'s three-way `engines.node` equality gate (operand (i), `version-bump-step2b.md` step 3), so the downstream gates have a declared source. The fix is plan-side only; no spec edit is required, and `V18c`/`V18a` are not edited (they already consume the literal).

## Relationships

None

---

# T08 — Diagnostic-behaviour Tests bullets omit the registry code in V6a / V6b / V5d

**Original heading:** Tests bullets name a diagnostic behaviour without naming the code (V6a, also V6b, V5d)
**Original section:** V6a — frontmatter contract
**Kind:** implementability, validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

Several **Tests** bullets in the frontmatter and schema-subset leaves describe a diagnostic firing without citing the specific `loom/...` registry code that fires. The `conventions.md` *Diagnostic message anchors* rule makes the diagnostics registry the single source of truth for every author-visible message and requires a code anchor; the *Leaf format* convention treats a cited `loom/...` diagnostic-registry code as a binding obligation. Sibling bullets in these same leaves already cite codes inline (`loom/parse/timeout-field-rejected` in V6a, `loom/load/schema-slug-collision` in V5d), so the un-coded bullets are inconsistent with the leaf's own established practice.

The offending bullets are:

- **V6a** — "A missing `mode:` fires *its load-phase code*; a valid `mode:` resolves." and "An unknown frontmatter key *emits a warning* and is tolerated." Neither names a code.
- **V6b** — "A non-defaulted param after a defaulted one fires *its parse code*." (un-coded); a second bullet cites the bare token `default-not-literal` rather than the fully-qualified `loom/parse/default-not-literal`.
- **V5d** — "The reject gate fires *the subset-violation codes* for each rejected keyword and accepts the permitted subset." names no code.

The implementer must reverse-engineer which registry entry each bullet means. The registry does contain the intended codes, so a wrong guess produces a test that asserts a code the registry does not key — exactly the mismatch the closing gate treats as a CI failure (an asserted code not in the registry, or a registry code with no asserting test).

## Plan Documents

- `docs/plan_topics/V6a-frontmatter-contract.md` — Tests (edited)
- `docs/plan_topics/V6a-T-frontmatter-contract.md` — Tests (edited)
- `docs/plan_topics/V6b-params-defaults.md` — Tests (edited)
- `docs/plan_topics/V6b-T-params-defaults.md` — Tests (edited)
- `docs/plan_topics/V5d-subset-lowering.md` — Tests (edited)
- `docs/plan_topics/V5d-T-subset-lowering.md` — Tests (edited)
- `docs/plan_topics/conventions.md` — Diagnostic message anchors / Leaf format (read-only)

## Spec Documents

- `docs/spec_topics/diagnostics/code-registry-load.md` — load-phase registry (read-only; source of the literal codes)
- `docs/spec_topics/diagnostics/code-registry-parse.md` — parse-phase registry (read-only; source of the literal codes)

## Affected Leaves

**Phases:** V5 (Schemas, descriptions, schema-subset), V6 (Frontmatter)

**Leaves (implementation order):**

- V5d-T — Schema-subset gate, lowering, and canonical hash (tests) — (modified)
- V5d — Schema-subset gate, lowering, and canonical hash — (modified)
- V6a-T — Frontmatter field contract (tests) — (modified)
- V6a — Frontmatter field contract — (modified)
- V6b-T — `params` and defaults (tests) — (modified)
- V6b — `params` and defaults — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will pick different codes for the same bullet, or assert against a code string that does not match the registry entry — silently weakening the message-anchor contract. A wrong-code assertion either fails the closing gate (asserted code absent from registry) or leaves the intended registry code with no asserting test, so the gate can fire on a mismatch or pass while the wrong behaviour is verified.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The V6a, V6b, and V5d leaf files (and their `-T` partners) were all created in commit c6a664e, and the un-coded Tests bullets ("its load-phase code", "emits a warning", "fires its parse code", "the subset-violation codes") were present verbatim in that first commit. The later commits 450ec77 (V6b) and ba7da00 (V5d) resolved unrelated findings and never named the missing codes.

## Solution Space

**Shape:** single

### Recommendation

In each cited **Tests** bullet, replace the indirect phrasing with the fully-qualified registry code, sourcing the literal string from the diagnostics registry. Apply the same edit to each implementation leaf and its paired `-T` tests task:

- **V6a / V6a-T** bullet 1 — name `loom/load/missing-mode` for the missing-`mode:` case.
- **V6a / V6a-T** bullet 2 — name `loom/load/unknown-frontmatter-field` for the tolerated-unknown-key warning (registry severity `W`).
- **V6b / V6b-T** bullet 1 — name `loom/parse/non-trailing-default` for the non-defaulted-after-defaulted case.
- **V6b / V6b-T** bullet 2 — qualify the existing bare `default-not-literal` to `loom/parse/default-not-literal`.
- **V5d / V5d-T** reject-gate bullet — enumerate the subset-rejection codes inline rather than "the subset-violation codes"; the confirmed registry entries are `loom/parse/unsupported-feature` (rejected JSON-Schema keywords) and `loom/parse/result-in-schema-position` (`Result` in a schema-feeding position). Source any additional rejected-keyword codes from `code-registry-parse.md`.

The registry remains read-only; cite the codes exactly as they appear there and do not add or rename registry entries.

## Relationships

- T27 "V9b asserts `loom/host/loom-registry-read-failed`, a diagnostic the spec defers out of loom 1.0 and never registers" — same-cluster (same diagnostic-code-citation discipline; that finding cites a non-existent code, this one under-cites — resolve independently).

---

# T09 — ERR-19 firing-at-the-cap assertion is out of scope for V4d's dependency closure

**Original heading:** ERR-19 asserts firing-at-the-cap, which requires the tool-loop machinery (V13c) absent from scope
**Original section:** V4d — QueryError variants
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V4d` owns the `QueryError` variant **schema** — its Spec set is `queryerror-variants.md` + `error-model.md` and its Deps are `V4d-T, V5d`. The ERR-19 Tests bullet ("`ToolLoopExhaustedError` fires when the per-query tool-call round cap is reached with no terminating turn") and the matching Ships-when clause ("`ERR-19` at the cap") assert a *runtime firing* behaviour, not a schema shape. Firing-at-the-cap is produced by the per-query tool-call loop built by `V13c` — whose own Tests already assert "an untyped exhaustion produces `ToolLoopExhaustedError`." `V13c` is far outside `V4d`'s dependency closure (`V4d` Deps `V4d-T, V5d` never reach `V13c`), and `V4d` is DAG-eligible long before the loop machinery exists.

The coverage matrix already encodes the intended split: `ERR-19 → V4d, V13c`. The spec is consistent with a shape/firing split — `queryerror-variants.md#err-19` defines the `ToolLoopExhaustedError` schema (including the `rounds: number // == tool_loop.max_rounds on exhaustion` field constraint), while the *when-it-fires* prose cross-links to Query. The defect is purely that `V4d`'s Tests/Ships-when over-reach into the firing behaviour the matrix assigns to `V13c`.

With no loop available at `V4d` build time, an implementer cannot author the ERR-19 firing test honestly red/green and is pushed to invent a stand-in tool-loop to drive the cap condition — divergent, throwaway machinery no production path uses, and forbidden by the per-phase TDD ritual.

## Plan Documents

- `docs/plan_topics/V4d-queryerror-variants.md` — V4d leaf, ERR-19 Tests bullet + Ships-when (edited)
- `docs/plan_topics/V4d-T-queryerror-variants.md` — V4d-T leaf, ERR-19 Tests bullet (edited)
- `docs/plan_topics/V13c-query-tool-loop.md` — V13c leaf, exhaustion Tests bullet (read-only)
- `docs/plan_topics/coverage-matrix.md` — ERR-19 row (read-only; already maps `V4d, V13c`)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slice V4 (Errors and results)

**Leaves (implementation order):**

- V4d-T — `QueryError` variant schema (tests) — (modified)
- V4d — `QueryError` variant schema — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one fabricates a stand-in tool-loop at `V4d` to satisfy the firing assertion (throwaway code with no production consumer), the other leaves the assertion unsatisfiable and ships a red/skipped test. ERR-19's genuine firing closure already lives in `V13c`; `V4d`'s over-reach forces wasted or unsound work for no added coverage.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e (`pi-loom plan: build/update plan for spec.md + review`)
**History:** `docs/plan_topics/V4d-queryerror-variants.md` was added to the corpus in c6a664e — the only commit touching the file per `git log --follow`. The ERR-19 Tests bullet has carried the "fires when the per-query tool-call round cap is reached" firing phrasing since that introducing commit; no prior revision scoped ERR-19 to the variant shape. The defect is present since the leaf's inception.

## Solution Space

**Shape:** single

### Recommendation

Scope `V4d`'s ERR-19 to the **variant shape** and leave the firing assertion to `V13c` (which already closes it):

- In `docs/plan_topics/V4d-queryerror-variants.md`, rewrite the ERR-19 Tests bullet so it asserts the `ToolLoopExhaustedError` schema only — the `kind: "tool_loop_exhausted"` discriminator, the `rounds: number` field with the `rounds == tool_loop.max_rounds` value constraint, the `last_tool_name: string | null` and `raw_response: string | null` fields — and drop the "fires when the per-query tool-call round cap is reached" firing clause. Suggested replacement: `` `ERR-19`: the `ToolLoopExhaustedError` shape (`kind: "tool_loop_exhausted"`, `rounds` with `rounds == tool_loop.max_rounds`, `last_tool_name`, `raw_response`); the at-the-cap firing path is asserted by V13c. ``
- In the same file, change the Ships-when clause from "and `ERR-19` at the cap" to assert the `ToolLoopExhaustedError` variant shape (drop "at the cap").
- Mirror the Tests-bullet edit in `docs/plan_topics/V4d-T-queryerror-variants.md`.
- Leave `V13c-query-tool-loop.md` and the `coverage-matrix.md` ERR-19 row (`V4d, V13c`) unchanged.

## Relationships

- T10 "V4d's ERR-17 test asserts respond-repair consumption it cannot observe" — same-cluster (identical shape-vs-behaviour split defect in the same `V4d` leaf; resolved by the same scope-down-and-relocate technique, independently).

---

# T10 — V4d's ERR-17 test asserts respond-repair consumption it cannot observe

**Original heading:** ERR-17 asserts injection into the respond-repair pipeline (V13d/V6e) absent from scope
**Original section:** V4d — QueryError variants
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V4d`'s ERR-17 Tests bullet (and its paired `V4d-T`) asserts that forced-respond non-compliance "injects one synthesised `ValidationIssue` (path `""`, keyword `"required"`, branch-specific message) **into respond-repair**." The respond-repair loop is owned by `V13d` (configured by the `V6e` frontmatter fields), but `V4d`'s Spec set is `queryerror-variants.md` + `error-model.md` and its Deps are `V4d-T, V5d` — neither reaches `V13d`. `V4d` can construct the synthesised-issue *shape*, but it has no in-scope seam through which to observe that issue being *consumed* by the repair loop.

In DAG order `V4d` is eligible long before `V13d` exists. An implementer authoring the ERR-17 test red against `V4d` alone must either fabricate a stand-in respond-repair consumer to witness the injection — diverging from `V13d`'s actual loop — or cannot author the consumption half red at all. The coverage matrix compounds the gap: ERR-17 maps to `V4d` only, so the genuine consumption assertion has no gated home, while the matrix's ERR-19 row (`V4d, V13c`) already models the correct shape/firing split for the sibling defect.

## Plan Documents

- `docs/plan_topics/V4d-queryerror-variants.md` — ERR-17 Tests bullet, Ships when (edited)
- `docs/plan_topics/V4d-T-queryerror-variants.md` — ERR-17 Tests bullet (edited)
- `docs/plan_topics/V13d-query-failure-repair.md` — Tests (edited)
- `docs/plan_topics/V13d-T-query-failure-repair.md` — Tests (edited)
- `docs/plan_topics/coverage-matrix.md` — ERR-17 row (edited)
- `docs/plan_topics/V6e-respond-repair-tool-loop.md` — respond_repair / tool_loop frontmatter context (read-only)
- `docs/plan.md` — slice listing (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices

**Leaves (implementation order):**

- `V4d` — `QueryError` variant schema — (modified)
- `V4d-T` — `QueryError` variant schema (tests) — (modified)
- `V13d` — Query failure and respond-repair — (modified)
- `V13d-T` — Query failure and respond-repair (tests) — (modified)

## Consequence

**Severity:** correctness

`V4d`'s dependency closure (`V4d-T`, `V5d`) does not reach the respond-repair pipeline (`V13d`, built later), so an implementer driving the ERR-17 test red against `V4d` must fabricate a stand-in repair consumer to observe injection — diverging from `V13d`'s real loop — or cannot author the consumption assertion red at all. The genuine "feeds respond-repair" assertion currently has no leaf that can both depend on the repair loop and gate it.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `docs/plan_topics/V4d-queryerror-variants.md` was added in c6a664e, and the ERR-17 Tests bullet with the "into respond-repair" consumption clause is present verbatim in that first and only commit touching the file. The defect entered with the leaf's creation.

## Solution Space

**Shape:** single

### Recommendation

Re-scope ERR-17 so the synthesised-issue *shape* is asserted by `V4d` and the *consumption* by `V13d`:

- In `V4d` and the paired `V4d-T`, rewrite the ERR-17 Tests bullet to assert only the synthesised-issue shape — forced-respond non-compliance produces one `ValidationIssue` with `path: ""`, `schema_keyword: "required"`, and the branch-specific (two-arm) message — and strike the trailing "into respond-repair" consumption clause. The `V4d` Adds entry "the forced-respond non-compliance synthesised issue" already scopes the shape correctly and stays.
- In `V13d` and the paired `V13d-T`, add a Tests assertion that forced-respond non-compliance injects that synthesised `ValidationIssue` into the respond-repair loop, cited as ERR-17. `V13d` already lists `V4d` in Deps and owns "the forced-respond non-compliance handling".
- In `coverage-matrix.md`, change the ERR-17 row from `V4d` to `V4d, V13d`, mirroring the ERR-19 → `V4d, V13c` row.

Edge case: the NOCEIL-2 closure note in `coverage-matrix.md` references "ERR-14/15/17" against `V4d`; keep that reference intact — `V4d` still closes the ERR-17 shape.

## Relationships

- T09 "ERR-19 firing-at-the-cap assertion is out of scope for V4d's dependency closure" — same-cluster (identical shape-vs-behaviour split defect in the same `V4d` leaf; resolved by the same technique, independently).

---

# T11 — `SHUTDOWN_AWAIT_CAP_MS` has no declaring owner leaf

**Original heading:** `SHUTDOWN_AWAIT_CAP_MS` referenced by two leaves with no declaring owner
**Original section:** V9g / V9i — shutdown await cap
**Kind:** ordering
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The runtime constant `SHUTDOWN_AWAIT_CAP_MS` (`= 2000`, per `patch-skew-degradation.md`) is referenced by two independent leaves but is declared by neither:

- `V9g` (session-shutdown teardown) names it in **Adds** — the `session_shutdown` handler's bounded "abort-and-await within `SHUTDOWN_AWAIT_CAP_MS`" — and in **Ships when** (the await cap).
- `V9i` (subagent isolation) names it in a `PIC-9` **Tests** bullet — "`SHUTDOWN_AWAIT_CAP_MS` covers disposal".

`V9g` Deps are `V9g-T, V9e, V9h, V17a`; `V9i` Deps are `V9i-T, V9a, V17a, V11a`. Neither leaf depends on the other, and no leaf in the plan is declared the constant's source. Because the two leaves are unordered with respect to each other in the dependency DAG, whichever is built second references a symbol the build has not yet established, and two implementers working the leaves independently will each define a private copy that can later drift.

## Plan Documents

- `docs/plan_topics/V9g-session-shutdown.md` — Adds / Ships when (edited)
- `docs/plan_topics/V9i-subagent-isolation.md` — PIC-9 Tests bullet (edited)
- `docs/plan_topics/V17a-cancellation-core.md` — Adds / Deps (edited)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/patch-skew-degradation.md` — defines `SHUTDOWN_AWAIT_CAP_MS = 2000` (read-only)

## Affected Leaves

**Phases:** Vertical slices (V9, V17)

**Leaves (implementation order):**

- V9g — Session-shutdown teardown and emission isolation — (modified)
- V9i — Subagent-mode session isolation and lifecycle — (modified)
- V17a — Cancellation core — (modified: owner)

## Consequence

**Severity:** correctness

In dependency order the second-built of `V9g` / `V9i` references a constant no completed leaf has introduced, so two reasonable implementers each declare a private `SHUTDOWN_AWAIT_CAP_MS`; the duplicated literal can drift (the cap is also cross-referenced from the `loom/runtime/reload-teardown-timeout` and `cancelled-by-session-shutdown` diagnostic contracts, which assume one value). The teardown timeout window then differs between the prompt-mode and subagent-mode disposal paths.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** Both `V9g-session-shutdown.md` and `V9i-subagent-isolation.md` were first added in commit c6a664e, and a `git log -S 'SHUTDOWN_AWAIT_CAP_MS' -- docs/plan_topics/` pickaxe finds that same commit as the only one to introduce the token in the plan corpus. The two unowned references were present together from the leaves' first commit.

## Solution Space

**Shape:** single

### Recommendation

Declare `SHUTDOWN_AWAIT_CAP_MS = 2000` (value sourced from `patch-skew-degradation.md`) as a loom-owned cancellation-runtime constant in `V17a`'s Adds — the shared ancestor both `V9g` and `V9i` already list directly in their Deps — and make no Deps changes. Both references then resolve immediately with no new DAG edge. The alternative of declaring it on the `session_shutdown` handler owner (`V9g`) and adding `V9g` to `V9i`'s Deps would pull `V9i` behind `V9g`'s `V18c`-tethered dependency chain, needlessly delaying an otherwise-early leaf. Watch that the single declared value stays consistent with the `2000`ms figure the `loom/runtime/reload-teardown-timeout` and `cancelled-by-session-shutdown` diagnostic contracts cite.

## Relationships

- T12 "CNCL-4 session-shutdown reason facet is asserted in V9g but never authored red in V9g-T or gated by Ships-when" — same-cluster (also touches V9g; resolves independently).
- T13 "Cancel-forwarding couples V9c to the `loomAbort` controller (V17a) without a declared dependency" — same-cluster (sibling undeclared-dependency / shared-artefact-ownership defect against V17a; resolves independently).

---

# T12 — CNCL-4 session-shutdown reason facet is asserted in V9g but never authored red in V9g-T or gated by Ships-when

**Original heading:** CNCL-4 session-shutdown synthesised-reason facet listed in V9g but not authored by V9g-T or pinned by any gate
**Original section:** V9g — session-shutdown teardown
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V9g` carries a `CNCL-4` Tests bullet asserting that the `session_shutdown` handler aborts each in-flight `loomAbort` with a synthesised `Error` whose `message` is byte-exact `"loom cancelled by session shutdown"`, observed as `loomAbort.signal.reason` at a downstream checkpoint. The paired tests leaf `V9g-T` does **not** carry this bullet — its Tests list stops at `PIC-7`, the `DIAG-1` host rows, and the `loom/runtime/*` shutdown codes — and `V9g-T`'s `Spec.` set omits `cancellation.md`, the page that anchors `CNCL-4`.

Per the per-phase TDD ritual, the `<id>-T` tests task must author a failing test for *every* spec REQ-ID the feature introduces, and the implementation leaf's binding obligations are its Tests bullets plus its `Ships when` gate. Here the facet exists only as prose in the impl leaf: no red test forces it in `V9g-T`, and `V9g`'s `Ships when` clause names only per-step isolation, the await cap, and the wrapped host emissions — not the reason facet.

There is no alternative home. `V17a-T` asserts the sibling `CNCL-4` reason-propagation facets but explicitly defers the session-shutdown variant: "(The `"loom cancelled by session shutdown"` synthesised-reason facet is asserted in `V9g`, whose handler produces it.)" So the one assertion the corpus delegates to `V9g` is neither authored red in any tests task nor pinned by any Ships-when gate.

## Plan Documents

- `docs/plan_topics/V9g-T-session-shutdown.md` — Tests, Spec (edited)
- `docs/plan_topics/V9g-session-shutdown.md` — Ships when (edited)
- `docs/plan_topics/V17a-T-cancellation-core.md` — CNCL-4 deferral note (read-only)
- `docs/plan_topics/coverage-matrix.md` — CNCL-4 row (read-only)
- `docs/plan_topics/conventions.md` — TDD ritual / Leaf format (read-only)

## Spec Documents

- `docs/spec_topics/cancellation.md` — `#cncl-4` anchor (read-only)

## Affected Leaves

**Phases:** V9 — Extension host integration (vertical slice)

**Leaves (implementation order):**

- V9g-T — Session-shutdown teardown and emission isolation (tests) — (modified)
- V9g — Session-shutdown teardown and emission isolation — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one authors the byte-exact session-shutdown reason facet, the other omits it because no red test in `V9g-T` forces it and `V9g`'s Ships-when does not require it. Because `CNCL-4` is a numbered REQ-ID (not a `loom/*` diagnostic code), the closing gate only checks that a coverage-matrix row exists, so the facet can ship unimplemented or with a wrong reason string while CI stays green.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 4dde482 — pi-loom plan-review: park T27 (fast-loop: finding not resolved by fast fix) (2026-06-10, Thomas Andersen)
**History:** `git log -S "loom cancelled by session shutdown" -- docs/plan_topics/` localises the facet's sole introduction to 4dde482; it did not exist beforehand. That commit added the `CNCL-4` session-shutdown facet to `V9g`'s Tests block and `cancellation.md` to `V9g`'s `Spec.` set, and added `CNCL-4/5/6` to `V17a-T` deferring the session-shutdown variant to `V9g`, but did not touch `V9g-T` — so the facet's failing test was never authored in the paired tests leaf and `cancellation.md` is still absent from `V9g-T`'s `Spec.` set.

## Solution Space

**Shape:** single

### Recommendation

Close the `V9g`/`V9g-T` pairing for this facet:

- In `docs/plan_topics/V9g-T-session-shutdown.md`, add a `CNCL-4` session-shutdown facet bullet to the `Tests.` list that mirrors `V9g`'s assertion: the `session_shutdown` handler aborts each in-flight `loomAbort` with a synthesised `Error` whose `message` is byte-exact `"loom cancelled by session shutdown"`, asserted as the observed `loomAbort.signal.reason` at a downstream checkpoint — authored as a failing (red) test. Add `../spec_topics/cancellation.md` to `V9g-T`'s `Spec.` set.
- In `docs/plan_topics/V9g-session-shutdown.md`, extend the `Ships when.` clause so the `CNCL-4` session-shutdown reason facet is among the observable ship conditions, alongside the existing per-step isolation, await cap, and wrapped host emissions.

Edge case: the reason literal must be the exact `"loom cancelled by session shutdown"` — distinct from `V17a-T`'s `"loom cancelled by agent_end"`; both leaves must use the identical byte-exact string so the red `V9g-T` test pins what `V9g` ships.

## Relationships

- T11 "`SHUTDOWN_AWAIT_CAP_MS` has no declaring owner leaf" — same-cluster (also touches V9g; resolves independently).
- T17 "V17a's `Ships when` gate observes only a subset of the cancellation obligations its Tests enumerate" — same-cluster (CNCL-4 is split between V17a and V9g; both are gating gaps in the same cancellation contract).
- T03 "Closing gate checks numbered-REQ-ID matrix mapping exists, but not that any test asserts the REQ-ID" — same-cluster (concrete instance of the mapped-but-unasserted REQ-ID class; T03's gate-extension would catch it mechanically, but it still needs its own authored test).

---

# T13 — Cancel-forwarding couples V9c to the `loomAbort` controller (V17a) without a declared dependency

**Original heading:** Cancel-forwarding couples to `loomAbort` (V17a) without declaring the dependency
**Original section:** V9c — prompt-mode conversation drive and active-set gating
**Kind:** ordering
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

V9c's prompt-mode `pi.on` subscription exists for one purpose only — cancel-forwarding. Its `Adds.` field names the subscription "(cancel-forward only)" and its `PIC-18` Tests bullet asserts the subscription "is used only for cancel-forwarding, never for completion." The target of that forwarding is the `loomAbort` controller, which is created and owned by V17a (`V17a` `Adds.`: "The `loomAbort` controller … forwarding Pi's per-handler `ctx.signal`, the tool-exposed `signal`, and parent-`invoke` signals into `loomAbort`").

V9c's declared `Deps.` are `V9c-T, V9a, V9j, V8a`. The transitive closure of those leaves never reaches V17a. The dependency DAG therefore lets V9c be picked up before V17a exists, at which point the cancel-forwarding target the subscription wires into is undefined.

Under the `conventions.md` *Leaf format* rule, a cross-leaf seam binds only when a consumer lists the seam-owning leaf in its `Deps.` and names the seam in its own `Adds.`/`Tests.`. As written, V9c neither lists V17a nor names `loomAbort`, so the cancel-forward coupling is currently illustrative rather than a binding consumer→producer edge — yet V9c's behaviour materially depends on it.

## Plan Documents

- `docs/plan_topics/V9c-conversation-drive.md` — `Deps.` / `Adds.` (edited)
- `docs/plan_topics/V17a-cancellation-core.md` — `Adds.` (read-only)
- `docs/plan_topics/conventions.md` — *Leaf format* (consumer-bound seam rule) (read-only)
- `docs/plan.md` — V9 Interleave note / Deps DAG (read-only)
- `docs/plan_topics/coverage-matrix.md` — PIC-17 / PIC-18 row (read-only)

## Spec Documents

None — `loomAbort`, the forwarding contract, and the signal-source rules are already specified in `cancellation.md`; the fix is a plan-internal dependency-declaration correction.

## Affected Leaves

**Phases:** Vertical slices (V9, V17)

**Leaves (implementation order):**

- `V9c` — Prompt-mode conversation drive and active-set gating — (modified)
- `V17a` — Cancellation core — (read-only)

## Consequence

**Severity:** correctness

In DAG order V9c is eligible before V17a, so an implementer building V9c first has no defined `loomAbort` target to forward into and would either invent a stand-in controller or guess the seam owner. Two reasonable implementers diverge on where the cancel-forwarding wiring lives. The mitigant is that PIC-18's shape assertions can run against an injected forwarder seam, so the gate need not break — but the ordering edge is still absent and the coupling is non-binding under the *Leaf format* seam rule.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** `c6a664e` — "pi-loom plan: build/update plan for spec.md + review" (2026-06-10)
**History:** `V9c-conversation-drive.md` and `V17a-cancellation-core.md` were both created in `c6a664e`. The cancel-forwarding subscription and V9c's `Deps.` line `V9c-T, V9a, V9j, V8a` have been present verbatim since that commit; `loomAbort` has been owned by V17a since the same commit. The only later edit to V9c, `2ce483b`, touched the `Spec.` line and added the PIC-2 bullet, leaving the `Deps.` closure unchanged. The missing V9c→V17a edge dates to plan inception.

## Solution Space

**Shape:** single

### Recommendation

Declare the dependency: treat `loomAbort` as a Class-2 consumer-bound seam owned by V17a and consumed by V9c. In `docs/plan_topics/V9c-conversation-drive.md`, add `V17a` to the `Deps.` line (`V9c-T, V9a, V9j, V8a, V17a`) and name the `loomAbort` seam in the `Adds.` cancel-forward clause and/or the PIC-18 Tests bullet so the consumer→producer edge is binding (e.g. the PIC-18 subscription forwards Pi's `ctx.signal` into the `loomAbort` controller owned by V17a). This is the minimal diff, aligns with the *Leaf format* consumer-bound-seam rule, and introduces no DAG cycle (V17a's `Deps.` are `V17a-T, V8a`; no path back to V9c). It pushes V9c later in build order, behind cancellation-core, which is correct. Edge case: confirm V17a's CNCL-4 forwarding test continues to exercise the slash-command path at the `Checkpoint`-seam substrate rather than against V9c's concrete subscription.

## Relationships

- T17 "V17a's `Ships when` gate observes only a subset of the cancellation obligations its Tests enumerate" — decision-dependency (a V17a split changes which sub-leaf owns `loomAbort` / the forwarding target V9c must depend on).
- T11 "`SHUTDOWN_AWAIT_CAP_MS` has no declaring owner leaf" — same-cluster (sibling undeclared shared-artefact ownership across the DAG; resolves independently).

---

# T14 — V15b counts `.warp fn` frames introduced by V15c but declares no dependency on it

**Original heading:** V15b owns `.warp fn` frame-depth counting but does not depend on V15c
**Original section:** V15b — invoke depth bound and cycle detection
**Kind:** ordering
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V15b`'s **Adds** field commits it to counting "direct `invoke`, `.loom`-via-`tools:`, and cross-file `.warp fn` frames" toward the hard-ceiling #1 invoke-depth bound (INV-4, cap 32). The cross-file `.warp fn` frame class only exists once the `.warp` import/library system is built — and that system is introduced by `V15c` (Imports). Yet `V15b`'s **Deps** are `V15b-T`, `V15a`, `V16a`, and `V15c`'s **Deps** are `V15c-T`, `V1a`, `V15a`. Neither leaf declares an ordering relationship with the other; the dep DAG permits `V15b` to be picked up and shipped before `V15c` exists.

If `V15b` lands first, the implementer is asked to wire a `.warp fn` frame hook into the depth counter against a `.warp fn` call mechanism that has not been built. The counter's `.warp fn` arm is therefore either stubbed or omitted. The leaf still ships green: `V15b`'s binding INV-4 test ("incremented before the child, crossing the subagent boundary, siblings independent", fires at 33 > 32) is fully satisfiable with direct-`invoke` frames alone, so the missing `.warp fn` frame class is never exercised.

The spec is internally consistent and not at fault: `invocation.md` §INV-4 correctly defines a cross-file `.warp fn` call as a countable frame. The defect is purely in the plan's leaf factoring and dependency declarations.

## Plan Documents

- `docs/plan_topics/V15b-invoke-depth-cycle.md` — V15b leaf (Adds, Tests, Deps) (edited)
- `docs/plan_topics/V15b-T-invoke-depth-cycle.md` — V15b-T leaf (Tests, Deps) (edited)
- `docs/plan_topics/V15c-imports.md` — V15c leaf (Adds, Deps) (read-only)
- `docs/plan_topics/V15c-T-imports.md` — V15c-T leaf (Tests) (read-only)
- `docs/plan_topics/coverage-matrix.md` — INV-4 / NOCEIL-4 rows (read-only)
- `docs/plan.md` — §V15 (Invocation and imports) (read-only)

## Spec Documents

- `docs/spec_topics/invocation.md` — §INV-4 and the countable-frame paragraph (read-only)
- `docs/spec_topics/imports.md` — `.warp` library / `fn` rules (read-only)

## Affected Leaves

**Phases:** Vertical slice V15 — Invocation and imports

**Leaves (implementation order):**

- `V15b-T` — Invoke depth bound and cycle detection (tests) — (modified)
- `V15b` — Invoke depth bound and cycle detection — (modified)
- `V15c-T` — Imports (tests) — (modified)
- `V15c` — Imports (`.warp` library files) — (both)

## Consequence

**Severity:** correctness

An implementer who picks up `V15b` before `V15c` wires the depth counter against a `.warp fn` call mechanism that does not yet exist, so the counter's cross-file `.warp fn` arm is stubbed or dropped. `V15b` still ships green because its INV-4 test is satisfiable with direct-`invoke` frames alone, so hard ceiling #1 (INV-4 / NOCEIL-4) silently ships with the `.warp fn` frame class uncounted and unverified — a runaway cross-file `.warp fn` recursion would not be capped at 32.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** Both `V15b-invoke-depth-cycle.md` and `V15c-imports.md` were created in the single commit c6a664e. The `.warp fn` clause in V15b's Adds and the V15c-omitting Deps list were both present in that first commit, so the ordering gap is present at inception.

## Solution Space

**Shape:** single

### Recommendation

Make `V15b` depend on `V15c` and keep the counter whole: `V15b` retains ownership of the entire INV-4 counter including the `.warp fn` arm, and declares a dependency on `V15c` so the `.warp fn` call mechanism exists when the counter is built and tested.

- In `V15b-invoke-depth-cycle.md` **Deps**, add `V15c`.
- In `V15b-T-invoke-depth-cycle.md` **Deps**, add `V15c` (the tests leaf needs the `.warp fn` mechanism to author the cross-file chain test).
- In the `INV-4` **Tests** bullet of both `V15b` and `V15b-T`, extend the test to exercise a cross-file `.warp fn` chain reaching the 32-frame boundary so the `.warp fn` frame class is actually verified.

This keeps INV-4 / NOCEIL-4 closure in one leaf (no coverage-matrix surgery) and is the smaller, self-contained change; the plan already sanctions backward cross-slice dependencies. Edge case: the new INV-4 cross-file test must place caller and callee in *different* source files — an intra-file `fn` call is not a countable frame per `invocation.md` §INV-4.

## Relationships

- T04 "NOCEIL-2 and NOCEIL-4 closing leaves carry no trace annotation their siblings (NOCEIL-1/NOCEIL-3) have" — same-cluster (both concern INV-4 / NOCEIL-4 closure being fully observable in V15b; neither edit depends on the other).

---

# T15 — CIO-5 cross-ceiling arbitration verified only in isolation — no live-site integration assertion

**Original heading:** CIO-5 cross-ceiling arbitration asserted only against synthesised events; no live-site integration assertion
**Original section:** V16a — cross-ceiling order and `masked`
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V16a` is the sole closing leaf for the cross-ceiling evaluation order (`coverage-matrix.md` maps `CIO-1 … CIO-6 → V16a`). Every CIO bullet — including `CIO-5` ("ceiling #3 never interleaves with #1/#2/#4") and `CIO-6` (at-most-one-ceiling-per-event with `masked` co-fire) — is exercised exclusively by "driving synthesised ceiling-candidate events through the unit that computes the cross-ceiling order in isolation." `V16a` Adds states explicitly that these tests do **not** run against the live `invoke`-entry / AJV-boundary / round-boundary sites, which are built by downstream leaves (`V5e`, `V11f`, `V13c`, `V15b`) that do not exist when `V16a` is picked up.

The downstream live-site leaves each enforce their own ceiling and list `V16a` in Deps, but none asserts that the live pipeline actually consults the cross-ceiling order in the documented sequence. The only live co-fire assertion anywhere is `V13c`'s depth-6 vector setting `masked:["ceiling#2"]` (a runtime-class #4-over-#2 co-fire). The `CIO-5` property specifically — ceiling #3 (binder retry, `V11f`) not interleaving with the runtime-class ceilings #1/#2/#4 — is never exercised end-to-end at a live site by any leaf.

Consequently the isolated `V16a` tests can stay green while the live wiring diverges: a downstream site could independently re-derive (or mis-order) the ceiling arbitration without contradicting `V16a`'s synthesised-event suite, and the `H5a` closing gate — which only checks that `CIO-5` has a citing test — would pass vacuously with respect to live arbitration behaviour.

## Plan Documents

- `docs/plan_topics/V16a-ceiling-order-masked.md` — Adds / Tests / Ships when (read-only)
- `docs/plan_topics/H7a-integration-acceptance.md` — Tests / Deps (edited)
- `docs/plan_topics/V11f-binder-retry-taxonomy.md` — ceiling #3 enforcement site (option-dependent)
- `docs/plan_topics/V13c-query-tool-loop.md` — ceiling #2 enforcement site / existing live co-fire vector (option-dependent)
- `docs/plan_topics/coverage-matrix.md` — `CIO-1 … CIO-6` row (option-dependent)
- `docs/plan.md` — §V16 Hard ceilings (read-only)

## Spec Documents

None — the fix is internal to the plan's test/gate wiring. `hard-ceilings.md` already pins the distributed enforcement model and the fixed `CIO-1 … CIO-6` order.

## Affected Leaves

**Phases:** Vertical slices; Horizontal phases (the integration host `H7a`)

**Leaves (implementation order):**

- `V5e` — JSON document depth enforcement (hard ceiling #4) — (modified)
- `V11f` — Binder cancellation, per-class retry budget, and failure taxonomy (hard ceiling #3) — (modified)
- `V13c` — Query tool loop and typed two-phase (hard ceiling #2) — (modified)
- `V15b` — Invoke depth bound and cycle detection (hard ceiling #1) — (modified)
- `V16a` — Hard-ceiling interaction order and `masked` co-fire — (modified)
- `H7a` — Terminal integration-acceptance run (cross-slice end-to-end gate) — (modified)

## Consequence

**Severity:** correctness

`CIO-5`/`CIO-6` are certified only against a synthesised in-isolation unit; nothing proves the live enforcement sites consult that ordering. Two reasonable implementers — one wiring the live sites to consult `V16a`'s unit, another having each site re-derive its own arbitration — would both pass the green `V16a` suite and the `H5a` gate, yet only one matches the spec's single cross-ceiling order. A live #3-vs-runtime mis-interleave would ship undetected.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The `V16a` leaf was authored in its first commit (c6a664e) carrying the synthesised-ceiling-candidate isolation approach and the `CIO-5`/`CIO-6` bullets, with no live-site integration assertion in any downstream leaf. The only later edit (2565ddd) removed the `NOCEIL-1 … NOCEIL-4` clause from Adds and left the isolation-only testing posture and the live-site gap untouched.

## Solution Space

**Shape:** single

### Recommendation

Add a live-site integration assertion that drives a co-occurring ceiling #3 (binder retry) and a runtime-class ceiling through the real pipeline and asserts exactly one ceiling surfaces in `CIO` order (#3 before the runtime-class ceiling) with `masked` enumerating the suppressed sibling. `H7a` is the home: it already declares `V11f` (ceiling #3) and `V13c` (ceiling #2) in Deps and runs the integrated binder → tool-loop pipeline end-to-end through the `H4a` harness. Add a third `Tests` bullet to `docs/plan_topics/H7a-integration-acceptance.md` along the lines of:

> `Convention:` (phase categories — end-to-end harness) the integrated run drives a binder-retry-class breach (ceiling #3) co-occurring with a runtime-class ceiling (e.g. the `tool_loop.max_rounds` round boundary, ceiling #2) through the live pipeline and asserts exactly one ceiling surfaces in `CIO-5` order (#3 ahead of the runtime-class ceiling, no interleave) with `masked` enumerating the suppressed sibling.

and reflect the new obligation in `H7a`'s `Ships when`. Two notes: the exact assertion text depends on whether the live sites *consult* `V16a`'s arbitration unit or *re-derive* the order (settle the related interface-shape finding first); and `H7a`'s run executes against the `H4a` in-process session double, so this verifies cross-slice composition, not host-level realism.

## Relationships

- T25 "V16a posits an isolated cross-ceiling unit whose interface is undefined and whose authority over the live breach sites is never established" — decision-dependency (settling the arbitration unit's interface and the consult-vs-re-derive relationship fixes the exact shape of this integration assertion).
- T16 "V16a-T CIO-3 asserts ceiling ordering at live AJV boundaries the leaf cannot reach, contradicting its paired impl leaf" — same-cluster (same synthesised-event-vs-live-site gap in the V16a pair; resolves independently).
- T05 "Real-host verification gap — every end-to-end and release gate runs only against the H4a session double" — same-cluster (the recommended H7a host inherits the session-double fidelity bound; independent concern).

---

# T16 — V16a-T CIO-3 asserts ceiling ordering at live AJV boundaries the leaf cannot reach, contradicting its paired impl leaf

**Original heading:** V16a-T CIO-3 echoes "at every AJV boundary (the five sites)" without the impl leaf's synthesised-event disclaimer
**Original section:** V16a — cross-ceiling order and `masked`
**Kind:** overclaim
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V16a` is an isolated cross-ceiling-order unit, picked up before any live breach site exists. Its impl leaf scopes every CIO bullet to synthesised candidate events: the `V16a` Adds paragraph states the bullets are exercised "by driving synthesised ceiling-candidate events through the unit … not against the live `invoke` entry / AJV boundary / round-boundary sites, which are built by downstream leaves (`V5e`, `V11f`, `V13c`, `V15b`) and do not exist when `V16a` is picked up," and the impl CIO-3 bullet accordingly reads "a synthesised candidate tagged as an AJV-boundary event resolves ceiling #4 (JSON depth) as the first sub-check."

The paired `V16a-T` CIO-3 bullet drops that scoping and asserts ceiling #4 "is the first sub-check **at every AJV boundary (the five sites)**." Synthesised candidate events cannot demonstrate behaviour at the five live AJV boundaries — those validation sites are built by downstream leaves that do not exist at `V16a`'s DAG position. The `-T` card is the red-test definition for the `V16a` impl; the two cards describe the same CIO-3 assertion but at different scopes, with only the `-T` side claiming live-site coverage. The asymmetry is confined to CIO-3.

## Plan Documents

- `docs/plan_topics/V16a-T-ceiling-order-masked.md` — CIO-3 Tests bullet (edited)
- `docs/plan_topics/V16a-ceiling-order-masked.md` — Adds paragraph + CIO-3 Tests bullet (read-only; the authoritative synthesised-event framing to mirror)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slice (V16 — Hard ceilings)

**Leaves (implementation order):**

- V16a-T — Hard-ceiling interaction order and `masked` co-fire (tests) — (modified)

## Consequence

**Severity:** correctness

An implementer authoring the `V16a-T` red test reads CIO-3 as an obligation to assert ceiling-#4 ordering at five live AJV boundaries that do not exist when `V16a` is picked up; they either write a test referencing absent live sites (unbuildable at this DAG position) or fall back to the impl leaf's synthesised-event approach, leaving the `-T` card's literal text contradicting the test that actually lands. Two reasonable implementers diverge on what CIO-3's red test must observe.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e
**History:** Both the impl-leaf synthesised-event disclaimer (the `V16a` Adds paragraph) and the `V16a-T` CIO-3 bullet that omits it were authored together in the single plan-build commit `c6a664e`. `git log -L` over the `V16a-T` CIO-3 line and over the `V16a` Adds disclaimer shows each was introduced at `c6a664e` and never subsequently edited; the only later commit touching the pair (`2565ddd`) resolved an unrelated NOCEIL Adds claim.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/V16a-T-ceiling-order-masked.md`, rewrite the CIO-3 Tests bullet so it mirrors the impl leaf's synthesised-event framing instead of claiming live multi-site coverage. Strike the phrase `at every AJV boundary (the five sites)` and replace the bullet body with the impl leaf's wording, e.g.:

`- `CIO-3`: a synthesised candidate tagged as an AJV-boundary event resolves ceiling #4 (JSON depth) as the first sub-check; the depth walk is ordered before AJV.`

The impl leaf is the source of truth; align the `-T` bullet to it. Edge case: if the related V16a `Adds.` relocation/rewrite findings reword the impl-leaf disclaimer, copy whatever synthesised-event phrasing those edits settle on so the pair stays in lockstep.

## Relationships

- T25 "V16a posits an isolated cross-ceiling unit whose interface is undefined and whose authority over the live breach sites is never established" — same-cluster (broader V16a synthesised-unit-vs-live-site concern; resolves independently).
- T15 "CIO-5 cross-ceiling arbitration verified only in isolation — no live-site integration assertion" — same-cluster (same synthesised-vs-live gap in the V16a pair; resolves independently — it adds a live-site integration assertion rather than re-scoping a -T bullet).

---

# T17 — V17a's `Ships when` gate observes only a subset of the cancellation obligations its Tests enumerate

**Original heading:** V17a bundles 6+ distinct cancellation concerns; Ships-when covers only a subset
**Original section:** V17a — cancellation core
**Kind:** step-atomicity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V17a` — Cancellation core enumerates a large cancellation contract in its **Tests**: the `loomAbort` controller plus the three forwarding paths and the one-shot reason guard, abort-reason *identity* propagation including the byte-exact synthesised `"loom cancelled by agent_end"` message (CNCL-4), downward-only propagation, late-settlement discard (CNCL-1/2/3), no-retroactive-`Ok`-rewrite (CNCL-5), no-tail-abort top-level synthesis (CNCL-6), the five-site checkpoint-granularity assertion with its *absence*/exhaustivity arm, the loop-iteration macrotask-yield assertion, and the three-channel swallowing-handler suppression assertion across the four abandonable-Promise sites.

Its **Ships when** field, by contrast, reads only: "`npm test` forwards a cancel into `loomAbort`, proves downward-only propagation, and asserts CNCL-1/2/3." The phase-exit gate therefore says nothing about CNCL-4 reason-identity propagation, CNCL-5/6, checkpoint presence-and-absence, loop-iteration macrotask yield, or swallowing-handler suppression — the bulk of the leaf's obligations and the most intricate cancellation invariants in the corpus.

The leaf also bundles several independently-verifiable concern clusters, but the load-bearing defect is the gating gap: an implementer can satisfy the literal `Ships when` while the leaf's heaviest obligations go unobserved at completion time.

## Plan Documents

- `docs/plan_topics/V17a-cancellation-core.md` — `Ships when` field (edited)
- `docs/plan_topics/conventions.md` — §Leaf format "Ships when" + §Per-phase TDD ritual phase-exit gate (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices (V17)

**Leaves (implementation order):**

- V17a — Cancellation core — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers can tag `V17a-complete` with the most intricate cancellation invariants — checkpoint exhaustivity (presence-at-five-sites *and* absence elsewhere), loop-iteration macrotask yield, three-channel swallowing-handler suppression, and CNCL-4/5/6 — unverified, because the declared phase-exit gate does not observe them. The paired-`-T` TDD ritual is a partial backstop, but the leaf's own completion criterion under-specifies its obligation set, so the gate is satisfiable while real cancellation behaviour is unproven.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen); 319b277 — pi-loom plan: resolve "Cancellation checkpoint granularity set unverified" (2026-06-10, Thomas Andersen); 52a6819 — pi-loom plan: resolve "cancellation test bullet conflates four obligations" (2026-06-10, Thomas Andersen)
**History:** c6a664e created `V17a` with the present `Ships when` line, already narrower than the leaf's Tests. 319b277 added the checkpoint-granularity/exhaustivity, loop-iteration macrotask-yield, and CNCL-4/5/6 Tests bullets without extending `Ships when`. 52a6819 split the conflated forwarding/propagation/suppression bullet into discrete obligations, further widening the gap. The undercoverage is the interaction of the inception gate with the two later Test-expanding commits, neither of which touched `Ships when`.

## Solution Space

**Shape:** single

### Recommendation

Extend `V17a`'s `Ships when` field so the phase-exit gate observes the obligations its Tests already enumerate but the gate currently omits: CNCL-4 reason-identity propagation (including the byte-exact `"loom cancelled by agent_end"` synthesised message), CNCL-5 (no retroactive `Ok` rewrite), CNCL-6 (no tail-abort top-level synthesis), the checkpoint-granularity presence-at-the-five-sites assertion together with its absence/exhaustivity arm, the loop-iteration macrotask-yield assertion, and the three-channel swallowing-handler suppression assertion. This is a small, contained diff (the `Ships when` field only) with no downstream `Deps` churn and no new leaf IDs; it closes the gating gap directly. The spec is read-only — every gated obligation already traces to an existing CNCL REQ-ID or `cancellation.md` *Granularity* clause. The leaf's size (the softer step-atomicity concern) can be pursued as a separate follow-up after the `Ships when` fix has landed; do not combine the two in one edit.

## Relationships

- T02 "Architectural- and test-bullet completeness overclaims over partial-coverage mechanisms" — same-cluster (same V17a leaf; the checkpoint-exhaustivity overclaim is one of the obligations this gate must observe).
- T13 "Cancel-forwarding couples V9c to the `loomAbort` controller (V17a) without a declared dependency" — decision-dependency (a V17a split changes which sub-leaf owns `loomAbort` / the forwarding target V9c must depend on).
- T12 "CNCL-4 session-shutdown reason facet is asserted in V9g but never authored red in V9g-T or gated by Ships-when" — same-cluster (CNCL-4 is split between V17a and V9g; both are gating gaps in the same cancellation contract).

---

# T18 — BNDR-9 forbidden-character enumeration is ambiguous about the colon-space token

**Original heading:** BNDR-9 unsafe-character list — trailing space inside backticks reads ambiguously
**Original section:** V11b — bind context, truncation, transcript renderer
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The `BNDR-9` Tests bullet in both `V11b` and `V11b-T` enumerates the non-transcript-safe characters as `` (containing `\n`/`\r`/`]`/`: `) ``. The fourth member is rendered as `` `: ` `` — a colon followed by a space inside backticks. A reader cannot tell whether the forbidden token is a bare colon `:` or the two-character sequence `: ` (colon then space). The trailing space inside the backticks reads as either significant or as incidental padding.

The spec is unambiguous: `binder-model-and-context.md` §BNDR-9 defines transcript-safety as containing none of U+000A (`\n`), U+000D (`\r`), `]` (U+005D), **or the two-byte sequence `: ` (U+003A U+0020)** — explicitly the colon-space pair, because that is the role-tag separator in the `[custom:<type>]: ` rendering. A bare colon is safe; only the colon-space pair breaks the BNDR-7 reproduce-exactly contract.

The leaf is the failing-test definition the `-T` author works from. An implementer relying on the bullet rather than the spec page could write the transcript-safety check (and its red fixture) against a bare colon, which over-rejects every `customType` containing `:` — behaviour that contradicts the spec. The two paired leaves carry the identical ambiguous rendering.

## Plan Documents

- `docs/plan_topics/V11b-bind-context-transcript.md` — Tests, `BNDR-9` bullet (edited)
- `docs/plan_topics/V11b-T-bind-context-transcript.md` — Tests, `BNDR-9` bullet (edited)
- `docs/plan_topics/coverage-matrix.md` — `BNDR-7, BNDR-8, BNDR-9 → V11b` row (read-only)

## Spec Documents

- `docs/spec_topics/binder/binder-model-and-context.md` — §BNDR-9 (read-only; authoritative unambiguous definition the fix mirrors — no spec edit)

## Affected Leaves

**Phases:** Vertical (slice V11 — Binder)

**Leaves (implementation order):**

- `V11b-T` — Bind context, truncation, and transcript renderer (tests) — (modified)
- `V11b` — Bind context, truncation, and transcript renderer — (modified)

## Consequence

**Severity:** correctness

A test author reading the `BNDR-9` bullet without consulting the spec page may implement the transcript-safety guard against a bare colon rather than the colon-space pair, over-rejecting valid `customType` values that contain `:`. Two reasonable implementers diverge, and the bare-colon reading produces a guard that does not match BNDR-9.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e ("pi-loom plan: build/update plan for spec.md + review")
**History:** The `V11b` and `V11b-T` leaves were created in the plan-build commit c6a664e. The `BNDR-9` Tests bullet carried the ambiguous `` `: ` `` rendering from that first commit; none of the subsequent plan-resolve commits touched the line.

## Solution Space

**Shape:** single

### Recommendation

In both `docs/plan_topics/V11b-bind-context-transcript.md` and `docs/plan_topics/V11b-T-bind-context-transcript.md`, rewrite the `BNDR-9` Tests bullet so the fourth forbidden member is unmistakably the two-character colon-space sequence, matching `binder-model-and-context.md` §BNDR-9. For example, replace the parenthetical `` (containing `\n`/`\r`/`]`/`: `) `` with text such as `` (containing any of `\n`, `\r`, `]`, or the two-byte sequence `": "` (U+003A U+0020)) ``. Apply the identical wording to both paired leaves in one edit. The other three members (`\n`, `\r`, `]`) are already unambiguous.

## Relationships

None

---

# T19 — Binder system-note and determinism un-anchored MUSTs have no code-keyed coverage-matrix row

**Original heading:** Binder defaulting/determinism un-anchored MUSTs absent from coverage-matrix code-keyed table
**Original section:** docs/plan_topics/coverage-matrix.md and projection index
**Kind:** traceability
**Importance:** high
**Score:** 100
**MustFix:** true

## Finding

`coverage-matrix.md`'s *Code-keyed obligation areas* table carries a third closing-gate surface: every normative MUST/MUST-NOT on a non-narrative `spec_topics/**` page that has no numbered `PREFIX-N` REQ-ID, no `loom/...` registry code, and is not a named cross-leaf seam — the GOV-22 un-anchored-obligation residue — must appear as one rule-driven row with a named closing leaf. The table's preamble states the `H5a` closing gate fails on any such MUST absent from this table once it reaches its live-corpus footing at `H6a`.

Two un-anchored MUST clusters owned by `V11e` are not enumerated in that table. `binder/defaulting-system-note-echo.md` §System-note rendering pins the single-line collapse and the 120-codepoint truncation-with-`…` discipline. `binder/determinism-cancellation-failure.md` §Determinism pins `temperature: 0` on every binder call and the FNV-1a seed derivation ("Conforming implementations MUST reproduce these values exactly"). Neither cluster carries a numbered BNDR ID (the numbered table's BNDR-1…9 cover the bypass envelope, number rendering, the echo reference renderings, and the transcript renderer — not the shared line discipline or the determinism contract) nor a `loom/...` code. `V11e` is the closing leaf for both: its Spec field is exactly these two pages and its Tests assert the 120-codepoint cap and the deterministic FNV-1a seed.

Because neither page appears in the code-keyed table, the gate's enumeration of un-anchored MUSTs treats both clusters as un-enumerated residue with no recorded closing leaf, even though `V11e` closes them.

## Plan Documents

- `docs/plan_topics/coverage-matrix.md` — *Code-keyed obligation areas* (un-anchored-obligation rows) (edited)
- `docs/plan_topics/V11e-system-note-determinism.md` — closing leaf (read-only)
- `docs/plan_topics/H5a-closing-gate-automation.md` — un-anchored-MUST enumeration gate (read-only)
- `docs/plan_topics/conventions.md` — *REQ-ID discipline* (read-only)

## Spec Documents

- `docs/spec_topics/binder/defaulting-system-note-echo.md` — §System-note rendering (read-only)
- `docs/spec_topics/binder/determinism-cancellation-failure.md` — §Determinism (read-only)

## Affected Leaves

**Phases:** Vertical slice V11 (Binder); Release gate (horizontal)

**Leaves (implementation order):**

- `V11e` — Binder system-note rendering and determinism — (blocked) (its release-gate closure recognition is blocked until the rows exist; the leaf itself ships unchanged)
- `H6a` — Live-corpus closing-gate activation (loom 1.0 release gate) — (blocked) (the activated gate flags the two clusters as un-enumerated and reds the release)

## Consequence

**Severity:** blocking

When `H6a` flips the `H5a` closing gate to its live-corpus footing, the gate's un-anchored-MUST enumeration finds the binder system-note and determinism MUSTs with no code-keyed row and fails CI — a false-red on obligations that `V11e` actually closes. The release gate cannot go green until the matrix records `V11e` as their closing leaf.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 0603eb4 — pi-loom plan: resolve "un-anchored normative MUSTs invisible to closing gate" (2026-06-10, Thomas Andersen)
**History:** The *Code-keyed obligation areas* table was created with the plan build (c6a664e, 2026-06-10), which also created `V11e`, carrying only prefix-keyed rows. Commit 0603eb4 added the third closing-gate surface — the rule that every un-anchored MUST gets a named row — and seeded it with rows for the conversation-drive, version-bump-triggers, and host-prerequisites residues, but never the binder system-note / determinism residue. Git pickaxe over `coverage-matrix.md` returns no commit mentioning `defaulting-system-note-echo` or `determinism-cancellation`, confirming the two pages have never been enumerated there.

## Solution Space

**Shape:** single

### Recommendation

Add two rows to the *Code-keyed obligation areas* un-anchored-obligation row group in `docs/plan_topics/coverage-matrix.md`, each naming `V11e` as the closing leaf, mirroring the existing three un-anchored rows (the `<spec page> — <obligation> (un-anchored; GOV-22 residue) | <leaf>` form):

- `binder/defaulting-system-note-echo.md` §System-note rendering — single-line collapse + 120-codepoint truncation-with-`…` MUSTs (un-anchored; GOV-22 residue) → `V11e`
- `binder/determinism-cancellation-failure.md` §Determinism — `temperature: 0` + FNV-1a seed-derivation MUSTs (un-anchored; GOV-22 residue) → `V11e`

The fix is confined to `coverage-matrix.md`; `V11e` and the spec pages are read-only. Watch that the row descriptors point at the System-note rendering / Determinism MUSTs specifically and do not collide with the already-numbered BNDR-4/5/6 echo-rendering obligations on the same `defaulting-system-note-echo.md` page (those are closed via the numbered table by `V2d`/`V11d` and must not be re-keyed as un-anchored).

## Relationships

- T20 "`Sequential by default` carve-out admits only a numbered REQ-ID, but spec-mandated concurrency sites are anchored as code-keyed obligations" — same-cluster (sibling code-keyed-table / un-anchored-machinery concern; resolves with its own independent edit).
- T01 "Un-anchored-MUST closing-gate recogniser claims exact precision and recall over free-form prose" — same-cluster (both concern the un-anchored-MUST closing surface; that finding bounds what the recogniser can detect, this one fills a row it would have to enumerate).

---

# T20 — `Sequential by default` carve-out admits only a numbered REQ-ID, but spec-mandated concurrency sites are anchored as code-keyed obligations

**Original heading:** Promise-construct carve-out keyed to a REQ-ID the spec's parallel-tool-batch behaviour does not carry
**Original section:** docs/plan_topics/conventions.md
**Kind:** spec-fidelity
**Importance:** high
**Score:** 100
**MustFix:** true

## Finding

The `## Cross-cutting rules (every leaf)` *Sequential by default* rule in `conventions.md` forbids `Promise.all` / `Promise.race` / `Promise.allSettled` / `Promise.any` in production code **unless** the calling leaf's `Spec.` field cites a spec REQ-ID whose normative text mandates concurrency at the site, and the leaf's `Adds.` field names the construct and that REQ-ID together. The exemption is realised by a per-site lint allow-list whose entries each carry a `// allow: <REQ-ID> — <spec-page>` comment, and the loom 1.0 closing gate asserts every allow-list entry has a matching REQ-ID present in `coverage-matrix.md`. Every link in that chain is keyed to a **numbered** `PREFIX-N` REQ-ID.

Several concurrency obligations the spec actually mandates are anchored only as **code-keyed obligation areas** with no numbered REQ-ID. The model-driven parallel-tool-batch await in `tool-calls.md` §Concurrency is cited by `V13c`/`V13c-T` as "(TOOL code-keyed area)". The `disposeBarrier` teardown in `active-invocation-registry.md` (realised by the `Promise.allSettled`-over-`disposeBarrier` sub-step) is cited by `V9e`/`V9e-T` as "(PIC area)". A leaf that implements either site with a Promise combinator cannot form the `// allow: <REQ-ID>` comment — there is no REQ-ID to write — and the closing gate rejects any allow-list entry with no matching `coverage-matrix.md` REQ-ID. The exemption path is therefore unsatisfiable for these spec-mandated concurrency sites.

The convention contradicts itself. The `## Leaf format` *Adds.* rule already admits, as a binding obligation under clause (i), "a named normative step on a code-keyed obligation page", and its own parenthetical names "the concurrency construct the *Sequential by default* rule requires `Adds.` to name alongside its mandating REQ-ID." So the leaf-format rule contemplates a concurrency construct bound by a code-keyed obligation, while the carve-out gate that authorises it admits only a numbered REQ-ID. (Contrast `V9i`, whose `Promise.all` parallel-spawn is keyed to the numbered `PIC-22` and satisfies the carve-out cleanly.)

## Plan Documents

- `docs/plan_topics/conventions.md` — `## Cross-cutting rules (every leaf)` *Sequential by default* rule and the `## Leaf format` *Adds.* clause-(i) parenthetical (edited)
- `docs/plan_topics/coverage-matrix.md` — *Code-keyed obligation areas (no numbered REQ-IDs)* (read-only)
- `docs/plan_topics/V13c-query-tool-loop.md` — `Adds.` / `Tests.` (modified)
- `docs/plan_topics/V9e-active-invocation-registry.md` — `Adds.` / `Tests.` (modified)

## Spec Documents

- `docs/spec_topics/tool-calls.md` — §Concurrency (read-only)
- `docs/spec_topics/pi-integration-contract/active-invocation-registry.md` — *Registry contract* (read-only)

## Affected Leaves

**Phases:** Vertical slices (V9, V13)

**Leaves (implementation order):**

- V9e — `ActiveInvocationRegistry` — (both)
- V13c — Query tool loop and typed two-phase — (modified)

## Consequence

**Severity:** correctness

An implementer of `V13c` or `V9e` who reaches for a Promise combinator — the natural realisation of "await every call in the batch to settle" and of "`disposeBarrier` blocks until all entries are disposed" — cannot produce a lint-clean implementation: the `// allow:` exemption comment requires a numbered REQ-ID the cited code-keyed obligation does not carry, and the closing gate rejects an allow-list entry with no matching `coverage-matrix.md` REQ-ID. Two reasonable implementers diverge (one forces a sequential approximation, one wedges on the lint/gate), and the convention contradicts its own *Adds.* clause (i). The `V9e` `disposeBarrier`-with-teardown-cap is the sharpest case, where a faithful realisation is genuinely concurrent.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 15f69aa — pi-loom plan: finish scaffold/template re-pivot from commit 657ee76 (2026-05-26, Thomas Andersen); b737beb — pi-loom plan: resolve "Adds. binding clause (i) cannot bind code-keyed obligations" (2026-06-10, Thomas Andersen)
**History:** The *Sequential by default* carve-out has keyed its exemption to a numbered spec REQ-ID since the carve-out was introduced (present in 15f69aa, 2026-05-26), at a time when no code-keyed-obligation binding class existed. Commit b737beb (2026-06-10) broadened the *Adds.* binding clause (i) to admit "a cited `loom/...` diagnostic-registry code, or a named normative step on a code-keyed obligation page" and kept the parenthetical naming the concurrency construct, but left the carve-out condition, its `// allow: <REQ-ID>` comment form, and the closing-gate REQ-ID match untouched. The defect is the interaction: after b737beb a leaf may name a concurrency construct against a code-keyed obligation in `Adds.`, yet the gate that authorises the construct still demands a numbered REQ-ID the obligation does not carry.

## Solution Space

**Shape:** single

### Recommendation

In `conventions.md`, broaden the *Sequential by default* exemption so that — in addition to a `Spec.`-cited numbered REQ-ID whose normative text mandates concurrency — a `Spec.`-cited **code-keyed obligation area** (a named normative step on a page listed under `coverage-matrix.md` *Code-keyed obligation areas (no numbered REQ-IDs)* whose normative text mandates concurrency at the site) also satisfies the carve-out. Extend the allow-list comment form so it accepts that code-keyed-obligation-area token in the position currently requiring `<REQ-ID>`, and extend the closing-gate assertion so an allow-list entry that names a matching enumerated code-keyed obligation area also passes. Update the *Adds.* clause-(i) parenthetical text "alongside its mandating REQ-ID" to also admit a code-keyed obligation area, so the two rules stay in lock-step.

Edge cases: once the carve-out admits code-keyed obligations, `V9e` and `V13c` must name their construct together with the cited code-keyed area in `Adds.` to claim the exemption, and the corresponding `coverage-matrix.md` *Code-keyed obligation areas* entries must exist for the gate to match against. Re-anchoring any of these obligations as a numbered REQ-ID in the spec instead is a spec-side GOV-22 decision owned by the relevant spec-coverage finding — not by this plan rule — so it stays out of scope here.

## Relationships

- T19 "Binder system-note and determinism un-anchored MUSTs have no code-keyed coverage-matrix row" — same-cluster (another un-anchored code-keyed obligation enumerated under the same matrix section; resolves independently — the `disposeBarrier` row is the named area the broadened carve-out keys against).
- T01 "Un-anchored-MUST closing-gate recogniser claims exact precision and recall over free-form prose" — same-cluster (same `conventions.md` REQ-ID-discipline / un-anchored-obligation machinery; resolves independently).

---

# T21 — H4a frames the factory as returning an extension object; the SDK factory returns `void | Promise<void>` and registers by side effect

**Original heading:** Factory framed as "returns an extension object"; SDK factory returns `void | Promise<void>` and registers by side effect
**Original section:** H4a — factory shell and harness
**Kind:** codebase-grounding-broad
**Importance:** high
**Score:** 100
**MustFix:** true

## Finding

H4a's `Adds` describes "The Pi extension factory entry point (returns an extension object without throwing)" and its first `Tests` bullet asserts "the factory returns an extension object and never throws." Neither the pinned SDK nor the plan's own spec corpus models the factory this way. The pinned `@earendil-works/pi-coding-agent` declares `export type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>` (`dist/core/extensions/types.d.ts:1003`): the factory returns nothing meaningful and establishes the extension purely by side-effect registration calls on the injected `pi` handle (`pi.registerMessageRenderer`, `pi.registerCommand`, `pi.registerFlag`, `pi.registerTool`, `pi.on`).

The spec corpus agrees with the SDK, not with H4a. `pi-integration-contract/extension-bootstrap-and-per-loom.md` repeatedly frames the entry point as `default function (pi: ExtensionAPI)` and states "The factory MUST NOT throw out of `default function (pi: ExtensionAPI)`; per-call `try`/`catch` around each step keeps the failure local," with every step expressed as a registration/subscription call rather than the construction of a returned object.

Because H4a is the leaf that establishes the factory boundary and the harness self-check, an implementer working from it would shape the factory contract and the harness assertion around a return value the Pi loader ignores — checking for or constructing an "extension object" instead of asserting that the side-effect registrations completed and dispatch is observable. The never-throw + per-call `try`/`catch` framing in H4a is itself correct; only the return-value framing is wrong.

## Plan Documents

- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Adds, Tests (first bullet), Ships when (edited)

## Spec Documents

None. The spec corpus (`pi-integration-contract/extension-bootstrap-and-per-loom.md`) already matches the SDK; the fix is internal to the plan.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H4a` — Extension factory shell and end-to-end harness — (modified)

## Consequence

**Severity:** correctness

An implementer reading H4a would build the factory contract and harness self-check against a return value the Pi loader discards, producing a factory/harness that is wrong-by-construction relative to the pinned SDK and the plan's own spec corpus. Two reasonable implementers — one trusting H4a, one trusting the SDK/spec — would diverge on the factory's observable contract.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `docs/plan_topics/H4a-factory-shell-and-harness.md` has a single commit in its history, the plan-build commit c6a664e. The "returns an extension object" phrasing in both the `Adds` and the first `Tests` bullet is present in that first commit; the defect was authored with the leaf and never introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

Edit `docs/plan_topics/H4a-factory-shell-and-harness.md` to express the factory boundary against the SDK's side-effect registration contract rather than a return value:

- **Adds.** Replace the parenthetical "(returns an extension object without throwing)" with framing that the entry point is the standard `default function (pi: ExtensionAPI)` factory returning `void | Promise<void>`, which establishes the extension by registration calls on the injected `pi` handle (`pi.registerMessageRenderer`, `pi.registerCommand`, `pi.registerFlag`, `pi.registerTool`, `pi.on`) under per-call `try`/`catch`, and MUST NOT throw out of the factory body. This mirrors `extension-bootstrap-and-per-loom.md` and the pinned `ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>`.
- **Tests (first bullet).** Replace "the factory returns an extension object and never throws even when a host seam is absent" with an assertion keyed to the registration/dispatch outcome — the factory completes its side-effect registrations and never throws even when a host seam is absent (each host-binding call `try`/`catch`-wrapped per the exempt-broad-catch sites in `conventions.md`).
- **Ships when.** Confirm the condition is stated against registration/dispatch outcome (it already requires loading the extension through the harness and dispatching a command end-to-end); ensure no clause depends on a factory return value.

Retain the never-throw + per-call `try`/`catch` framing — it is correct and load-bearing.

## Relationships

- T05 "Real-host verification gap — every end-to-end and release gate runs only against the H4a session double" — same-cluster (same `H4a` leaf / harness; a corrected boundary still runs against the double, but resolves independently).

---

# T22 — YAML frontmatter parsing mechanism is never declared as a dependency

**Original heading:** YAML frontmatter parsing mechanism never enumerated as a dependency
**Original section:** V6a — frontmatter contract
**Kind:** assumptions
**Importance:** high
**Score:** 100
**MustFix:** false

## Finding

`V6a`'s `Adds.` field names "the YAML frontmatter parser" as a loom-owned component, and its `Ships when` gate requires `npm test` to parse frontmatter. Frontmatter is YAML (spec topics `frontmatter.md`, `frontmatter-fields-a.md`, and `frontmatter-fields-b-and-templates.md` describe YAML scalars, block scalars, and the two `tools:` YAML spellings), so V6a must reach for some YAML-parsing mechanism — yet no plan or spec document names one.

The single source for loom's runtime dependencies is `implementation-notes.md` §"Loom-package implementation dependencies (loom 1.0)", which enumerates exactly `ajv` (validator), `semver` (capability probe), and `chokidar` (FileWatcher adapter). `H1a` mirrors that list verbatim into its `package.json` `Adds.` manifest. Neither enumeration names a YAML library, and the Pi-integration-contract pages document Pi parsing *its own* prompt-template frontmatter but never expose a frontmatter/YAML parser to extensions.

An implementer reaching V6a therefore has three materially divergent paths with no guidance to choose between them: hand-roll a YAML parser, add an undeclared npm dependency (e.g. `yaml` / `js-yaml`), or reuse some assumed Pi-SDK surface. The second path additionally collides with H1a's single-source dependency enumeration and its `package.json` architectural test, which would reject a dependency H1a never declared.

## Plan Documents

- `docs/plan_topics/V6a-frontmatter-contract.md` — `Adds.` field (edited)
- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — `Adds.` dependency manifest (edited)

## Spec Documents

- `docs/spec_topics/implementation-notes.md` — §"Loom-package implementation dependencies (loom 1.0)" (edited)
- `docs/spec_topics/frontmatter.md` — frontmatter contract (read-only)

## Affected Leaves

**Phases:** Horizontal, Vertical V6 (Frontmatter)

**Leaves (implementation order):**

- `H1a` — Project scaffold and toolchain — (modified)
- `V6a` — Frontmatter field contract — (modified)

## Consequence

**Severity:** correctness

The implementer of V6a must guess the YAML-parsing mechanism — hand-rolled parser, an undeclared npm dependency, or an assumed Pi-SDK surface — and two reasonable implementers will diverge. An undeclared dependency path also breaks H1a's single-source dependency enumeration and would not survive H1a's `package.json` architectural test without a coordinated H1a edit that nothing currently directs.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e (2026-06-10, "pi-loom plan: build/update plan for spec.md + review")
**History:** The plan corpus's leaf files were authored in a single build commit, c6a664e. `git show c6a664e:docs/plan_topics/V6a-frontmatter-contract.md` already carries the "YAML frontmatter parser" phrase in `Adds.`, and `git show c6a664e:docs/plan_topics/H1a-scaffold-and-toolchain.md` already enumerates only `ajv`/`semver`/`chokidar` with no YAML library. The spec-side enumeration predates the plan (`implementation-notes.md` traces to 2026-05-04, commit fecb504) and `git log -S"yaml"` against that file returns no commits. No later commit introduced or removed the defect; it is an enumeration gap carried since the corpus was first authored.

## Solution Space

**Shape:** single

### Recommendation

Declare a dedicated YAML-parser dependency, following the established single-source pattern for `ajv`/`semver`/`chokidar`. Add the chosen YAML-parsing library to `docs/spec_topics/implementation-notes.md` §"Loom-package implementation dependencies (loom 1.0)" as a loom-owned runtime `dependencies` entry, on the same footing as `semver` and `chokidar`; mirror it into `docs/plan_topics/H1a-scaffold-and-toolchain.md`'s `Adds.` manifest alongside `ajv`/`semver`/`chokidar`; and change V6a's `Adds.` so "the YAML frontmatter parser" cites the declared mechanism by name (or by the implementation-notes enumeration anchor) instead of naming an undeclared component. (The alternative of reusing a Pi-SDK YAML surface is not viable: no spec page documents a Pi-exposed frontmatter/YAML parser at the pin.) Edge cases the fixer must watch: H1a's `package.json` architectural test must stay green after the new dependency lands, and the library — not being an `@earendil-works` peer — requires no SDK-surface exemption marker, matching `chokidar`'s carve-out.

## Relationships

- T08 "Diagnostic-behaviour Tests bullets omit the registry code in V6a / V6b / V5d" — same-cluster (also targets V6a, but resolves independently — that one is about Tests-bullet code anchoring, not a missing dependency declaration).
- T07 "H1a omits the `engines.node` field that downstream gates presuppose" — same-cluster (also edits H1a's `package.json` manifest authoring; resolves independently).

---

# T23 — V11d uses the `SchemaValidator` (V8a) seam without declaring V8a in its dependency closure

**Original heading:** Uses the SchemaValidator seam (V8a) outside its dependency closure
**Original section:** V11d — system-prompt builder, defaulting, echo
**Kind:** ordering
**Importance:** high
**Score:** 90
**MustFix:** false

## Finding

Both paired leaves `V11d` and `V11d-T` assert the fill-then-revalidate path by calling `SchemaValidator.validate()` — the AJV-wrapper seam owned by `V8a` (PIC-11). Neither leaf's `Deps` field reaches `V8a`: `V11d` declares `V11d-T`, `V11a`, `V2a`, `V2d`, `V5d` and `V11d-T` declares `V11a`, `V2a`, `V2d`, `V5d`. The transitive closure of those deps (`V11a → V9b → {V9a, V10a, V8b}`; `V2a → V1a`; `V5d → {V5a, V5b, V2d}`) never includes `V8a`.

Because the build order is dep-driven (How-to-use step 3), `V11d`/`V11d-T` become eligible before `V8a` has been built. An implementer picking up the leaf at that point finds the `SchemaValidator` seam unresolved, so the fill-then-revalidate test cannot compile or run as written.

The sibling leaf `V11c`, which also consumes the same seam (the relaxed envelope copy validated against `SchemaValidator`), correctly lists `V8a` in its `Deps`. `V11d` is the inconsistent member of the pair.

## Plan Documents

- `docs/plan_topics/V11d-defaulting-echo.md` — `Deps.` field (edited)
- `docs/plan_topics/V11d-T-defaulting-echo.md` — `Deps.` field (edited)
- `docs/plan_topics/V8a-checkpoint-validator-seams.md` — `SchemaValidator` seam owner (read-only)
- `docs/plan_topics/V11c-bypass-envelope.md` — sibling precedent that declares `V8a` (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices (V11 — Binder)

**Leaves (implementation order):**

- V11d-T — System-prompt builder, defaulting, and echo (tests) — (modified)
- V11d — System-prompt builder, defaulting, and echo — (modified)

## Consequence

**Severity:** blocking

When `V11d`/`V11d-T` are reached in DAG order their declared `Deps` are satisfiable before `V8a` exists, so the `SchemaValidator.validate()` reference in the fill-then-revalidate test is unresolved at build time. The leaf cannot be implemented or its red tests authored as written until `V8a` lands, and nothing in the leaf's deps forces that ordering.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e (2026-06-10) — initial plan build for spec.md
**History:** The `V11d`/`V11d-T` `Deps` lines have read `V11d-T, V11a, V2a, V2d, V5d` / `V11a, V2a, V2d, V5d` (omitting `V8a`) since the leaf pages were first authored in c6a664e, where the fill-then-revalidate Tests bullet already relied on AJV re-validation. A later edit, b7e0181, rewrote the bullet to name `SchemaValidator.validate()` explicitly in both paired files but did not add `V8a` to either `Deps` list; it sharpened the seam reference without correcting the dependency.

## Solution Space

**Shape:** single

### Recommendation

Add `V8a` to the `Deps` field of both paired leaves, mirroring the sibling `V11c`.

- In `docs/plan_topics/V11d-defaulting-echo.md`, change the `Deps.` line to `**Deps.** \`V11d-T\`, \`V11a\`, \`V2a\`, \`V2d\`, \`V5d\`, \`V8a\``.
- In `docs/plan_topics/V11d-T-defaulting-echo.md`, change the `Deps.` line to `**Deps.** \`V11a\`, \`V2a\`, \`V2d\`, \`V5d\`, \`V8a\``.

Edge case: if `V11d` is later split, the `V8a` dependency belongs on whichever sub-leaf retains the fill-then-revalidate / post-merge AJV-validation test, not on the pure builder/echo sub-leaf.

## Relationships

None

---

# T24 — V18c's version-bump runtime-evidence gate under-declares its feature dependencies (unschedulable in DAG order)

**Original heading:** V18c under-declares the integrated feature set it runs against (non-executable in DAG order)
**Original section:** V18c — Pi version-bump procedure and gates
**Kind:** ordering
**Importance:** high
**Score:** 90
**MustFix:** false

## Finding

`V18c` carries a runtime-evidence acceptance gate whose **Tests** and **Ships when** require the `H4a` end-to-end harness to run a *representative integrated `.loom`* — "typed query + tool loop + invoke + schema validation + binder + cancellation" — against the bumped Pi-SDK pin and pass. That fixture exercises features produced by other leaves: the query tool loop (`V13c`), code-tool invoke (`V14a`, which transitively pulls invocation core `V15a`), schema-subset lowering/validation (`V5d`), the binder failure taxonomy (`V11f`), and cancellation (`V17a`).

`V18c`'s declared **Deps** are only `V18c-T, V18a, V18b, H4a` — none of the feature-producing leaves. The plan sequences by satisfied **Deps**, not slice number. Once `V18c-T`, `V18a`, `V18b`, and `H4a` are complete, `V18c` becomes eligible to pick up even though the integrated pipeline it must run does not yet exist, so its runtime-evidence gate cannot pass — the leaf is unschedulable as written.

The sibling leaf `H7a` runs the same representative multi-feature fixture class and declares the feature set explicitly (`Deps: H4a, V5d, V8a, V11f, V13c, V14a, V17a`). `V18c`'s gate is the real-host backstop counterpart to `H7a`'s cross-slice gate, yet `V18c` omits the equivalent dependency edges.

## Plan Documents

- `docs/plan_topics/V18c-version-bump-checklist.md` — **Deps** field (edited)
- `docs/plan_topics/H7a-integration-acceptance.md` — Deps / Adds (read-only; the dependency template and fixture-class reference)
- `docs/plan_topics/V13c-query-tool-loop.md` — Adds (read-only)
- `docs/plan_topics/V14a-tool-calls.md` — Deps/Adds (read-only)
- `docs/plan_topics/V5d-subset-lowering.md` — Adds (read-only)
- `docs/plan_topics/V11f-binder-retry-taxonomy.md` — Adds (read-only)
- `docs/plan_topics/V17a-cancellation-core.md` — Adds (read-only)
- `docs/plan.md` — V9 interleave note (read-only)
- `docs/plan_topics/conventions.md` — §3 (read-only)

## Spec Documents

None — the fix is internal to plan-leaf **Deps** fields; no spec edit is required.

## Affected Leaves

**Phases:** Vertical slices — V9 (Extension host integration), V18 (Build-time SDK gates)

**Leaves (implementation order):**

- `V9g` — Session-shutdown teardown and emission isolation — (blocked) — depends on `V9h`→`V18c`; its earliest pick-up moves later when `V18c` is resequenced
- `V9h` — Session-only degraded state and unknown-reason rule — (blocked) — depends on `V18c`; resequenced later
- `V18c` — Pi version-bump procedure and gates — (both) — **Deps** edited to add the feature leaves; consequently resequenced after them in DAG order

## Consequence

**Severity:** blocking

An implementer following the canonical "next leaf whose Deps are satisfied" rule can pick up `V18c` before the integrated pipeline exists; its runtime-evidence acceptance gate (and therefore its **Ships when**) cannot fire green, so the leaf cannot be completed when scheduled. The defect also propagates: `V9h` (and transitively `V9g`) depend on `V18c`, so the contradiction blocks that cluster too.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 81ab342 — pi-loom plan: resolve "version-bump runtime-evidence acceptance gate and revert path" (2026-06-10, Thomas Andersen)
**History:** The leaf was created at `c6a664e` with `Deps: V18c-T, V18a, V18b` and no integrated runtime-evidence gate. Commit `81ab342` added the runtime-evidence acceptance gate requiring a representative integrated `.loom` (typed query + tool loop + invoke + schema validation + binder + cancellation) and appended only `H4a` to **Deps**, omitting the feature-producing leaves — introducing the under-declaration in that single commit.

## Solution Space

**Shape:** single

### Recommendation

Declare the feature-producing leaves directly on `V18c`. Extend `V18c`'s **Deps** line from `` `V18c-T`, `V18a`, `V18b`, `H4a` `` to additionally include `V5d`, `V11f`, `V13c`, `V14a`, and `V17a` (mirroring the set `H7a` already declares for the same fixture class; `V8a` and `V15a` arrive transitively via `V17a`/`V14a`, so naming them is optional). `V14a` covers the "invoke" surface (code-tool invoke, pulling `V15a`); if the fixture also drives the standalone `invoke(...)` core, add `V15a` explicitly. This is the surgical fix — it makes `V18c` schedulable only after the pipeline its gate runs exists, keeps `V18c`'s dependency contract explicit, and avoids coupling the version-bump procedure to the terminal `H7a` gate's late sequencing. None of `V5d`/`V11f`/`V13c`/`V14a`/`V17a` has `V18c` (or `V9h`/`V9g`) in its transitive closure, so the new edges introduce no dependency cycle (verify this still holds if `V15a` is added). Keep `V18c`'s feature-dep list and `H7a`'s in sync if either fixture's feature span later changes.

## Relationships

None
