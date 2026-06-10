# Triaged Plan Review — plan

_Generated: 2026-06-10T14:05:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T28) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 10 medium retained; 20 low discarded; 5 low findings merged into 2 medium findings; 27 NIT dropped; 0 false dropped._

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

