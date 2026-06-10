# Triaged Plan Review — plan

_Generated: 2026-06-10T06:20:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T32) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 1 blocker, 12 high, 19 medium retained; 18 low discarded; 3 low findings merged into 1 medium finding; 5 NIT dropped; 0 false dropped. One verbatim duplicate (a re-pasted V6b finding under the V11d section) was de-duplicated into T12._

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

---

# T02 — V2b ship-gate references the runtime AJV validator seam (V8a) outside its declared dependency closure

**Original heading:** Assumes runtime validator seam (V8a) not listed in Deps.
**Original section:** V2b — Type-compat engine
**Kind:** assumptions
**Importance:** medium
**Score:** 20
**MustFix:** false

## Finding

`V2b` (Type-compatibility engine `⊑`) names a runtime validation behaviour it does not depend on. Its `Adds.` introduces "a runtime AJV safety-net for statically-unresolvable operands," and its `Ships when` reads "`npm test` asserts each TYPE rule **and defers unresolved operands to runtime AJV**." That deferral exercises the `SchemaValidator` seam, which is owned by `V8a` (`Adds.`: "the `SchemaValidator` seam (one-pass multi-error AJV wrapper …)").

`V2b` `Deps.` are `V2b-T, V2a, V5d`. Neither path reaches `V8a`: `V2a` depends on `V2a-T, V1a`; `V5d` depends on `V5d-T, V5a, V5b, V2d`; and `V8a` depends only on `V8a-T, H3a`. The validator behaviour the ship-gate clause names is therefore outside `V2b`'s transitive dependency closure.

The leaf's actual binding obligations — `TYPE-1` through `TYPE-10` — are all static compatibility rules; none drives runtime AJV. So the deferral clause is stated as fact without either (a) a dependency that supplies the validator behaviour, or (b) a statement that `V2b` merely emits a deferral marker consumed elsewhere. Sibling leaves that genuinely touch the seam (`V6b`, `V11d`, `V9c`) do list `V8a` in `Deps.`, which marks `V2b`'s omission as an inconsistency rather than an intentional scoping decision.

## Plan Documents

- `docs/plan.md` — Vertical slices / V2 (read-only)
- `docs/plan_topics/V2b-type-compat-engine.md` — V2b leaf, `Adds.` / `Deps.` / `Ships when` (edited)
- `docs/plan_topics/V2b-T-type-compat-engine.md` — paired tests leaf, mirror prose (option-dependent)
- `docs/plan_topics/V8a-checkpoint-validator-seams.md` — `SchemaValidator` seam owner (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** V2 — Type system and values

**Leaves (implementation order):**

- `V2b` — Type-compatibility engine (`⊑`) — (modified)
- `V2b-T` — Type-compatibility engine tests — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one reads the deferral clause as requiring `V2b` to wire and exercise the runtime AJV safety-net (a behaviour whose seam is not in `V2b`'s declared dependency closure, so the leaf can be picked before `V8a` is built and that part of the ship-gate cannot be observed); the other treats it as a pure deferral marker and never touches the validator. The leaf's boundary and its dependency ordering depend on which reading is correct.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The plan corpus location carrying the defect — `docs/plan_topics/V2b-type-compat-engine.md` (and its `V2b-T` mirror) — is untracked in the git work tree (`git ls-files --error-unmatch` reports "did not match any file(s) known to git"; `git status` shows it as `??`). No commit history exists for the cited leaf files, so the defect cannot be localised to an introducing commit.

## Solution Space

**Shape:** single

### Recommendation

`V2b` only records that an operand is statically unresolvable; the runtime AJV validation runs at the downstream consumer sites (`V6b`, `V11d`) that already own the `SchemaValidator` dependency. First confirm `V2b`'s Tests exercise only the static `⊑` rules (`TYPE-1`…`TYPE-10`) and not runtime AJV; then reword the `Adds.` clause "a runtime AJV safety-net for statically-unresolvable operands" to state that `V2b` emits a deferral marker for statically-unresolvable operands, consumed by the downstream validator sites, and reword the `Ships when` clause "defers unresolved operands to runtime AJV" to "marks unresolved operands for downstream runtime validation." Mirror the `Adds.` change in `V2b-T` if it carries the same prose.

This keeps `V2b`'s dependency closure aligned with its actual (static `⊑`) Tests and introduces no unexercised dependency; the real validator dependency stays at the consumer leaves (`V6b`, `V11d`) that already declare `V8a`. Edge case the implementer must watch: if any `V2b` Tests bullet genuinely requires invoking the validator to go green, instead add `V8a` to `V2b`/`V2b-T` `Deps.`.

## Relationships

- T12 "`V6b` defers `params` validation to the `SchemaValidator` seam without depending on its owning leaf" — same-cluster (the same `V8a`-not-in-`Deps.` pattern on `V6b`; resolves independently per-leaf).

---

# T03 — `DIAG-2` describes a `src/**` emission scan the closing gate does not perform

**Original heading:** DIAG-2 over-claims "a code emitted by `src/**`" vs the asserting-test reconciliation gate
**Original section:** V7b — Code registry
**Kind:** overclaim
**Importance:** medium
**Score:** 22
**MustFix:** false

## Finding

The `V7b` / `V7b-T` leaves both phrase their `DIAG-2` test as: *"the registry is closed — a code emitted by `src/**` with no registry row fails the gate."* The gate that actually enforces closure is the `H5a` closing gate, whose `Adds.` defines its registry-reconciliation behaviour as failing on *"a registry code with no asserting test, an asserted code absent from the registry"* — and the `conventions.md` *Diagnostic message anchors* rule frames the same obligation in terms of tests that assert a diagnostic code. The gate reconciles **test-asserted** codes against the registry; it performs no scan of `src/**` emission sites, and `Diagnostic.code` is typed `string` (per the diagnostics primitive), not a closed union the toolchain could enumerate statically.

The consequence is a coverage gap the `DIAG-2` wording papers over: a code emitted somewhere in `src/**` but asserted by no test passes the gate silently, because nothing in the `H5a` reconciliation looks at emission sites. A faithful implementer who writes the `DIAG-2` fixture exactly as worded — emit a code with no registry row, do not assert it — gets a green gate where the leaf's `Ships when.` ("fail red for the intended reason" for `V7b-T`) demands red. The fixture cannot demonstrate the stated closure property because that property is not the one the gate enforces.

The fix is to align the `DIAG-2` wording (and `V7b`'s `Ships when.`) with the asserting-test reconciliation the gate actually performs, in both the implementation leaf and its paired test leaf.

## Plan Documents

- `docs/plan_topics/V7b-code-registry.md` — `Tests.` (`DIAG-2`) and `Ships when.` (edited)
- `docs/plan_topics/V7b-T-code-registry.md` — `Tests.` (`DIAG-2`) (edited)
- `docs/plan_topics/H5a-closing-gate-automation.md` — `Adds.` gate-reconciliation definition (read-only)
- `docs/plan_topics/conventions.md` — *Diagnostic message anchors* cross-cutting rule (read-only)

## Spec Documents

None — the fix is internal to the plan leaf wording. The diagnostics registry already states closure over *codes* (rule 2, `code-registry-runtime.md`) and `Diagnostic.code` is already typed `string`; neither needs editing.

## Affected Leaves

**Phases:** Vertical V7 (Diagnostics)

**Leaves (implementation order):**

- `V7b-T` — Diagnostic code registry and closing gate (tests) — (modified)
- `V7b` — Diagnostic code registry and closing gate — (modified)

## Consequence

**Severity:** correctness

A diagnostic code that is emitted in `src/**` but asserted by no test escapes the closing gate, so the registry's "closed" guarantee is weaker than `DIAG-2` claims. An implementer building the `DIAG-2` fixture from the literal wording (emit-but-don't-assert) produces a green gate, which contradicts `V7b-T`'s red-for-the-intended-reason ship condition and lets the leaf certify a closure property the gate never checks.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited plan leaf files `docs/plan_topics/V7b-code-registry.md` and `docs/plan_topics/V7b-T-code-registry.md` are untracked in the git work tree (never committed), so no commit history records when the over-claiming `DIAG-2` wording entered the corpus. The repository is a git work tree and `docs/plan.md` is tracked, but the defect lives entirely in these uncommitted leaf files.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/V7b-code-registry.md`:

- In the `Tests.` `DIAG-2` bullet, replace `a code emitted by \`src/**\` with no registry row fails the gate` with wording that names the reconciliation the `H5a` gate actually performs — `a code asserted by a test with no registry row fails the gate` (the inverse direction, "a registry code with no asserting test fails the gate", is already covered by the gate's `Adds.` and may be stated alongside).
- In the `Ships when.` field, replace `reconciles emitted codes against the registry` with `reconciles test-asserted codes against the registry`.

In `docs/plan_topics/V7b-T-code-registry.md`, apply the identical `DIAG-2` bullet replacement so the paired test leaf matches.

Edge case for the implementer: because the gate has no `src/**` emission scan and `Diagnostic.code` is typed `string`, true emission-site closure (catching an emitted-but-never-asserted code) is out of scope for this leaf and is not what `DIAG-2` should claim. If emission-site closure is later wanted, it requires a distinct mechanism (a closed-union `code` type or an emission-site AST scan with a dynamic-string caveat) introduced under its own leaf — do not smuggle it into the `DIAG-2` reword.

## Relationships

- T23 "PIC-21 (renderer exception safety) has a coverage-matrix row but no asserting test in V7a" — same-cluster (both concern closure evidence reconciled through the `H5a` gate; resolve independently).
- T21 "Asserted diagnostic code `loom/parse/empty-enum-body` is absent from the parse registry" — same-cluster (exercises the same `H5a` asserting-test reconciliation this finding clarifies; independent leaf `V5a`).
- T04 "Truncated diagnostic code: `V5b` cites `loom/parse/duplicate-discriminator`, registry has `loom/parse/duplicate-discriminator-value`" — same-cluster (a test-asserted code that must reconcile against the registry under the same gate; independent leaf).

---

# T04 — Truncated diagnostic code: `V5b` cites `loom/parse/duplicate-discriminator`, registry has `loom/parse/duplicate-discriminator-value`

**Original heading:** Diagnostic code truncated: `duplicate-discriminator` vs registry `duplicate-discriminator-value`
**Original section:** V5b — Discriminated unions and recursion
**Kind:** consistency
**Importance:** medium
**Score:** 22
**MustFix:** false

## Finding

The paired leaves `V5b` and `V5b-T` each list a `Tests.` bullet asserting the discriminator-violation codes `loom/parse/non-string-discriminator`, `loom/parse/ambiguous-discriminator`, `loom/parse/missing-discriminator`, `loom/parse/duplicate-discriminator`, and `loom/parse/nested-discriminator`. Four of these are registered verbatim in `code-registry-parse.md`. The fifth, `loom/parse/duplicate-discriminator`, is not: the parse registry (`code-registry-parse.md`, the "two variants share the same discriminator value" row) and `schemas.md` register the code as `loom/parse/duplicate-discriminator-value`. The plan citation has dropped the `-value` suffix.

Diagnostic codes must be reproduced verbatim against the registry. As written, the asserted code `loom/parse/duplicate-discriminator` has no registry row, while the registered code `loom/parse/duplicate-discriminator-value` has no asserting test. The duplicate-discriminator-value behaviour therefore ships with no closing test, and the leaf asserts a phantom code that the spec never defines.

## Plan Documents

- `docs/plan_topics/V5b-disc-unions-recursion.md` — Tests (edited)
- `docs/plan_topics/V5b-T-disc-unions-recursion.md` — Tests (edited)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slice V5 (Schemas, descriptions, schema-subset)

**Leaves (implementation order):**

- `V5b-T` — Discriminated unions, recursion, and cycle detection (tests) — (modified)
- `V5b` — Discriminated unions, recursion, and cycle detection — (modified)

## Consequence

**Severity:** correctness

An implementer faithfully writing the test asserts `loom/parse/duplicate-discriminator`, a code that is never emitted, while the real `loom/parse/duplicate-discriminator-value` behaviour goes untested. The `H5a` closing gate, which reconciles test-asserted codes against the registry, fails on the phantom code; a reviewer reconciling by hand could diverge on whether to register the truncated code or correct the citation.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** the plan leaf files carrying the defect (`docs/plan_topics/V5b-disc-unions-recursion.md` and `docs/plan_topics/V5b-T-disc-unions-recursion.md`) are untracked in the git working tree — `git ls-files` returns nothing for either and `git status` reports both as `??`. The truncated token `loom/parse/duplicate-discriminator` appears in no committed revision (`git log -S`/`-G` over tracked history surfaces only the correct `loom/parse/duplicate-discriminator-value` in the spec). The defect therefore exists only in the uncommitted working tree; no commit introduced it.

## Solution Space

**Shape:** single

### Recommendation

In both `docs/plan_topics/V5b-disc-unions-recursion.md` and `docs/plan_topics/V5b-T-disc-unions-recursion.md`, change the citation `loom/parse/duplicate-discriminator` to `loom/parse/duplicate-discriminator-value` in the discriminator-violations `Tests.` bullet. Edit the two leaves together so the paired tests/implementation bullets stay mirror-consistent. The corrected spelling is the registry-exact code from `code-registry-parse.md`; the other four codes in the same bullet are already correct and must be left unchanged.

## Relationships

- T21 "Asserted diagnostic code `loom/parse/empty-enum-body` is absent from the parse registry" — same-cluster (same class of asserted-parse-code-vs-registry mismatch that fails the `H5a` closing gate; resolves independently).
- T13 "`V6e`/`V6e-T` assert a non-existent `loom/parse/...` diagnostic code instead of the registered `loom/load/frontmatter-value-out-of-range`" — same-cluster (registry-citation defect failing the closing gate; resolves independently).
- T05 "Bare diagnostic code `binder-model-strict-capability-unknown` missing `loom/load/` prefix" — same-cluster (bare/malformed code citation absent from registry; resolves independently).

---

# T05 — Bare diagnostic code `binder-model-strict-capability-unknown` missing `loom/load/` prefix

**Original heading:** Diagnostic code cited without namespace prefix
**Original section:** V11a — Binder-model resolution and strict-capability probe
**Kind:** naming
**Importance:** medium
**Score:** 22
**MustFix:** false

## Finding

The second `Tests.` bullet of `V11a` (and its `V11a-T` mirror) reads:

> The `strictCapable` probe: `false` → `loom/load/binder-model-not-strict-capable` (E); `undefined` → `binder-model-strict-capability-unknown` (W); `true` → resolves.

The first asserted code carries its full `loom/load/` namespace, but the second is written bare as `binder-model-strict-capability-unknown`. The diagnostics registry (`spec_topics/diagnostics/code-registry-load.md`) registers this warning only under its full name, `loom/load/binder-model-strict-capability-unknown`; the bare form appears nowhere in the corpus.

Diagnostic codes must be reproduced verbatim. Per `conventions.md` *REQ-ID discipline*, "any asserted code not in the registry is a CI failure" at the loom 1.0 closing gate (`H5a`). A test asserting the bare string therefore fails the gate on two arms simultaneously: the asserted code is not in the registry, and the registered `loom/load/binder-model-strict-capability-unknown` warning is left with no asserting test. Both `V11a` and `V11a-T` carry the identical bare form, so the paired leaves stay mirror-consistent but both wrong.

## Plan Documents

- `docs/plan_topics/V11a-binder-model-resolution.md` — Tests (edited)
- `docs/plan_topics/V11a-T-binder-model-resolution.md` — Tests (edited)

## Spec Documents

None — `loom/load/binder-model-strict-capability-unknown` is already registered in `code-registry-load.md`; the fix is internal to the two plan leaves.

## Affected Leaves

**Phases:** Vertical slice V11 (Binder)

**Leaves (implementation order):**

- `V11a-T` — Binder-model resolution and strict-capability probe (tests) — (modified)
- `V11a` — Binder-model resolution and strict-capability probe — (modified)

## Consequence

**Severity:** correctness

A faithful implementer transcribing the bullet asserts a code that is absent from the registry, which the `H5a` closing gate flags as a CI failure, while the genuine registered warning ships with no asserting test. The leaf cannot reach green as written.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited leaf files `docs/plan_topics/V11a-binder-model-resolution.md` and `docs/plan_topics/V11a-T-binder-model-resolution.md` are untracked in the git work tree (never committed); `git log --follow` over both files and `git log -S` over the bare-code defect token return no history, so the introducing change cannot be localised to a commit.

## Solution Space

**Shape:** single

### Recommendation

In the second `Tests.` bullet of both `docs/plan_topics/V11a-binder-model-resolution.md` and `docs/plan_topics/V11a-T-binder-model-resolution.md`, replace the bare `binder-model-strict-capability-unknown` with the registry-exact `loom/load/binder-model-strict-capability-unknown`. The corrected bullet reads:

> The `strictCapable` probe: `false` → `loom/load/binder-model-not-strict-capable` (E); `undefined` → `loom/load/binder-model-strict-capability-unknown` (W); `true` → resolves.

Apply the identical edit to both leaves so the implementation/tests pair stays mirror-consistent.

## Relationships

- T21 "Asserted diagnostic code `loom/parse/empty-enum-body` is absent from the parse registry" — same-cluster (asserted code absent from registry → H5a gate failure; resolves independently).
- T04 "Truncated diagnostic code: `V5b` cites `loom/parse/duplicate-discriminator`, registry has `loom/parse/duplicate-discriminator-value`" — same-cluster (truncated code form → registry miss; resolves independently).
- T13 "`V6e`/`V6e-T` assert a non-existent `loom/parse/...` diagnostic code instead of the registered `loom/load/frontmatter-value-out-of-range`" — same-cluster (wrong namespace → registry miss → H5a gate failure; resolves independently).

---

# T06 — Ambient-access ban asserts soundness it cannot deliver

**Original heading:** "no module reads X" over-claim vs identifier-keyed scan
**Original section:** H3a — Ambient-access ban architectural test
**Kind:** overclaim
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H3a`'s second `Tests.` bullet asserts an architectural test where "no `src/**` module reads `process.env`, `process.cwd`, `crypto.randomUUID`, `Date.now`, or `setTimeout` outside its declared seam adapter," and its `Ships when` gates on "the ambient-access ban." The verb *reads* states a soundness claim: that the test detects every ambient read. An identifier-keyed AST scan cannot honour that. It catches direct member references but misses aliased reads (`const env = process.env`), destructured reads (`const { cwd } = process`), computed access (`process["env"]`), and re-export indirection — each of which still reads the ambient value while presenting no matched identifier at the read site.

The plan already recognises this evasion class elsewhere. `V18b`'s inventory-closure audit handles exactly these shapes for Pi surfaces via a non-exemptible **family-(4)** discriminator that fires fail-closed on aliased rebindings, `import * as`, dynamic `import()`, and off-canonical parameter shapes. `V8b`'s `PIC-13` even states its parallel ambient-access ban with the narrower, defensible verb — "no `src/**` module reads `process.env`/`process.cwd` **directly**." `H3a` names no equivalent fail-closed arm and no "directly" scoping, so its gate promises detection it does not perform.

## Plan Documents

- `docs/plan_topics/H3a-di-seam-skeleton.md` — Tests (bullet 2), Adds, Ships when (edited)
- `docs/plan_topics/V18b-inventory-audit.md` — family-(4) non-exemptible discriminator (read-only)
- `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md` — PIC-12 / PIC-13 parallel ambient-access ban, "directly" phrasing (read-only)
- `docs/plan_topics/conventions.md` — *No globals, statics, singletons* (read-only)

## Spec Documents

None — `H3a` is a horizontal leaf citing a `Convention.` field; the fix is internal to plan files.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H3a` — Dependency-injection seam skeleton — (modified)

## Consequence

**Severity:** correctness

The gate reports green while a contributor who reaches the ambient value through any indirect form (alias, destructure, computed key, re-export) silently bypasses the no-ambient-access invariant the entire DI-seam architecture rests on. The test's wording tells a reviewer the ban is mechanically enforced when it is only partially enforced, so two reasonable implementers will disagree on what `H3a` actually guarantees.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited leaf file `docs/plan_topics/H3a-di-seam-skeleton.md` is not under version control (untracked in the work tree), so the defect cannot be localised to any commit.

## Solution Space

**Shape:** single

### Recommendation

Narrow the verb in `H3a`'s second `Tests.` bullet and `Ships when` from "reads" to "directly references" (matching `V8b` `PIC-13`'s "directly"), and add an inline note that indirect, aliased, destructured, computed, and re-export ambient access is contributor-discipline, not mechanically detected by this identifier scan.

Concretely: in `H3a` Tests bullet 2, replace "reads `process.env` … outside its declared seam adapter" with "directly references `process.env`, `process.cwd`, `crypto.randomUUID`, `Date.now`, or `setTimeout` outside its declared seam adapter"; in `Ships when`, keep "the ambient-access ban" but scope it to the direct-reference form; append a sentence stating indirect / aliased / computed / re-export forms are not caught by this scan and are enforced by contributor discipline / review.

The proportionate fix for a horizontal seam-skeleton leaf is to make the claim honest — scope it to "directly references" and name the indirect residue as contributor-discipline — rather than to grow a fail-closed AST discriminator for five identifiers; `V18b` shows the project pays that cost deliberately only for the Pi-surface audit. Keep `H3a` consistent with `V8b` `PIC-13`, which already uses "directly." Edge case the implementer must watch: the residue note must enumerate the indirect forms (alias, destructure, computed, re-export) so the gap is explicit rather than implied.

## Relationships

- T03 "`DIAG-2` describes a `src/**` emission scan the closing gate does not perform" — same-cluster (the same over-claim pattern — a gate whose prose asserts broader source-scan coverage than its mechanism actually performs; resolves independently).

---

# T07 — `V16a` claims NOCEIL-1…NOCEIL-4 in `Adds.` with no backing `Tests.`

**Original heading:** NOCEIL-1…4 claimed in Adds. with no backing Tests bullets
**Original section:** V16a — Ceiling order / masked
**Kind:** placement
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V16a` is the cross-ceiling leaf: it owns the fixed CIO-1 … CIO-6 evaluation order, the at-most-one-ceiling-per-event rule, and the optional `masked` enumeration. Its six `Tests.` bullets (CIO-1 … CIO-6) and its paired test leaf `V16a-T` cover exactly those obligations and nothing else. Yet the first sentence of its `Adds.` also asserts the leaf implements "the NOCEIL-1 … NOCEIL-4 non-existence behaviours." No `Tests.` bullet in either `V16a` or `V16a-T` exercises any NOCEIL behaviour, and the leaf's own second `Adds.` sentence already re-scopes it to CIO order + `masked` only — so the NOCEIL clause is a stray, unbacked claim.

The NOCEIL claims are GOV-16 stable inline labels in the spec, not numbered REQ-IDs, and their observable seams are distributed across the feature leaves that own each ceiling's axis: NOCEIL-1 (no per-call timeout) is enforced at parse time by `V6a`'s `loom/parse/timeout-field-rejected`; NOCEIL-2 (no token cap) surfaces only as `ContextOverflowError` via `V4d` (ERR-14/15/17); NOCEIL-3 (no memory ceiling) routes through `V4b`'s `loom/runtime/internal-error` catchable/uncatchable carve-out; NOCEIL-4 (no extra frame-depth ceiling) is the 32-level invoke bound `INV-4` owned by `V15b`. The cross-cutting closure of the NOCEIL-1 … NOCEIL-4 set is the spec's four-axis Audit methodology (`hard-ceilings.md`), a GOV-15 release-time corpus-review obligation, not a runtime test in any leaf.

The same misattribution is duplicated in `coverage-matrix.md`: its Governance section closes with "…its cross-ceiling content is carried by the `CIO` IDs and the `HC3`/`NOCEIL` inline labels, all closed by `V16a` and `V11f`." That is wrong twice — `V11f` closes the `HC3-a … HC3-e` binder-retry labels, not NOCEIL, and the NOCEIL behaviours have no single closing leaf at all.

## Plan Documents

- `docs/plan_topics/V16a-ceiling-order-masked.md` — `Adds.` field (edited)
- `docs/plan_topics/coverage-matrix.md` — Governance REQ-IDs section, closing `CEIL`/`CIO`/`HC3`/`NOCEIL` attribution sentence (edited)
- `docs/plan_topics/V6a-frontmatter-contract.md` — `Tests.` (`loom/parse/timeout-field-rejected`, NOCEIL-1 seam) (read-only)
- `docs/plan_topics/V4d-queryerror-variants.md` — `Tests.` (ERR-14/15/17, `ContextOverflowError` = NOCEIL-2 surface) (read-only)
- `docs/plan_topics/V4b-runtime-panics.md` — `Tests.` (`loom/runtime/internal-error`, NOCEIL-3 carve-out) (read-only)
- `docs/plan_topics/V15b-invoke-depth-cycle.md` — `Tests.` (INV-4, NOCEIL-4's only loom-level frame-depth ceiling) (read-only)

## Spec Documents

- `docs/spec_topics/hard-ceilings.md` — NOCEIL-1 … NOCEIL-4 ownership + four-axis Audit methodology (read-only)
- `docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md` — NOCEIL-1 … NOCEIL-4 definitions and Audit methodology closure (read-only)

## Affected Leaves

**Phases:** Vertical

**Leaves (implementation order):**

- `V16a` — Hard-ceiling interaction order and `masked` co-fire — (modified)

## Consequence

**Severity:** correctness

An implementer reading `V16a`'s `Adds.` is told the leaf implements NOCEIL-1 … NOCEIL-4, yet none of its Tests do; a literal-minded implementer adds NOCEIL tests to `V16a` and duplicates coverage that the distributed-seam model pins to `V6a`/`V4d`/`V4b`/`V15b`. The parallel `coverage-matrix.md` claim that NOCEIL is "closed by `V16a` and `V11f`" makes the matrix lie about where NOCEIL evidence lives — an auditor following the matrix looks at `V16a`/`V11f` for NOCEIL closure and finds none, undermining the matrix as the coverage source of truth.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The leaf file carrying the misattributed claim, `docs/plan_topics/V16a-ceiling-order-masked.md`, is untracked (`git ls-files` returns nothing; `git status` shows `??`), and the matching `coverage-matrix.md` NOCEIL/`V16a`/`V11f` sentence exists only in the uncommitted working-tree modification (the committed `HEAD:docs/plan_topics/coverage-matrix.md` contains no `NOCEIL` token). The defect therefore cannot be localised to any commit in the corpus history.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/V16a-ceiling-order-masked.md`, strike "and the NOCEIL-1 … NOCEIL-4 non-existence behaviours" from the first sentence of `Adds.`, leaving `V16a`'s `Adds.` scoped to the CIO-1 … CIO-6 evaluation order, the at-most-one-ceiling-per-event rule, and the `masked` enumeration (the leaf's second `Adds.` sentence, its CIO `Tests.`, and its `Ships when.` already carry that scope). Do not add NOCEIL `Tests.` bullets to `V16a` — those behaviours are closed by their feature leaves, not here.

In `docs/plan_topics/coverage-matrix.md`, correct the Governance section's closing sentence so it no longer attributes NOCEIL closure to `V16a`/`V11f`. The corrected statement must convey that CIO-1 … CIO-6 close in `V16a` and `HC3-a … HC3-e` close in `V11f`, while the NOCEIL-1 … NOCEIL-4 non-existence claims have no single closing leaf: their observable seams are distributed (NOCEIL-1 → `V6a`'s `loom/parse/timeout-field-rejected`; NOCEIL-2 → `V4d`'s `ContextOverflowError` / ERR-14/15/17; NOCEIL-3 → `V4b`'s `loom/runtime/internal-error` carve-out; NOCEIL-4 → `V15b`'s `INV-4` invoke-depth bound), and their cross-cutting closure is the spec's four-axis Audit methodology in `hard-ceilings.md` (a GOV-15 release-time corpus-review obligation, not a runtime leaf).

Resolve the `V16a` `Adds.` edit first, then reconcile the `coverage-matrix.md` sentence against the corrected attribution. Edge case: do not coin a NOCEIL row in the coverage-matrix REQ-ID table — NOCEIL is an inline label, not a numbered REQ-ID, and that table maps numbered REQ-IDs and diagnostic-code areas only.

## Relationships

- T23 "PIC-21 (renderer exception safety) has a coverage-matrix row but no asserting test in V7a" — same-cluster (same defect class: coverage attributed to a leaf whose Tests don't bear it out; resolves on its own row/leaf).
- T22 "`PIC-2` mapped to `V9c` in the coverage matrix but never asserted; `subagent.md` missing from `V9c` `Spec.`" — same-cluster (same matrix-vs-leaf attribution defect class; independent resolution).

---

# T08 — Unbindable "typebox MUST NOT be collapsed" obligation in `H1a` `Adds.`

**Original heading:** typebox "MUST NOT be collapsed" in descriptive-by-default Adds.
**Original section:** H1a — Project scaffold and toolchain
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H1a` `Adds.` states a normative requirement — `typebox` is pinned `"*"` separately from the four `@earendil-works/pi-*` peers, and "the two ranges MUST NOT be collapsed". But `H1a` is a horizontal single-task leaf: per `conventions.md` *Leaf format* its `Adds.` prose is **descriptive by default** and binds the implementer only through (i) an observable behaviour carrying a cited REQ-ID or (ii) a named cross-leaf seam a `Deps.` consumer relies on. The collapse prohibition is neither — it carries no REQ-ID and is not a seam — so as written it authorises nothing.

The leaf's two `Tests.` bullets confirm the gap: the architectural test "reads `package.json` and asserts the four peer deps share that line." Nothing asserts that `typebox`'s `"*"` is held distinct from the four-entry tilde-pinned line. An implementer could fold `typebox` into the tilde group (or pin it elsewhere) and every `H1a` test still passes green.

The requirement is real and spec-grounded, not editorial: `host-prerequisites.md §pi-sdk-pin` states "The `typebox` `"*"` declaration MUST NOT be collapsed into the four-entry tilde-pinned group" and that the `"*"` literal "is asserted by its own one-line build-time literal-read assertion." The plan names the obligation but routes it to a non-binding surface and omits the separate assertion the spec mandates.

## Plan Documents

- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — `Adds.` / `Tests.` (edited)
- `docs/plan_topics/conventions.md` — *Leaf format* §`Adds.` binding rule (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — §`pi-sdk-pin` (manifest lock-step / `typebox` sub-paragraphs) (read-only)

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H1a` — Project scaffold and toolchain — (modified)

## Consequence

**Severity:** correctness

The spec mandates a build-time literal-read assertion that keeps `typebox`'s `"*"` distinct from the four-peer tilde line; the plan omits it and parks the obligation in non-binding `Adds.` prose. Two reasonable implementers diverge — one adds the separate assertion, one collapses `typebox` into the tilde group — and the leaf ships green either way, silently violating the spec's MUST-NOT.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The plan leaf carrying the defect, `docs/plan_topics/H1a-scaffold-and-toolchain.md`, is untracked in the git work tree (`git status` reports it `??`), so the introduction of the `Adds.`-vs-`Tests.` mismatch cannot be localised to any commit. The sibling `conventions.md` rule it conflicts with is tracked, but the unbound clause itself has no version history to walk.

## Solution Space

**Shape:** single

### Recommendation

Add a `Tests.` bullet to `H1a` asserting the separation the spec requires: the architectural test reads `package.json` and asserts `typebox` is declared `"*"` as its own `peerDependencies` entry, not folded into the four `@earendil-works/pi-*` tilde-pinned line. Cite the spec obligation — `[host-prerequisites.md §pi-sdk-pin]` — the `typebox` sub-paragraph names "its own one-line build-time literal-read assertion" as the mechanism. With the assertion in place the `Adds.` prose "the two ranges MUST NOT be collapsed" becomes descriptive shadow of a binding `Tests.` surface and needs no further change.

Edge cases for the implementer: the assertion must fail both when `typebox` is given the tilde range and when it is dropped from `peerDependencies` entirely; it is independent of the existing four-peer shared-line assertion (both run against `package.json#peerDependencies`).

## Relationships

- T32 "Adds. binding clause (i) cannot bind code-keyed obligations" — same-cluster (this is a concrete instance of the undefined `Adds.` binding-class rule; the general fix governs how clauses like this one are classified).
- T30 "Un-anchored normative MUSTs are invisible to the closing gate by construction" — same-cluster (the collapse prohibition is exactly an un-anchored normative MUST invisible to the closing gate; a general rule fix would catch it categorically).

---

# T09 — V1b escape-sequence Tests bullet merges error-detection and decoding without citing any code or anchor

**Original heading:** Second Tests bullet merges two behaviors with no code
**Original section:** V1b — Literals and paths
**Kind:** traceability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V1b`'s second `Tests.` bullet reads: "String escape errors fire at the offending span; `\u{…}` decodes correctly." This single bullet conflates two independent behaviours that fail independently: a set of parse-phase escape diagnostics, and the happy-path decoding of a `\u{…}` escape to its Unicode scalar value. Neither half cites a verbatim diagnostic code or a stable spec anchor, so neither sub-behaviour is individually referenceable. The identical bullet appears in the paired tests leaf `V1b-T`.

`lexical.md` §*String literals* defines two distinct escape error codes — `loom/parse/illegal-escape` (a backslash followed by an unrecognised character) and `loom/parse/invalid-unicode-escape` (a recognised `\u{…}` whose value exceeds `U+10FFFF` or names a surrogate) — both registered in `diagnostics/code-registry-parse.md`. The merged prose "String escape errors fire" cites neither verbatim, and the decode happy-path carries no citation at all.

This collides with two `conventions.md` cross-cutting rules: the *Tests.* leaf-format rule ("one bullet per REQ-ID … cite the ID inline") and the *REQ-ID discipline* closing gate, which reconciles registry diagnostic codes against asserting tests by verbatim code match (a registry code with no asserting test is a CI failure). Because `V1b`/`V1b-T` is the only place these two escape codes would be closed (the only other mention, in `V13a`, is the query-template body, a separate site), the merged bullet leaves both `loom/parse/illegal-escape` and `loom/parse/invalid-unicode-escape` without a verbatim-cited asserting test.

## Plan Documents

- `docs/plan_topics/V1b-literals-and-paths.md` — Tests (edited)
- `docs/plan_topics/V1b-T-literals-and-paths.md` — Tests (edited)
- `docs/plan_topics/coverage-matrix.md` — `lexical.md` (LEX) row (read-only)
- `docs/plan_topics/conventions.md` — *Tests.* leaf-format rule, *Diagnostic message anchors*, *REQ-ID discipline* (read-only)

## Spec Documents

- `docs/spec_topics/lexical.md` — String literals section (option-dependent — a stable anchor for the decode happy-path may need to be added here)
- `docs/spec_topics/diagnostics/code-registry-parse.md` — `loom/parse/illegal-escape`, `loom/parse/invalid-unicode-escape` rows (read-only — codes already registered)

## Affected Leaves

**Phases:** Vertical slice V1 — Lexer and literals

**Leaves (implementation order):**

- `V1b-T` — String, number, and path literals (tests) — (modified)
- `V1b` — String, number, and path literals — (modified)

## Consequence

**Severity:** correctness

The merged, un-cited bullet leaves both `loom/parse/illegal-escape` and `loom/parse/invalid-unicode-escape` without a verbatim-cited asserting test, so the `H5a` closing gate (which reconciles registry codes against asserting tests by exact code match) flags both codes as uncovered and fails CI at the terminal gate. Before that, two reasonable implementers diverge on which escape errors and which decode behaviour to assert — a single "string escape errors fire" assertion can pass while one code's path or the `\u{…}` decode is untested.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited leaf files `docs/plan_topics/V1b-literals-and-paths.md` and `docs/plan_topics/V1b-T-literals-and-paths.md` are untracked in the git work tree (`git status` reports `??`; only `conventions.md`, `coverage-matrix.md`, `leaf-template.md`, and `plan.md` are committed under the plan corpus). With no commit history for the files carrying the defect, the introducing change cannot be localised.

## Solution Space

**Shape:** single

### Recommendation

In both `V1b` and `V1b-T`, replace the merged second `Tests.` bullet with separate, individually-referenceable bullets so each escape behaviour is traceable:

- An error bullet citing `loom/parse/illegal-escape` verbatim: a backslash followed by an unrecognised character inside a string literal fires at the offending span.
- An error bullet citing `loom/parse/invalid-unicode-escape` verbatim: a recognised `\u{…}` escape whose value exceeds `U+10FFFF` or names a surrogate fires at the offending span.
- A happy-path bullet asserting `\u{…}` decodes to the correct Unicode scalar value, carrying a stable citation into `lexical.md` §*String literals*.

The two error codes are already in `code-registry-parse.md`, so those bullets are pure plan edits. The decode happy-path currently has no stable target: `lexical.md` §*String literals* carries no `<a id>` anchor. The implementer must give the decode bullet a stable spec citation — either by adding a stable anchor / GOV-16 inline label at that section in `lexical.md` and citing it, or by citing an existing stable identifier covering the decode rule. Keep the two leaves mirror-consistent: apply the identical split to `V1b` and `V1b-T`.

## Relationships

- T10 "V3b — first three `Tests.` bullets cite no registry code" — same-cluster (same merged-bullet / traceability pattern; resolves independently).
- T11 "`V4a` third Tests bullet conflates three match behaviours with no cited identifier" — same-cluster (same pattern; resolves independently).
- T14 "V10c second Tests bullet conflates a malformed-settings diagnostic with debounce coalescence and cites a wildcard code" — same-cluster (same pattern; resolves independently).
- T15 "V11d second `Tests.` bullet conflates AJV revalidation and `(default)` annotation with no spec identifier" — same-cluster (same pattern; resolves independently).

---

# T10 — V3b first three `Tests.` bullets cite no registry code

**Original heading:** First three Tests bullets have no spec identifier
**Original section:** V3b — Bindings
**Kind:** traceability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`bindings.md` is a code-keyed obligation area (BNDS prefix), and `coverage-matrix.md` names `V3b` as its closing leaf. The closing gate (`H5a`) reconciles the diagnostic-code registry against the codes asserted by tests; per `conventions.md` *REQ-ID discipline*, a registry code with no asserting test is a CI failure. A `Tests.` bullet can only close a code if it cites that code registry-exact.

Three of `V3b`'s four `Tests.` bullets name no code, only prose:

- "A reassignment of a `let` binding fires the parse-phase rebind diagnostic."
- "Member/index assignment and reassignment in an immutable context fire their parse codes."
- "`++`/`--` are rejected."

Every behaviour these describe maps to a registered code in `code-registry-parse.md` (`loom/parse/immutable-rebinding`, `loom/parse/assignment-to-member-or-index`, `loom/parse/mut-on-immutable-context`, `loom/parse/increment-decrement`), yet none is named. The prose cannot be mechanically matched to a registry row, and the second bullet bundles two distinct codes into one line. The same three bullets appear verbatim in `V3b-T`, so the defect is mirrored on both sides of the paired leaf.

## Plan Documents

- `docs/plan_topics/V3b-bindings.md` — `Tests.` (edited)
- `docs/plan_topics/V3b-T-bindings.md` — `Tests.` (edited)
- `docs/plan_topics/coverage-matrix.md` — `bindings.md` (BNDS) → `V3b` row (read-only)
- `docs/plan_topics/conventions.md` — REQ-ID discipline / Diagnostic message anchors (read-only)

## Spec Documents

- `docs/spec_topics/diagnostics/code-registry-parse.md` — bindings parse-code rows (read-only)
- `docs/spec_topics/bindings.md` — Bindings and Mutability (read-only)

None of the codes the fix cites are missing from the registry, so no spec edit is required.

## Affected Leaves

**Phases:** Vertical V3

**Leaves (implementation order):**

- `V3b` — Bindings and mutability — (modified)
- `V3b-T` — Bindings and mutability (tests) — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge on which registry codes the prose bullets stand for — in particular "reassignment in an immutable context" is ambiguous between `loom/parse/immutable-rebinding` and `loom/parse/mut-on-immutable-context`, and the bundled second bullet can leave a registry code with no asserting test. An unasserted bindings code then trips the `H5a` closing gate, or ships uncovered if the gate is read loosely.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited plan leaf files (`docs/plan_topics/V3b-bindings.md` and `docs/plan_topics/V3b-T-bindings.md`) are untracked in the git work tree (`git status` reports `??`), so the defect cannot be localised to any commit.

## Solution Space

**Shape:** single

### Recommendation

In `V3b` `Tests.`, replace the three prose bullets with registry-exact code citations, one code per bullet, and mirror the same bullets into `V3b-T` `Tests.` (the two leaves must stay bullet-identical). Draw every code verbatim from `code-registry-parse.md`:

- Reassignment of a `let` binding → `loom/parse/immutable-rebinding`.
- Member/index assignment (`obj.field = …` / `arr[i] = …`) → `loom/parse/assignment-to-member-or-index`.
- Reassignment of a binding in an immutable context (function param, `for` variable, `match` binding) → `loom/parse/immutable-rebinding`; if the intended behaviour is instead the `mut` modifier on such a context, use `loom/parse/mut-on-immutable-context`. Pick the code that matches the behaviour the test drives, and give it its own bullet rather than bundling it with member/index assignment.
- `++` / `--` rejected → `loom/parse/increment-decrement`.

The fourth bullet already cites `loom/parse/let-without-initialiser` and needs no change. Per `conventions.md` *Diagnostic message anchors*, any bullet that also asserts the rendered message must source the expected string from the registry *Message* column.

## Relationships

- T09 "V1b escape-sequence Tests bullet merges error-detection and decoding without citing any code or anchor" — same-cluster (same traceability rule; resolves independently).
- T11 "`V4a` third Tests bullet conflates three match behaviours with no cited identifier" — same-cluster (same traceability rule).
- T14 "V10c second Tests bullet conflates a malformed-settings diagnostic with debounce coalescence and cites a wildcard code" — same-cluster (same traceability rule).

---

# T11 — `V4a` third Tests bullet conflates three match behaviours with no cited identifier

**Original heading:** Last Tests bullet merges three independent behaviors
**Original section:** V4a — Match / Result
**Kind:** traceability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V4a` (`match`, `?`, and `Result`) closes the `match` construct, but its third `Tests.` bullet —

> `match` exhaustiveness over the six patterns; a non-matching value raises `MatchError`; arm result type is the LUB of arms.

— bundles three independently-failing behaviours into one prose sentence and cites no REQ-ID or diagnostic code for any of them. The `conventions.md` *Leaf format* rule requires one bullet per REQ-ID with the identifier cited inline; this bullet violates both the one-behaviour-per-bullet shape and the cite-the-identifier rule, even though stable identifiers exist for two of the three behaviours:

- **Destructuring over the six pattern forms** — positive `match` semantics over the wildcard / identifier / literal / constructor / object-schema / array patterns (`errors-and-results/error-model.md` *Pattern grammar*). No diagnostic code; this is positive behaviour.
- **Non-matching value raises `MatchError`** — the registered runtime panic `loom/runtime/match-error` (`errors-and-results/error-model.md` *Exhaustiveness* / *Runtime panics*). Note the spec is explicit that exhaustiveness is **not** statically checked in loom 1.0 — there is no parse-phase non-exhaustive-match code; the only surface is the runtime `MatchError` panic. This same code is already closed by `V4b` (Runtime panics), whose first `Tests.` bullet asserts `loom/runtime/match-error`.
- **Arm result type is the LUB of arms** — the registered type-phase code `loom/parse/match-arm-type-mismatch` (`errors-and-results/error-model.md` *Arm syntax*; `type-system.md` closed type-mismatch family).

The identical merged bullet appears in the paired tests leaf `V4a-T`.

## Plan Documents

- `docs/plan_topics/V4a-match-result.md` — Tests (third bullet) (edited)
- `docs/plan_topics/V4a-T-match-result.md` — Tests (third bullet) (edited)
- `docs/plan_topics/V4b-runtime-panics.md` — Tests (`loom/runtime/match-error` already closed here) (read-only)
- `docs/plan_topics/conventions.md` — Leaf format (one-bullet-per-REQ-ID rule) (read-only)

## Spec Documents

- `docs/spec_topics/errors-and-results/error-model.md` — Pattern grammar / Exhaustiveness / Arm syntax / Runtime panics (option-dependent)
- `docs/spec_topics/type-system.md` — Type compatibility / `match-arm-type-mismatch` (read-only)
- `docs/spec_topics/diagnostics/code-registry-parse.md`, `code-registry-runtime.md` — registry rows for the cited codes (read-only)

The only possible spec touch is option-dependent: if the positive-destructuring facet is given its own bullet and no existing stable anchor is reused, the *Pattern grammar* section of `error-model.md` may need an `<a id>` anchor (or a GOV-16 inline label) to cite. The behaviours with registered codes (`loom/runtime/match-error`, `loom/parse/match-arm-type-mismatch`) need no spec edit.

## Affected Leaves

**Phases:** V4 — Errors and results

**Leaves (implementation order):**

- `V4a` — `match`, `?`, and `Result` — (modified)
- `V4a-T` — `match`, `?`, and `Result` (tests) — (modified)

## Consequence

**Severity:** correctness

A faithful implementer reads one vague bullet and writes a single test, leaving the type-phase arm-type-mismatch facet (`loom/parse/match-arm-type-mismatch`) and the positive six-pattern destructuring semantics unasserted, while a second implementer covers all three — two leaves that both claim to "close `match`" diverge. A single "third bullet failed" gives the reviewer no way to tell which of the three obligations regressed, and the H5a closing gate cannot reconcile uncited codes to this leaf.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The plan-leaf files carrying the defect — `docs/plan_topics/V4a-match-result.md` and its paired `docs/plan_topics/V4a-T-match-result.md` — are untracked in the repository (`git status` reports them `??`; `git ls-files` returns nothing for either). They have never been committed, so there is no version history to attribute the introducing change. A `git log -S "exhaustiveness over the six patterns" --all` search returns no commits. The surrounding corpus is git-tracked (e.g. `conventions.md`, `coverage-matrix.md`), but the defect token exists only in the working tree.

## Solution Space

**Shape:** single

### Recommendation

Replace the single third `Tests.` bullet in `docs/plan_topics/V4a-match-result.md` and the identical bullet in `docs/plan_topics/V4a-T-match-result.md` with separate, identifier-carrying bullets so each behaviour fails independently and is reconcilable by the closing gate:

- A bullet for the type-phase arm-result-type rule citing `loom/parse/match-arm-type-mismatch`: a `match` whose arm bodies do not share a common upper bound under type compatibility fires `loom/parse/match-arm-type-mismatch`, and a well-typed `match` resolves to the LUB of its arms.
- A bullet for the runtime non-exhaustive panic citing `loom/runtime/match-error`. Because `V4b` already closes `loom/runtime/match-error`, either reference that coverage in the bullet or co-assert it here (the coverage matrix is many-to-many); do not leave the code uncited in both leaves.
- A bullet for positive destructuring over the six pattern forms (wildcard, identifier, literal, constructor, object/schema, array). This facet has no diagnostic code; cite a stable anchor in `errors-and-results/error-model.md` *Pattern grammar*. If no such anchor exists, the fix may add an `<a id>` (or GOV-16 inline label) to that section in a spec-first commit and cite it, or fold the positive-destructuring assertion into the `loom/runtime/match-error` bullet as a successfully-matched companion case.

Keep `V4a` and `V4a-T` mirror-consistent — the same bullet set in both.

Edge cases for the implementer: (a) the spec explicitly forbids a parse-phase exhaustiveness check, so do not introduce or cite a non-exhaustive-match parse code — the only non-exhaustive surface is the runtime `loom/runtime/match-error` panic; (b) confirm whether `V4a` should re-assert `loom/runtime/match-error` or defer to `V4b` before duplicating the assertion.

## Relationships

- T27 "V17a leaves three normative cancellation MUSTs with no asserting test" — same-cluster (the `V17a` Tests block carries the same one-bullet-conflates-multiple-behaviours pattern; resolves independently).
- T09 "V1b escape-sequence Tests bullet merges error-detection and decoding without citing any code or anchor" — same-cluster (same defect class).
- T10 "V3b — first three `Tests.` bullets cite no registry code" — same-cluster (same defect class).
- T14 "V10c second Tests bullet conflates a malformed-settings diagnostic with debounce coalescence and cites a wildcard code" — same-cluster (same defect class).
- T15 "V11d second `Tests.` bullet conflates AJV revalidation and `(default)` annotation with no spec identifier" — same-cluster (same defect class).

---

# T12 — `V6b` defers `params` validation to the `SchemaValidator` seam without depending on its owning leaf

**Original heading:** Assumes the SchemaValidator seam (V8a) without listing it
**Original section:** V6b — Params and defaults
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V6b` (`params` and defaults) carries the binding `Tests.` bullet "`params` are validated through AJV against their lowered schema," and its `Ships when` gate asserts the same. AJV validation is the `SchemaValidator` seam — defined as a one-pass multi-error AJV wrapper (no coercion/defaulting, deterministic, slug-cache byte-verify) — and that seam is owned by `V8a`'s `Adds.`/`Tests.` (`PIC-11`). `V6b`'s ship-gate therefore exercises behaviour `V8a` provides.

`V6b` `Deps.` are `V6b-T, V6a, V5d`. None of these reaches `V8a`: `V6a` resolves to `{V6a-T, V1a, V5a}` and `V5d` to `{V5d-T, V5a, V5b, V2d}`, and `V8a`'s only prerequisites are `{V8a-T, H3a}`. The dependency on the validation behaviour the leaf's gate relies on is unstated. The paired tests leaf `V6b-T` carries the identical AJV-validation bullet and the identical gap (`Deps. V6a, V5d`).

Sibling leaves that consume the same seam already declare it: `V11c`/`V11c-T` and `V9c`/`V9c-T` both list `V8a` in `Deps.` (`V17a`/`V17a-T` likewise). The omission on the `V6b` pair is an outlier against that established pattern, not a deliberate decoupling.

## Plan Documents

- `docs/plan_topics/V6b-params-defaults.md` — `Deps.` field (edited)
- `docs/plan_topics/V6b-T-params-defaults.md` — `Deps.` field (edited)
- `docs/plan_topics/V8a-checkpoint-validator-seams.md` — `SchemaValidator` seam owner (read-only)
- `docs/plan_topics/conventions.md` — leaf-format `Deps.` rule (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** V6

**Leaves (implementation order):**

- `V6b-T` — `params` and defaults (tests) — (modified)
- `V6b` — `params` and defaults — (modified)

## Consequence

**Severity:** correctness

Under dep-driven selection (How-to-use step 3), `V6b`/`V6b-T` are scheduled "ready" once `V6a`/`V5d`/`V6b-T` are complete, with no edge forcing `V8a` first. An implementer reaching the AJV-validation gate before `V8a` exists either blocks, or inlines a local validator that diverges from `V8a`'s one-pass / no-coercion / slug-cache `SchemaValidator` contract — and the ship-gate ("validates `params` through AJV") goes green either way, masking the divergence.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited plan leaf `docs/plan_topics/V6b-params-defaults.md` (and the `V8a` seam leaf whose dependency it omits) are untracked working-tree files; under `docs/plan_topics/` only `conventions.md`, `coverage-matrix.md`, and `leaf-template.md` are committed. The `Deps.` omission therefore cannot be localised to any commit.

## Solution Space

**Shape:** single

### Recommendation

Add `V8a` to the `Deps.` field of `V6b` and of `V6b-T`, keeping the implementation/tests pair mirror-consistent. `V6b` `Deps.` becomes `V6b-T, V6a, V5d, V8a`; `V6b-T` `Deps.` becomes `V6a, V5d, V8a`. This matches the existing seam-consumer leaves `V11c`/`V11c-T` and `V9c`/`V9c-T`, which list `V8a` because their gates exercise the `SchemaValidator` seam.

The `SchemaValidator` contract already exists in the spec (`host-interfaces-core.md`, closed by `V8a`/`PIC-11`); this fix is internal to the two plan leaves and must not touch the spec.

## Relationships

- T02 "V2b ship-gate references the runtime AJV validator seam (V8a) outside its declared dependency closure" — same-cluster (the same `V8a`-not-in-`Deps.` omission on `V2b`, where an alternative deferral-marker framing is also in play; resolves independently).

---

# T13 — `V6e`/`V6e-T` assert a non-existent `loom/parse/...` diagnostic code instead of the registered `loom/load/frontmatter-value-out-of-range`

**Original heading:** Wrong diagnostic namespace: `loom/parse/frontmatter-value-out-of-range`
**Original section:** V6e — Respond-repair / tool-loop
**Kind:** codebase-grounding-broad, consistency, naming
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V6e` and its paired test leaf `V6e-T` both carry a Tests bullet asserting the diagnostic code `loom/parse/frontmatter-value-out-of-range` for out-of-range `tool_loop.max_rounds` / `respond_repair.attempts`. No such code exists anywhere in the corpus. The diagnostics registry registers this diagnostic under the **load** phase as `loom/load/frontmatter-value-out-of-range` (`docs/spec_topics/diagnostics/code-registry-load.md`), and FRNT-1 in `frontmatter-fields-b-and-templates.md` likewise names the load-phase form ("rejected at frontmatter-parse time as `loom/load/frontmatter-value-out-of-range`"). The `parse` vs `load` boundary is a real phase distinction in the registry's namespace scheme, so `loom/parse/...` is not an alias — it is a phantom code.

The two leaves are a mirrored implementation/test pair, and both repeat the same wrong namespace verbatim, so the error is consistent between them but wrong in both.

The `H5a` closing-gate reconciles test-asserted diagnostic codes against the registry in both directions. A faithful implementer who writes the test exactly as the plan states produces two reconciliation failures at once: (a) an asserted code (`loom/parse/...`) with no registry row, and (b) a registry code (`loom/load/frontmatter-value-out-of-range`) with no asserting test — leaving the real diagnostic uncovered.

## Plan Documents

- `docs/plan_topics/V6e-respond-repair-tool-loop.md` — Tests (edited)
- `docs/plan_topics/V6e-T-respond-repair-tool-loop.md` — Tests (edited)
- `docs/plan_topics/H5a-closing-gate-automation.md` — closing-gate reconciliation (read-only)

## Spec Documents

- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/frontmatter-value-out-of-range` row (read-only)
- `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md` — FRNT-1 (read-only)

## Affected Leaves

**Phases:** Vertical (V6 — Frontmatter)

**Leaves (implementation order):**

- `V6e-T` — `respond_repair` and `tool_loop` (tests) — (modified)
- `V6e` — `respond_repair` and `tool_loop` — (modified)

## Consequence

**Severity:** correctness

An implementer following the plan literally writes a test asserting a diagnostic code that does not exist, while the registered `loom/load/frontmatter-value-out-of-range` ships with no asserting test. The `H5a` reconciliation gate then red-fails on both arms (asserted-code-without-row and registry-code-without-test), and the real range-check diagnostic is left effectively uncovered.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited plan leaf files (`docs/plan_topics/V6e-respond-repair-tool-loop.md` and its paired test leaf `V6e-T-respond-repair-tool-loop.md`) are untracked working-tree additions — `git status` reports both as `??`, and `git log -S 'loom/parse/frontmatter-value-out-of-range' -- docs/` returns no commits — so the defect's introduction cannot be localised to any commit. The repository is a git work tree, but these two files have never been committed.

## Solution Space

**Shape:** single

### Recommendation

In both `docs/plan_topics/V6e-respond-repair-tool-loop.md` and `docs/plan_topics/V6e-T-respond-repair-tool-loop.md`, in the second Tests bullet, replace the asserted code `loom/parse/frontmatter-value-out-of-range` with `loom/load/frontmatter-value-out-of-range`. The bullet text becomes:

```
- `loom/load/frontmatter-value-out-of-range`: out-of-range `max_rounds` or `respond_repair.attempts` fires.
```

Apply the identical edit to both leaves so the implementation/test pair stays mirror-consistent. The corrected code matches the registry row in `code-registry-load.md` and the FRNT-1 wording in `frontmatter-fields-b-and-templates.md`; no spec edit is required (the registry already carries the correct load-phase code).

## Relationships

- T21 "Asserted diagnostic code `loom/parse/empty-enum-body` is absent from the parse registry" — same-cluster (same defect class — a `loom/parse/...` code asserted by a leaf but absent from the registry; resolves independently in `V5a`).
- T04 "Truncated diagnostic code: `V5b` cites `loom/parse/duplicate-discriminator`, registry has `loom/parse/duplicate-discriminator-value`" — same-cluster (asserted code mismatches its registry row; resolves independently).
- T05 "Bare diagnostic code `binder-model-strict-capability-unknown` missing `loom/load/` prefix" — same-cluster (asserted-code/registry mismatch in `V11a`; resolves independently).
- T03 "`DIAG-2` describes a `src/**` emission scan the closing gate does not perform" — decision-overlap (the asserting-test↔registry reconciliation scope of the `H5a` gate that surfaces this finding is the subject of that finding).

---

# T14 — V10c second Tests bullet conflates a malformed-settings diagnostic with debounce coalescence and cites a wildcard code

**Original heading:** Second Tests bullet merges two behaviors and uses a wildcard code
**Original section:** V10c — Settings merge
**Kind:** traceability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V10c`'s second `Tests.` bullet reads: "A malformed settings file fires its `loom/load/*` code; the reload debounce coalesces rapid edits." It packs two unrelated obligations into one bullet — a load-phase malformed-settings diagnostic and the watcher debounce coalescing rapid edits — that fail independently. A single red bullet does not localise which obligation broke, and a reviewer cannot tell which spec rule the bullet closes.

The diagnostic half cites `loom/load/*`, a wildcard. The settings load path registers several distinct codes (`loom/load/settings-unreadable`, `loom/load/settings-invalid-json`, `loom/load/settings-invalid-entry`, `loom/load/settings-value-out-of-range`), so `loom/load/*` is not a registry-exact identifier and cannot be reconciled against the diagnostic-code registry by the `H5a` closing gate. Two reasonable implementers would pick different concrete codes for "a malformed settings file."

The debounce half ("the reload debounce coalesces rapid edits") names no anchor at all, though the behaviour is normatively pinned at `package-and-settings.md` `#caching-and-reload` (the 250 ms drop-and-reschedule window). The same defect is present verbatim in the paired `V10c-T` leaf.

## Plan Documents

- `docs/plan_topics/V10c-settings-merge.md` — `Tests.` (edited)
- `docs/plan_topics/V10c-T-settings-merge.md` — `Tests.` (edited)

## Spec Documents

- `docs/spec_topics/discovery/package-and-settings.md` — "Settings file reads → Failure modes" and `#caching-and-reload` (read-only)
- `docs/spec_topics/diagnostics/code-registry-load.md` — settings-code rows (read-only)

## Affected Leaves

**Phases:** V10 — Discovery and settings

**Leaves (implementation order):**

- `V10c-T` — Settings reads and merge (tests) — (modified)
- `V10c` — Settings reads and merge — (modified)

## Consequence

**Severity:** correctness

A `loom/load/*` wildcard is not a registry-exact code, so the `H5a` closing gate cannot reconcile it and two implementers would assert different concrete settings codes for the same bullet. Merging the malformed-settings diagnostic with debounce coalescence means a single failing assertion does not point at a specific obligation, and the unanchored debounce half is unverifiable against the spec.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited plan leaf files `docs/plan_topics/V10c-settings-merge.md` and `docs/plan_topics/V10c-T-settings-merge.md` are untracked in the git work tree (never committed), so the defect cannot be localised to any commit.

## Solution Space

**Shape:** single

### Recommendation

In both `V10c` and `V10c-T`, replace the single second `Tests.` bullet with two separate bullets, keeping the two leaves mirror-consistent:

1. A registry-exact malformed-settings code. For an invalid-JSON settings file, the bullet's code is `loom/load/settings-invalid-json` (a settings file present but not valid UTF-8 JSON, per `package-and-settings.md` "Settings file reads → Failure modes" and the row in `code-registry-load.md`). If the intended test malformation is an out-of-range recognised key rather than invalid JSON, cite `loom/load/settings-value-out-of-range` instead; pick the one code that matches the test's malformation. Do not retain a `loom/load/*` wildcard.
2. The debounce-coalescence behaviour, citing the stable anchor `[package-and-settings.md#caching-and-reload]`: a burst of rapid watcher events coalesces into a single reload via the 250 ms drop-and-reschedule window.

The spec is read-only for this fix — the codes and the `#caching-and-reload` anchor already exist; no spec edit is required.

## Relationships

- T09 "V1b escape-sequence Tests bullet merges error-detection and decoding without citing any code or anchor" — same-cluster (same merged-bullet + missing-identifier pattern; resolves independently).
- T10 "V3b — first three `Tests.` bullets cite no registry code" — same-cluster (same pattern).
- T11 "`V4a` third Tests bullet conflates three match behaviours with no cited identifier" — same-cluster (same pattern).
- T15 "V11d second `Tests.` bullet conflates AJV revalidation and `(default)` annotation with no spec identifier" — same-cluster (same pattern).
- T27 "V17a leaves three normative cancellation MUSTs with no asserting test" — same-cluster (the `V17a` Tests block shares the one-bullet-per-obligation discipline gap).

---

# T15 — V11d second `Tests.` bullet conflates AJV revalidation and `(default)` annotation with no spec identifier

**Original heading:** Second Tests bullet merges two behaviors with no spec identifier
**Original section:** V11d — Defaulting echo
**Kind:** traceability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V11d`'s second `Tests.` bullet reads "Defaulting fills absent args then re-validates through AJV; `(default)` annotates only default-supplied args." It bundles two independent obligations from `defaulting-system-note-echo.md`: (1) the **fill-if-absent + post-default-merge AJV** path — the runtime fills declared defaults for absent wire names, then `SchemaValidator.validate()` re-validates the merged `args` (the section's named hook at `#post-default-merge-ajv-validation`); and (2) the **echo annotation rule** — only a field that took its declared default is tagged `(default)`, while a binder-supplied value for a defaulted field is rendered untagged (the "Defaulted fields tagged `(default)`" format rule under `#echo-policy`, within the BNDR-6 echo area).

The two behaviors fail independently and live in different parts of the spec topic, yet the bullet cites no REQ-ID, diagnostic code, or section anchor for either. A reader cannot tell which obligation a red test closes, and a single conflated assertion can pass while one of the two sub-behaviors is silently broken. The same merged bullet appears verbatim in the paired `V11d-T`.

This violates the `conventions.md` *Leaf format* rule that each `Tests.` bullet cite the identifier of the obligation it claims to close, and leaves the fill-if-absent/AJV and `(default)`-tagging behaviours untraceable to the spec.

## Plan Documents

- `docs/plan_topics/V11d-defaulting-echo.md` — Tests (edited)
- `docs/plan_topics/V11d-T-defaulting-echo.md` — Tests (edited)
- `docs/plan_topics/coverage-matrix.md` — BNDR-6 → `V11d` mapping (read-only)

## Spec Documents

- `docs/spec_topics/binder/defaulting-system-note-echo.md` — `#post-default-merge-ajv-validation`, `#echo-policy` (read-only)

## Affected Leaves

**Phases:** V11 (Binder)

**Leaves (implementation order):**

- `V11d` — System-prompt builder, defaulting, and echo — (modified)
- `V11d-T` — System-prompt builder, defaulting, and echo (tests) — (modified)

## Consequence

**Severity:** correctness

A failing "second bullet" is ambiguous across two independent obligations, and neither is checkable against the spec or registry. Two reasonable implementers could write a single conflated test that stays green while one sub-behaviour (e.g. the `(default)`-only-when-default-supplied tagging, or the post-merge AJV revalidation) ships broken, and the closing gate cannot attribute the coverage.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited leaf files `docs/plan_topics/V11d-defaulting-echo.md` and `docs/plan_topics/V11d-T-defaulting-echo.md` are untracked in the git work tree (status `??`; only `conventions.md`, `coverage-matrix.md`, and `leaf-template.md` are committed under `docs/plan_topics/`). No commit has ever recorded these files, so the defect cannot be localised to an introducing commit.

## Solution Space

**Shape:** single

### Recommendation

Decompose the merged second `Tests.` bullet in `V11d` (and identically in `V11d-T`) so each behaviour is independently referenceable against a cited spec anchor:

- One bullet for the fill-then-revalidate path, citing `[defaulting-system-note-echo.md#post-default-merge-ajv-validation]` — fill-if-absent on absent wire names, then `SchemaValidator.validate()` re-validation of the merged `args`.
- One bullet for the annotation rule, citing `[defaulting-system-note-echo.md#echo-policy]` (the "Defaulted fields tagged `(default)`" format rule in the BNDR-6 echo area) — `(default)` is rendered only for a field that took its declared default, and a binder-supplied value for a defaulted field is untagged.

Keep `V11d` and `V11d-T` mirror-consistent (the TDD pairing requires the tests-task and implementation-task bullet lists to match). Both anchors already exist in `defaulting-system-note-echo.md`; the spec is read-only for this fix.

(Note: `V11d`'s post-merge AJV re-validation also exercises the `V8a` `SchemaValidator` seam; whether `V11d`/`V11d-T` `Deps.` should list `V8a` is the same omission pattern tracked at T12/T02 and resolves independently.)

## Relationships

- T09 "V1b escape-sequence Tests bullet merges error-detection and decoding without citing any code or anchor" — same-cluster (same one-bullet-per-obligation + traceability rule).
- T11 "`V4a` third Tests bullet conflates three match behaviours with no cited identifier" — same-cluster (same convention).
- T14 "V10c second Tests bullet conflates a malformed-settings diagnostic with debounce coalescence and cites a wildcard code" — same-cluster (same convention).
- T27 "V17a leaves three normative cancellation MUSTs with no asserting test" — same-cluster (same convention in `V17a`).

---

# T16 — Cancellation test bullet keyed by one diagnostic conflates four independent obligations

**Original heading:** Last Tests bullet merges four independent behaviors
**Original section:** V17a — Cancellation core
**Kind:** traceability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The final `Tests.` bullet in `V17a-T` (and the mirrored bullet in `V17a`) is labelled with the diagnostic code `loom/parse/timeout-field-rejected` but bundles four unrelated obligations under that one key: (1) cancellation forwards via `loomAbort`, never `ctx.signal` directly; (2) cancellation propagates downward only; (3) a swallowing handler suppresses the late side-channel; and (4) `loom/parse/timeout-field-rejected` fires on a `timeout:` field. Each maps to a distinct spec obligation in `cancellation.md` — behaviours 1–3 are runtime cancellation rules (the *Signal source* / *Forwarding into `loomAbort`* section, the *Propagation* section, and the *Race semantics — swallowing-handler attachment* section, respectively), while behaviour 4 is a parse-phase diagnostic stated in the closing paragraph of `cancellation.md`.

Keying four obligations under a single bullet means a red result does not localise which obligation regressed, and the closing gate cannot detect that any subset of the four was left unasserted while the bullet still "exists". The mis-keying is compounded by behaviour 4 being a parse-phase concern that is already owned and asserted elsewhere: `V6a` / `V6a-T` (*frontmatter contract*) already carry `loom/parse/timeout-field-rejected` as the NOCEIL-1 seam ("a per-call timeout field is rejected"). The parse diagnostic therefore has no business gating a runtime-cancellation leaf, and its presence in this bullet is a double-coverage / cross-phase attribution error rather than a missing assertion.

## Plan Documents

- `docs/plan_topics/V17a-T-cancellation-core.md` — `Tests.` bullet (edited)
- `docs/plan_topics/V17a-cancellation-core.md` — `Tests.` bullet (edited)
- `docs/plan_topics/V6a-T-frontmatter-contract.md` — `Tests.` bullet (read-only)
- `docs/plan_topics/V6a-frontmatter-contract.md` — `Tests.` bullet (read-only)
- `docs/plan_topics/coverage-matrix.md` — `CNCL-1, CNCL-2, CNCL-3 → V17a` row (read-only)

## Spec Documents

- `docs/spec_topics/cancellation.md` — *Signal source* / *Forwarding into `loomAbort`*, *Propagation*, *Race semantics — swallowing-handler attachment*, and the closing `timeout:`-field paragraph (read-only)

## Affected Leaves

**Phases:** Vertical (V17, V6)

**Leaves (implementation order):**

- `V6a` — Frontmatter contract — (read-only context; already owns `loom/parse/timeout-field-rejected` / NOCEIL-1)
- `V6a-T` — Frontmatter contract (tests) — (read-only context; already asserts the parse diagnostic)
- `V17a` — Cancellation core — (modified)
- `V17a-T` — Cancellation core (tests) — (modified)

## Consequence

**Severity:** correctness

A single bullet covering four obligations gives the closing gate one done-condition where there should be four; an implementer can satisfy "the bullet" by asserting any subset, and a red result cannot point to the specific obligation that broke. Bundling the parse-phase `loom/parse/timeout-field-rejected` diagnostic — already owned by `V6a`/`V6a-T` — into a runtime-cancellation test leaf also misattributes a parse concern across phases and creates redundant double-coverage that two reasonable implementers would resolve differently.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited plan-topic files `docs/plan_topics/V17a-cancellation-core.md` and `docs/plan_topics/V17a-T-cancellation-core.md` are untracked in the working tree (`git ls-files --error-unmatch` reports "did not match any file(s) known to git"); they have never been committed, so no introducing commit exists in history to attribute the merged bullet to. The repository itself is git-tracked, but the defect lives entirely in uncommitted working-tree content.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/V17a-T-cancellation-core.md`, replace the single `loom/parse/timeout-field-rejected (...)` `Tests.` bullet with three separate runtime-cancellation bullets, each citing its own `cancellation.md` section:

- a bullet asserting cancellation forwards through `loomAbort` and never through `ctx.signal` directly — citing `cancellation.md` *Signal source* / *Forwarding into `loomAbort`*;
- a bullet asserting downward-only propagation (parent → child / in-flight, never child → parent) — citing `cancellation.md` *Propagation*;
- a bullet asserting the swallowing handler suppresses the late side-channel on an abandonable Promise (no Node `unhandledRejection`, no second `RuntimeEvent`, no diagnostic) — citing `cancellation.md` *Race semantics — swallowing-handler attachment on every abandonable Promise*.

Strike the `loom/parse/timeout-field-rejected` / `timeout:`-field clause from this leaf entirely: that parse-phase obligation is already owned and gated by `V6a` / `V6a-T` (NOCEIL-1 seam), so it does not belong in a runtime-cancellation test leaf. If traceability from `cancellation.md`'s closing `timeout:` paragraph is wanted, record it as a `Spec.` cross-reference to `V6a` rather than as a duplicate gating bullet here.

Apply the identical split-and-strike to the mirrored `Tests.` bullet in `docs/plan_topics/V17a-cancellation-core.md` so the implementation leaf and its test leaf stay in lockstep, and adjust that leaf's `Ships when.` only if it references the removed parse-diagnostic behaviour (it currently does not).

Edge case for the implementer: the swallowing-handler obligation spans four Promise sites (code-side `execute()`, `@`-query provider, `invoke` child top-level, subagent `AgentSession.abort()`), and the no-side-channel guarantee is total along three channels — keep that assertion at the `Checkpoint`-seam test substrate (`V8a` dep) rather than splitting it per-site, since the spec states the rule uniformly.

## Relationships

- T27 "V17a leaves three normative cancellation MUSTs with no asserting test" — same-cluster (same `V17a-T` `Tests.` block; adds missing assertions while this one re-keys existing ones; resolve independently).
- T26 "Cancellation checkpoint granularity set unverified" — same-cluster (same `V17a-T` `Tests.` block; adds checkpoint-granularity assertions; resolve independently).

---

# T17 — Version-bump acceptance is build-time surface checks only — no runtime-evidence gate or revert path

**Original heading:** Version-bump has no runtime recovery or revert path
**Original section:** V18c — Pi version-bump procedure
**Kind:** risk
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V18c`'s acceptance is entirely build-time and surface-shaped. Its `Tests.` and `Ships when` gate only on the step-2(a)/2(b) SDK surface-inventory assertions, the `engines.node` literal-read, the `peerDependencies` tilde-pin assertion, and the `loom/typecheck/session-shutdown-reason-snapshot` brand-string gate. Every one of these proves that the *typed surface* and the pinned literals are consistent at the new pin; none of them exercises the loom against the bumped SDK at runtime. A Pi minor bump can therefore pass all four gates while regressing behaviour behind an unchanged surface — a `prompt`-body sequencing change, an `AgentSession` streaming-order shift, a forced-tool semantic change, and similar — and `V18c` reports the bump green on `main`.

The spec already delegates two adjacent concerns elsewhere, and this finding does not re-litigate them: loom-side *recovery behaviour* for a falsified host presupposition is an explicit non-goal of the procedure ([`version-bump-intro.md` §Non-goals (a)](../../docs/spec_topics/pi-integration-contract/version-bump-intro.md)), and runtime tolerance for `SessionShutdownEvent['reason']` union skew is owned by the [Patch-skew degradation contract](../../docs/spec_topics/pi-integration-contract/patch-skew-degradation.md). Neither closes the gap here. The patch-skew contract covers only the reason-union facet; the editorial-review checklist (`version-bump-step2.md` items (a)–(aj)) audits enumerated presuppositions but is manual and ungated at the leaf, and none of it runs a representative integrated `.loom` end-to-end against the new pin. The procedure's own stated outputs ([`version-bump-triggers.md`](../../docs/spec_topics/pi-integration-contract/version-bump-triggers.md), closing paragraph) are "(a) a green build-time test run … and (b) a single bump commit" — there is no runtime-evidence acceptance step and no stated rollback when a bump is later found bad.

Two distinct obligations are missing: an acceptance gate that requires runtime evidence (the end-to-end harness passing against the new pin) before a bump is considered landed, and a defined revert path (restore the prior Pi-SDK pin literal and the four `peerDependencies` entries) for a bump that fails that evidence.

## Plan Documents

- `docs/plan_topics/V18c-version-bump-checklist.md` — `Adds.` / `Tests.` / `Ships when` (edited)
- `docs/plan_topics/V18c-T-version-bump-checklist.md` — `Tests.` / `Ships when` (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — end-to-end harness the runtime-evidence gate would invoke (read-only)
- `docs/plan.md` — V18 slice listing (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — procedure outputs / acceptance contract (option-dependent)
- `docs/spec_topics/pi-integration-contract/version-bump-intro.md` — §Non-goals (read-only context: recovery is delegated, acceptance gating is not)
- `docs/spec_topics/pi-integration-contract/patch-skew-degradation.md` — runtime tolerance for reason-union skew (read-only context)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — `#pi-sdk-pin` single-source-of-truth pin literal the revert path restores (read-only)

## Affected Leaves

**Phases:** V18 — Build-time SDK gates

**Leaves (implementation order):**

- `V18c` — Pi version-bump procedure and gates — (modified)
- `V18c-T` — Pi version-bump procedure and gates (tests) — (modified)

## Consequence

**Severity:** correctness

A Pi SDK minor bump that regresses runtime behaviour behind an unchanged typed surface passes every `V18c` gate and lands green on `main`, so the regression ships undetected; the acceptance criterion verifies surface consistency, not that the loom still works at the new pin. With no stated revert path, a bump later found to regress also has no defined rollback to the prior pin.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The defect lives in the `V18c` plan leaf (`docs/plan_topics/V18c-version-bump-checklist.md`) and its `-T` partner, both of which are untracked working-tree files that have never been committed. Under the plan corpus only `docs/plan.md`, `conventions.md`, `coverage-matrix.md`, and `leaf-template.md` are git-tracked; the per-leaf files are not, so the leaf's history cannot be walked and the defect cannot be localised to a commit.

## Solution Space

**Shape:** multiple

This finding carries two independent obligations on different ownership vectors — a plan-only revert path and a spec-first runtime-evidence acceptance gate. They are split into one option each; both are required.

### Option A — Revert path (plan-only)

**Approach.** State in `V18c` that a bump whose runtime-evidence step is red is *not* landed, and that recovery is to restore the prior pin. Reverting the bump is reverting step 4's edit: the single-source-of-truth Pi-SDK pin literal at `host-prerequisites.md#pi-sdk-pin` and the four `@earendil-works/*` `peerDependencies` entries (`pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-tui`) in one commit.

**Plan edits.** Add a `Ships when` clause (mirrored in `V18c-T`) stating that when the bump's acceptance evidence is red the prior pin literal and the four `peerDependencies` entries are restored in one commit before merge. Reference the pin anchor `host-prerequisites.md#pi-sdk-pin` rather than restating the literal.

**Spec edits.** None.

**Pros.** No spec dependency; bounds the leaf's rollback contract immediately.

**Cons.** Moot on its own — without Option B's gate there is no signal that triggers the revert.

**Risks.** If phrased to hard-depend on Option B's exact gate wording, it couples the two edits; phrase the revert trigger generically ("if the bump's acceptance evidence is red").

### Option B — Runtime-evidence acceptance gate (spec-first, then plan)

**Approach.** Extend the version-bump procedure's acceptance contract so a bump is landed only after a representative integrated `.loom` runs end-to-end through the `H4a` harness against the new pin (typed query + tool loop + invoke + schema validation + binder + cancellation), not on surface-inventory alone. Because the procedure's stated outputs are currently scoped to build-time in `version-bump-triggers.md` and recovery/runtime behaviour is a declared non-goal in `version-bump-intro.md`, strengthening the acceptance contract is a spec change — fix the spec first per the `conventions.md` *Spec drift* rule, then mirror into the leaf.

**Plan edits.** Add a `Tests.`/`Ships when` clause to `V18c` (mirrored in `V18c-T`) requiring the `H4a` end-to-end harness to pass against the bumped pin before the bump is considered complete.

**Spec edits.** Amend `version-bump-triggers.md`'s outputs paragraph (and reconcile `version-bump-intro.md` §Non-goals so the runtime-evidence acceptance step is not mistaken for the delegated loom-side recovery non-goal) to require the end-to-end runtime evidence at the new pin.

**Pros.** Closes the actual gap — catches behavioural regression behind an unchanged surface.

**Cons.** Larger, two-vector (spec + plan); depends on the `H4a` harness's fidelity to the real SDK at the new pin.

**Risks.** The `H4a` harness drives an in-process session double, not the real SDK; "harness passing against the new pin" gives false confidence unless the double's fidelity to the bumped SDK is asserted (see the related `H4a` fidelity-contract finding).

### Recommendation

Land Option A first — it is plan-only, scope-bounding, and has no spec dependency, so it establishes the leaf's rollback contract on a stable baseline. Then land Option B (spec-first edit to `version-bump-triggers.md`, then the `V18c`/`V18c-T` mirror), phrasing Option A's revert trigger generically so it does not hard-couple to Option B's gate wording. Both are required: Option B defines what "landed safely" means and Option A defines the rollback when it is not. Edge case the implementer must watch: the runtime-evidence gate runs through the `H4a` double, so its value is bounded by the double's fidelity to the bumped SDK — do not let a green double-backed harness be read as real-host coverage.

## Relationships

- T19 "Plan has no terminal end-to-end integration-acceptance leaf" — must-follow (a release-gate leaf running a representative `.loom` through the `H4a` harness end-to-end would supply the same mechanism Option B needs; build that first so this fix references it).
- T20 "H4a in-process Pi session double has no stated fidelity contract against the pinned SDK" — must-follow (Option B's gate runs against the `H4a` double; without the double's fidelity to the new pin asserted, "harness passing against the new pin" is false-green).

---

# T18 — Binder-call cancellation forwarding named in `V11f` `Adds.` but never asserted

**Original heading:** "cancellation forwarding into the binder call" named but not asserted
**Original section:** V11f — Hard-ceiling binder retry / templates
**Kind:** validation
**Importance:** medium
**Score:** 28
**MustFix:** false

## Finding

`V11f` `Adds.` lists "the cancellation forwarding into the binder call" as one of the leaf's obligations. The spec makes this a normative MUST in two places: `cancellation.md` *Granularity* states the runtime checks the signal "immediately before issuing the slash-command argument binder's LLM call (and the signal is forwarded to the binder model's provider invocation, so an abort observed *during* the binder call also surfaces)," and `determinism-cancellation-failure.md` *Cancellation* states the runtime "forwards the signal into the binder inference call as its `options.signal`; the initial attempt and every retry permitted by the per-invocation budget below honour the signal," with a cancelled binder producing the cancelled-binder system note and the loom not running.

None of `V11f`/`V11f-T`'s test bullets assert this behaviour. The bullets cover only the per-class retry budget (`HC3-a`…`HC3-e`) and that the six failure templates render verbatim; `Ships when` asserts only "the per-class retry caps (≤3 calls) and the six verbatim templates." The six-template bullet does include the cancelled-binder row (`loom /<name>: argument binding cancelled`), but rendering that note verbatim only exercises the note's *text* once the cancelled state is reached — it does not assert the *forwarding wiring* that routes a mid-call abort into the provider invocation and surfaces it as the cancelled-binder outcome. A pre-call abort (the pre-binder checkpoint, owned by `V17a`) would satisfy the verbatim-rendering test without ever forwarding the signal into the in-flight binder call.

`V17a` (cancellation core) names "the fixed checkpoint set (including pre-binder)" and a generic `loomAbort` forwarding bullet, but asserts neither the binder-specific `options.signal` forwarding into the provider call nor the abort-during-binder-call → cancelled-binder path. The obligation therefore binds to no asserting test in any leaf.

## Plan Documents

- `docs/plan_topics/V11f-binder-retry-taxonomy.md` — Tests / Ships when (edited)
- `docs/plan_topics/V11f-T-binder-retry-taxonomy.md` — Tests / Ships when (edited)
- `docs/plan_topics/V17a-cancellation-core.md` — Adds. / Tests (read-only)

## Spec Documents

- `docs/spec_topics/cancellation.md` — Granularity (binder-call clause) / Surfacing (cancelled-binder arm) (read-only)
- `docs/spec_topics/binder/determinism-cancellation-failure.md` — Cancellation / Failure modes (read-only)

## Affected Leaves

**Phases:** Vertical slice V11 (Binder)

**Leaves (implementation order):**

- `V11f` — Binder cancellation, per-class retry budget, and failure taxonomy — (modified)
- `V11f-T` — Binder cancellation, per-class retry budget, and failure taxonomy (tests) — (modified)

## Consequence

**Severity:** correctness

The mid-call binder cancellation forwarding (`options.signal` into the provider invocation) can ship unimplemented or broken with every `V11f` test green: the verbatim-template test passes via a pre-call abort, so the abort-during-binder-call path is never exercised. Two reasonable implementers would diverge — one wiring `options.signal` into the provider call, one relying solely on the pre-binder checkpoint — and the gap would not surface as a test failure or at the closing gate (the MUST carries no REQ-ID, so it is invisible to coverage reconciliation).

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The plan leaf files that carry this defect — `docs/plan_topics/V11f-binder-retry-taxonomy.md`, `docs/plan_topics/V11f-T-binder-retry-taxonomy.md`, and `docs/plan_topics/V17a-cancellation-core.md` — are untracked in the repository (`git status` reports `??`; only `conventions.md`, `coverage-matrix.md`, and `leaf-template.md` are tracked under `docs/plan_topics/`). The defect's introduction cannot be walked through git history because the file that contains it was never committed.

## Solution Space

**Shape:** single

### Recommendation

Add a binder-cancellation test bullet to `V11f-T` (the authoritative test leaf) and mirror it in `V11f` `Tests.`, asserting the behavioural forwarding contract rather than only the note text: an abort landed *during* the binder's in-flight provider call surfaces the cancelled-binder system note (`loom /<name>: argument binding cancelled`) and the loom does not run — no `Result` reaches loom code. Cite the binder-call clause of `cancellation.md` *Granularity* together with the cancelled-binder arm of `cancellation.md` *Surfacing* and the *Cancellation* section of `determinism-cancellation-failure.md`. Land the abort at the in-flight binder call through the `Checkpoint` seam test substrate (already available to `V11f` via its `Deps. V17a`) so the during-call path is exercised deterministically without depending on JS microtask scheduling, distinct from a pre-call abort that the pre-binder checkpoint already covers in `V17a`.

Edge case the implementer must keep observable: an abort observed during a budgeted *retry* of the binder call must also surface the cancelled-binder note immediately (per `determinism-cancellation-failure.md`, "An abort observed during any retry permitted by the budget above suppresses that retry and surfaces the cancelled-binder note immediately"); the new bullet should not be satisfied solely by the initial-attempt path.

## Relationships

- T30 "Un-anchored normative MUSTs are invisible to the closing gate by construction" — must-follow (the binder-forwarding MUST carries no REQ-ID and no diagnostic code, so it is invisible to the closing gate; how this finding's test is anchored depends on the systemic rule that finding proposes).
- T26 "Cancellation checkpoint granularity set unverified" — same-cluster (the pre-binder checkpoint named there is the sibling of this binder-call site; resolves independently in `V17a`).
- T27 "V17a leaves three normative cancellation MUSTs with no asserting test" — same-cluster (sibling un-asserted cancellation MUSTs in `V17a`; resolves independently).
- T16 "Cancellation test bullet keyed by one diagnostic conflates four independent obligations" — same-cluster (the `V17a` generic `loomAbort` forwarding bullet; resolves independently).

---

# T19 — Plan has no terminal end-to-end integration-acceptance leaf

**Original heading:** No terminal end-to-end / integration acceptance step beyond minimal `M`
**Original section:** plan.md — slice ordering & narrative
**Kind:** validation
**Importance:** high
**Score:** 90
**MustFix:** false

## Finding

The only leaf that exercises an assembled `.loom` through the `H4a` harness end-to-end is the MVP leaf `M`, and it drives the narrowest possible pipeline: a single untyped `` @`<literal>` `` query streaming one prompt-mode turn against the in-process Pi session double. Every leaf after `M` closes its obligations through unit- and harness-level assertions scoped to that leaf's feature (e.g. `V13c` asserts only the tool-loop round-counting and `max_rounds:0`/exhaustion paths). The single terminal automation, `H5a`, is a static reconciliation of the spec REQ-ID set and the diagnostics registry against `coverage-matrix.md` and the asserting tests — it runs no `.loom` and observes no runtime behaviour.

Consequently no leaf re-runs a representative multi-feature `.loom` (typed query + tool loop + code-tool invoke + schema lowering/validation + binder + cancellation) through the harness at the end of the build. Each feature is verified in isolation against the session double, but the integrated composition of those features is never exercised. A regression that only manifests when two or more slices interact (for example a binder result feeding a typed query whose schema was lowered by `V5d` and validated through the `V8a` validator, then cancelled mid-loop) passes every per-leaf gate and the static `H5a` gate while shipping broken.

## Plan Documents

- `docs/plan.md` — Horizontal phases / closing-gate listing (edited)
- `docs/plan_topics/<new>-*.md` — new terminal integration-acceptance leaf (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — end-to-end harness the new leaf reuses (read-only)
- `docs/plan_topics/M-minimal-slash-command.md` — existing sole end-to-end baseline (read-only)
- `docs/plan_topics/H5a-closing-gate-automation.md` — existing static closing gate (read-only)
- `docs/plan_topics/coverage-matrix.md` — closure mapping; the new leaf re-asserts existing REQ-IDs and closes none (read-only)

## Spec Documents

None — the fix adds a plan-level acceptance leaf that re-exercises behaviours already specified; no spec rule is added or changed.

## Affected Leaves

**Phases:** Horizontal (a terminal closing-gate leaf, sibling to `H5a`, sequenced after the V slices via its `Deps.`)

**Leaves (implementation order):**

- `<new>` — terminal integration-acceptance / release-gate leaf — (added)

## Consequence

**Severity:** correctness

Cross-slice integration regressions ship undetected: a representative integrated `.loom` is never run after the slice work completes, so a defect that emerges only when features compose (and is invisible to any single-feature gate and to the static `H5a` reconciliation) reaches loom 1.0 with the full plan green. Two implementers building the slices correctly in isolation can still produce an assembly that does not match the spec's end-to-end behaviour.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** 288f191 — Add implementation plan with horizontal/MVP/vertical-slice phases (2026-05-04, Thomas Andersen)
**History:** The plan has never carried a terminal integration-acceptance leaf. From `plan.md`'s first commit (288f191) the MVP leaf `M` was the sole end-to-end and the only terminal automation was a static REQ-ID/coverage closing gate. The plan was reset and re-pivoted to the current scaffold (657ee76, 15f69aa; 2026-05-25/26) and later gained a scope section and two-task TDD pairing (f9c5354; 2026-06-09), but none of these restored an integrated terminal run. The current leaf files (`M`, `H4a`, `H5a`, the `V*` leaves) are uncommitted working-tree additions, so no later commit introduced the gap — it is an omission present since the plan's inception.

## Solution Space

**Shape:** single

### Recommendation

Add one new Horizontal closing-gate leaf (placeholder `<new>`, a sibling to `H5a`) at `docs/plan_topics/<new>-<short-name>.md`, and link it into the Horizontal phases list in `docs/plan.md` after `H5a`.

- **Convention.** cite `conventions.md` (phase categories — end-to-end harness); it operationalises a project convention, like the other horizontal leaves, and asserts no new spec REQ-ID.
- **Deps.** list the terminal feature leaves whose composition the run must cover so the leaf sequences after them: `H4a` (harness), `V13c` (typed query + tool loop), `V14a` (code-tool invoke), `V5d` and `V8a` (schema lowering + AJV validation), `V11f` (binder), and `V17a` (cancellation). Cite the IDs exactly as they appear in `plan.md`; the implementer adjusts the set if a closer transitive cover exists.
- **Ships when.** running a single representative multi-feature fixture `.loom` through the `H4a` harness against the in-process Pi session double drives the integrated pipeline (typed query → tool loop → invoke → schema validation → binder → cancellation) and asserts the full run produces the expected appended turns and the expected `loom-system-note` diagnostics.

The leaf closes no new REQ-ID (it re-exercises behaviours already mapped in `coverage-matrix.md`); it is an integration-regression gate, so no `coverage-matrix.md` row is required. Edge case for the implementer: the run executes against the session double, not a real Pi host, so its fidelity is bounded by the double's behaviour — the assertions should target the cross-slice composition the per-leaf gates cannot see, not host-level realism.

## Relationships

- T29 "Release-gate activation has no owning leaf" — co-resolve (both are answered by introducing an owned terminal release-gate leaf; this new leaf can be that owner).
- T17 "Version-bump acceptance is build-time surface checks only — no runtime-evidence gate or revert path" — must-precede (its proposed fix gates acceptance on "the end-to-end harness passing against the new pin", which presupposes the terminal integrated run this finding adds).
- T20 "H4a in-process Pi session double has no stated fidelity contract against the pinned SDK" — decision-overlap (the value of a terminal run against the double depends on the double's stated fidelity contract).

---

# T20 — H4a in-process Pi session double has no stated fidelity contract against the pinned SDK

**Original heading:** In-process Pi session double fidelity contract unstated
**Original section:** H4a — Factory shell and harness
**Kind:** assumptions
**Importance:** high
**Score:** 90
**MustFix:** false

## Finding

`H4a` introduces the reusable end-to-end harness that "loads the extension against an in-process Pi session double and drives a slash dispatch," but the leaf never states the behavioural fidelity contract that double must hold against the pinned `@earendil-works/pi-coding-agent` SDK, nor names who validates that the double matches real Pi. The behaviours that matter to downstream gates — streamed-token ordering relative to `ctx.waitForIdle()` resolution, turn-append semantics, the prompt-mode `pi.on` subscription used for cancel-forwarding, and cancellation propagation — are exactly the surface a test double can silently get wrong.

Several ship-gates are defined purely in terms of the double's observable behaviour. The clearest is `V12a` / `V12a-T` `SLSH-2`, whose ordering assertion ("streamed assistant tokens are observable in the user transcript *before* the interpreter resumes — before `ctx.waitForIdle()` resolves … Driven through the in-process Pi session double with an ordering-observable transcript sink") is meaningful only if the double reproduces real Pi's streaming-vs-resume ordering. The same dependence runs through `M`/`M-T` (one streamed assistant response appended as a single prompt-mode turn), `V9c` (`waitForIdle`, trailing-turn extraction, `pi.on` cancel-forward), and the cancellation-forwarding paths in `V17a` and `V11f`.

The plan's only SDK-conformance machinery — `V18a` (surface inventory) and `V18b` (surface-set-closure audit) — pins the *static surface* loom references against the SDK, not the *runtime behaviour* the double imitates. So nothing in the plan ties the double's behaviour to the pinned SDK. If the double diverges (e.g. it resolves `waitForIdle` after flushing streamed tokens when real Pi would not), the double-only gates report green while the real integration is wrong — a silent false-green that the closing gate cannot catch.

## Plan Documents

- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Adds. / Tests. / Ships when (edited)
- `docs/plan_topics/V12a-slash-dispatch.md` — `SLSH-2` Tests bullets (option-dependent)
- `docs/plan_topics/V12a-T-slash-dispatch.md` — `SLSH-2` Tests bullets (option-dependent)
- `docs/plan_topics/conventions.md` — phase categories (end-to-end harness) (read-only)
- `docs/plan_topics/M-minimal-slash-command.md` — `SLSH-2` / Ships when (read-only)
- `docs/plan_topics/V9c-conversation-drive.md` — Adds. (`waitForIdle`, `pi.on` cancel-forward) (read-only)
- `docs/plan_topics/V17a-cancellation-core.md` — cancellation-forwarding bullet (read-only)
- `docs/plan_topics/V18a-capability-inventory.md` — surface inventory (read-only)
- `docs/plan_topics/V18b-inventory-audit.md` — surface-set-closure audit (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — prompt-mode drive / `waitForIdle` (read-only)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — session/host interface behaviour (read-only)
- `docs/spec_topics/cancellation.md` — cancel-forwarding semantics (read-only)

(The fix is internal to plan files; the spec topics are read to enumerate the behaviours the double must model, not edited.)

## Affected Leaves

**Phases:** Horizontal (H4a), Vertical V12

**Leaves (implementation order):**

- `H4a` — Extension factory shell and end-to-end harness — (modified)
- `V12a` — Slash dispatch, overflow, and streaming — (modified)

(`M`, `V9c`, `V17a`, `V11f` consume the double's behavioural fidelity but are not edited under the recommended fix; they are read-only context above.)

## Consequence

**Severity:** correctness

A double whose `waitForIdle`-vs-streaming ordering (or turn-append / cancel-forward behaviour) diverges from the pinned SDK makes the double-only ship-gates — `V12a` `SLSH-2` most acutely — pass on a real integration bug (e.g. a buffer-then-append-after-resume implementation), and the closing gate has no way to detect it. Two implementers building the double could model the timing differently and both see green, so a leaf can ship not matching real-host behaviour.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited plan leaf files (`docs/plan_topics/H4a-factory-shell-and-harness.md`, `docs/plan_topics/V12a-slash-dispatch.md`, `docs/plan_topics/V12a-T-slash-dispatch.md`) are untracked working-tree files — `git ls-files` does not list them and `git status` reports them `??` — so no commit history exists to localise when the defect entered the corpus.

## Solution Space

**Shape:** multiple

### Option A — State the fidelity contract at H4a and name where it is asserted

**Approach:** Add to `H4a` a behavioural contract enumerating the specific Pi behaviours the in-process double must reproduce relative to the pinned SDK — streamed-token order relative to `ctx.waitForIdle()` resolution, single-turn append semantics, the `pi.on` cancel-forward subscription, and cancellation propagation — and name the mechanism/owner that validates the double against the pinned SDK (e.g. a harness self-check, listed as an `H4a` inline test, plus `V18c`'s version-bump runtime-evidence gate as the real-host backstop).
**Plan edits:** `H4a` `Adds.`/`Tests.`/`Ships when`: name the modelled behaviours and the fidelity-assertion mechanism. Optionally introduce a `<new>` harness-conformance leaf if the assertion is too large for `H4a`.
**Spec edits:** None.
**Pros:** Double-dependent gates keep their real-host meaning; the contract has one named home; fidelity drift becomes detectable rather than silent.
**Cons:** Requires enumerating the SDK behaviours and a conformance mechanism; a true conformance check against the real SDK may need a live Pi session the in-process harness deliberately avoids.
**Risks:** If the conformance check can only run against a real Pi session, it may not fit the in-process harness and must defer to `V18c`/a terminal real-host gate.

### Option B — Scope the double-dependent ship-gates to "as modelled by the double"

**Approach:** Reword the gates that rest on the double (`V12a` `SLSH-2` ordering, `M`, `V9c`, `V17a`, `V11f`) so their `Tests.`/`Ships when` state they assert behaviour *as modelled by the in-process double*, not real-host behaviour, and rely on surface inventory (`V18a`/`V18b`) plus a real-host runtime-evidence gate for actual integration coverage.
**Plan edits:** `V12a`/`V12a-T` `SLSH-2` bullets (and the sibling double-only gates) gain the "as modelled by the double" scoping.
**Spec edits:** None.
**Pros:** Honest about what the unit harness verifies; minimal text edits; no conformance machinery.
**Cons:** Leaves the real-host gap open — nothing re-runs an integrated `.loom` against a real Pi session except `M`'s single untyped query; cross-slice integration regressions stay unverified (overlaps the terminal-integration finding).
**Risks:** Scoping down without a compensating real-host gate merely documents the gap instead of closing it.

### Recommendation

Take Option A: state the double's fidelity contract at `H4a` (naming the streaming-vs-`waitForIdle` ordering, turn-append, `pi.on` cancel-forward, and cancellation-propagation behaviours) and name where/by whom that fidelity is asserted, with a real-host runtime-evidence gate as the backstop. Establish the contract at `H4a` first, before any per-gate scoping, so downstream gates reference one named contract rather than each scoping its claim independently. If a full real-SDK conformance check cannot run in-process, fall back to scoping the affected gates (Option B) **and** pairing that with a real-host end-to-end gate (see the related terminal-integration finding) so the coverage is not merely deleted.

## Relationships

- T19 "Plan has no terminal end-to-end integration-acceptance leaf" — decision-overlap (a release-gate real-host end-to-end leaf would double as the fidelity backstop this finding needs).
- T17 "Version-bump acceptance is build-time surface checks only — no runtime-evidence gate or revert path" — same-cluster (both want runtime evidence against the pinned/real SDK rather than static/surface gates).

---

# T21 — Asserted diagnostic code `loom/parse/empty-enum-body` is absent from the parse registry

**Original heading:** Asserted code `loom/parse/empty-enum-body` absent from registry
**Original section:** V5a — Schema declarations
**Kind:** consistency
**Importance:** high
**Score:** 90
**MustFix:** false

## Finding

Both `V5a` and its paired tests leaf `V5a-T` carry the `Tests.` bullet ``loom/parse/empty-schema-body`, `loom/parse/empty-enum-body`: empty bodies fire.`` The first code is registered; the second is not. `code-registry-parse.md` registers `loom/parse/empty-schema-body` (the empty object-body diagnostic) but contains no row for `loom/parse/empty-enum-body`.

The code is named in normative spec prose: `schemas.md` §Enum declarations states *"An `enum X { }` declaration with no variants is `loom/parse/empty-enum-body`: `'<X>' has no variants; an empty enum cannot be validated.`"* with a full message string and an AJV-rejection justification. So the disagreement is between `schemas.md` prose (which treats the code as real and fully specified) and the parse registry (which omits it). The plan leaves faithfully assert the prose code; the gap is upstream in the spec corpus.

The `H5a` closing gate reconciles test-asserted diagnostic codes against the registry and fails on "a test asserts a diagnostic code absent from the registry." A test asserting `loom/parse/empty-enum-body` therefore drives the closing gate red until the registry and the asserting leaf agree.

## Plan Documents

- `docs/plan_topics/V5a-schema-decls.md` — Tests (read-only)
- `docs/plan_topics/V5a-T-schema-decls.md` — Tests (read-only)

## Spec Documents

- `docs/spec_topics/diagnostics/code-registry-parse.md` — `loom/parse/*` table (edited)
- `docs/spec_topics/schemas.md` — §Enum declarations (read-only — authoritative source of the message string)

## Affected Leaves

**Phases:** Vertical slice V5 — Schemas, descriptions, schema-subset

**Leaves (implementation order):**

- `V5a-T` — Schema declarations (object / alias / enum) (tests) — (modified)
- `V5a` — Schema declarations (object / alias / enum) — (modified)

## Consequence

**Severity:** blocking

A test asserting `loom/parse/empty-enum-body` references a code with no registry row, so the `H5a` closing gate fails on the "asserted code absent from the registry" arm. The plan as written cannot reach a green closing gate until the registry and the asserting leaves agree, and `V5a`'s `Ships when` (each listed code fires) cannot be reconciled against a registry that lacks the row.

## Issue introduction

**Verdict:** single-commit

**Introducing commit:** `de05433` (2026-05-04) — *pi-loom spec: resolve "Schema declarations: empty bodies, alias cycles, and discriminator literal type unspecified"*

**History:** `de05433` added the `loom/parse/empty-enum-body` prose to `spec_topics/schemas.md` (alongside `loom/parse/empty-schema-body`) with a complete message string. Its diffstat touched only `schemas.md` and a review doc — no registry file — so the enum-body code entered normative prose without a matching `code-registry-parse.md` row. `git log -S "loom/parse/empty-enum-body" --all -- "*registry*"` returns no commits: the code has never appeared in any registry file. `empty-schema-body`, by contrast, was subsequently added to the registry, leaving the asymmetry. The `V5a` / `V5a-T` plan leaves that assert the code are untracked (not yet committed) and only propagate the spec prose; the durable defect is the spec-side drift introduced in `de05433`.

## Solution Space

**Shape:** single

### Recommendation

Treat the code as real and close the spec drift in `code-registry-parse.md`. Add a `loom/parse/empty-enum-body` row to the `loom/parse/*` table, mirroring the existing `loom/parse/empty-schema-body` row: severity `E`, phase `parse`, trigger ``enum X { }`` declaration with no variants, spec rule pointing to [Schemas — Enum declarations](../schemas.md), no hint, and the message string from `schemas.md` verbatim — `'<X>' has no variants; an empty enum cannot be validated.` Once the row exists, the `V5a` / `V5a-T` citations are already correct and need no edit; the registry and the asserting leaves agree, and the `H5a` gate reconciles green.

Edge case: if a reviewer instead determines the code is not real (no `enum X {}` diagnostic is wanted), the registry must not gain the row — in that case the citation must be struck from both `V5a` and `V5a-T` and the `schemas.md` §Enum declarations reference reconciled to the registered code. The invariant either way is that the registry and every asserting leaf name the same code; the prose's full message string and AJV justification make the add-the-row branch the expected resolution.

## Relationships

- T04 "Truncated diagnostic code: `V5b` cites `loom/parse/duplicate-discriminator`, registry has `loom/parse/duplicate-discriminator-value`" — same-cluster (same `H5a` asserted-code-vs-registry failure mode; resolves independently).
- T13 "`V6e`/`V6e-T` assert a non-existent `loom/parse/...` diagnostic code instead of the registered `loom/load/frontmatter-value-out-of-range`" — same-cluster (same registry-reconciliation failure on a `parse` vs `load` phantom code; resolves independently).
- T05 "Bare diagnostic code `binder-model-strict-capability-unknown` missing `loom/load/` prefix" — same-cluster (bare-form code absent from registry; same gate arm, resolves independently).

---

# T22 — `PIC-2` mapped to `V9c` in the coverage matrix but never asserted; `subagent.md` missing from `V9c` `Spec.`

**Original heading:** PIC-2 claimed in coverage matrix but absent from V9c; Spec field not closed
**Original section:** V9c — Conversation drive
**Kind:** traceability
**Importance:** high
**Score:** 85
**MustFix:** false

## Finding

`coverage-matrix.md` maps `PIC-2 → V9c` (prompt-mode sequential execution). `PIC-2` is defined in `spec_topics/pi-integration-contract/subagent.md` (`#pic-2`): prompt-mode bodies execute strictly sequentially within a single user session — at most one prompt-mode body (top-level slash dispatches and nested prompt→prompt `invoke(...)` calls alike) holds an open `pi.setActiveTools` snapshot/restore window at a time. The spec marks it a *derived* property, but the coverage matrix lists it as an executable REQ-ID closed by `V9c`.

`V9c`'s and `V9c-T`'s `Tests.` bullets cover only `PIC-17` (per-query snapshot → set → `finally`-restore; ambient tools not inherited), `PIC-18` (process-global `pi.on` cancel-forward subscription), and a trailing-turn `Ok(string)` extraction paraphrase. No bullet asserts `PIC-2`. `PIC-17`'s single-query snapshot/restore is distinct from `PIC-2`'s cross-body non-overlap guarantee, so the existing bullets do not transitively cover it.

Separately, `V9c`'s `Spec.` field lists only `conversation-drive.md` and `host-interfaces-core.md`. `PIC-2`'s home page, `subagent.md`, is not listed, and the references to subagent-mode in `conversation-drive.md` are narrative ("see **Conversation drive — subagent mode**"), excluded from normative closure per `conventions.md`'s `Spec.`-closure rule (GOV-3). An implementer restricting their reading to the listed pages — as `conventions.md` permits — never reaches the `PIC-2` text they are meant to close.

## Plan Documents

- `docs/plan_topics/V9c-conversation-drive.md` — `Tests.` and `Spec.` fields (edited)
- `docs/plan_topics/V9c-T-conversation-drive.md` — `Tests.` and `Spec.` fields (edited)
- `docs/plan_topics/coverage-matrix.md` — `PIC-2 → V9c` row (read-only)
- `docs/plan_topics/conventions.md` — `Spec.`-closure rule / REQ-ID discipline / leaf format (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/subagent.md` — `PIC-2` (`#pic-2`) (read-only)

## Affected Leaves

**Phases:** Vertical slice V9 — Extension host integration

**Leaves (implementation order):**

- `V9c` — Prompt-mode conversation drive and active-set gating — (modified)
- `V9c-T` — Prompt-mode conversation drive and active-set gating (tests) — (modified)

## Consequence

**Severity:** correctness

The coverage matrix asserts `PIC-2` is closed by `V9c`, yet no `V9c` test exercises it. Prompt-mode sequential execution — the non-overlap of `pi.setActiveTools` snapshot/restore windows across top-level dispatches and nested prompt→prompt `invoke(...)` calls — can regress with every `V9c` test green, and the closing-gate row passes on the strength of a mapping with no backing assertion. The unlisted `subagent.md` also leaves an implementer who reads only the listed `Spec.` pages without the normative text the bullet must witness.

## Issue introduction

**Verdict:** uncommitted-working-tree introduction (corpus is git-tracked; defect not yet committed)
**Introducing commits:** none identified — defect lives entirely in uncommitted/untracked working-tree state
**History:** The plan corpus is under git (1098 commits; HEAD `f9c5354`). `docs/plan_topics/coverage-matrix.md` is tracked, but its committed HEAD revision contains no PIC table at all — the entire PIC block, including the `PIC-2 → V9c` row and the `PIC-17, PIC-18 → V9c` row, exists only as an uncommitted working-tree modification (`git diff HEAD` shows them as `+` additions; `git show HEAD:…coverage-matrix.md` has no PIC rows). Both leaf files, `docs/plan_topics/V9c-conversation-drive.md` and `docs/plan_topics/V9c-T-conversation-drive.md`, are untracked (`git status` reports `??`) and have never been committed. The mismatch — a `PIC-2 → V9c` matrix row with no `PIC-2` bullet in the `V9c` leaf — was therefore authored wholesale in the current, not-yet-committed pass; there is no committed history to attribute a specific introducing edit to.

## Solution Space

**Shape:** single

### Recommendation

Close `PIC-2` at `V9c` and admit its source page into the leaf's reading set:

- Add `subagent.md` to the `Spec.` field of both `docs/plan_topics/V9c-conversation-drive.md` and `docs/plan_topics/V9c-T-conversation-drive.md`, citing the page (and the `#pic-2` anchor): `[../spec_topics/pi-integration-contract/subagent.md](../spec_topics/pi-integration-contract/subagent.md)`.
- Add a `PIC-2` `Tests.` bullet to both leaves (mirror-consistent) asserting the observable witness: within a single user session, no two prompt-mode bodies hold an open `pi.setActiveTools` snapshot/restore window simultaneously — a nested prompt→prompt `invoke(...)` opens its window only after the parent body's window is restored.

Edge cases for the implementer:
- `PIC-2` is spec-marked a *derived* property; the bullet should witness the observable non-overlap of snapshot/restore windows, not re-prove Pi's upstream per-session slash-handler serialisation guarantee.
- Keep `PIC-2` separate from the existing `PIC-17` bullet: `PIC-17` asserts one query's snapshot → set → `finally`-restore; `PIC-2` asserts sequencing *across* bodies (top-level dispatch plus nested `invoke`). Folding the assertion into `PIC-17` would leave the cross-body guarantee unverified.

## Relationships

- T23 "PIC-21 (renderer exception safety) has a coverage-matrix row but no asserting test in V7a" — same-cluster (identical defect shape — a coverage-matrix PIC row mapping a leaf that carries no asserting bullet; resolves independently).

---

# T23 — PIC-21 (renderer exception safety) has a coverage-matrix row but no asserting test in V7a

**Original heading:** PIC-21 claimed in coverage matrix but absent from V7a Tests
**Original section:** V7a — Diagnostics primitive
**Kind:** traceability
**Importance:** high
**Score:** 100
**MustFix:** true

## Finding

`coverage-matrix.md` (Numbered REQ-IDs table) maps `PIC-21 → V7a`, declaring `V7a` the leaf whose green tests close the PIC-21 obligation. PIC-21 is a normative spec MUST — *Renderer exception safety* in [`../spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md#pic-21`](../spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md): the `loom-system-note` renderer body MUST NOT throw out of the `MessageRenderer` invocation; on any internal failure it MUST catch within its own body and return a minimal `Component` that renders the raw `message.content` when `display === true`, or `undefined` when `display === false`, with no `loom/runtime/*` diagnostic emitted.

`V7a`'s Tests bullets cite only `DIAG-1` (registry-code content-line rendering), multi-error batching, and re-scan re-emission. There is no PIC-21 bullet. The paired `V7a-T` tests leaf mirrors the same three bullets and likewise omits PIC-21.

The result is a coverage claim with no closure evidence: the matrix asserts `V7a` closes PIC-21, but nothing in `V7a`/`V7a-T` exercises the renderer's no-throw / catch-and-degrade contract. A reviewer auditing PIC-21 through the matrix lands on a leaf that never tests it.

## Plan Documents

- `docs/plan_topics/V7a-diagnostics-primitive.md` — Tests (edited)
- `docs/plan_topics/V7a-T-diagnostics-primitive.md` — Tests (edited)
- `docs/plan_topics/coverage-matrix.md` — Numbered REQ-IDs table, `PIC-21` row (read-only — the mapping is correct; the gap is the missing test, not the row)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md` — PIC-21 (read-only — source of the invariant the new test asserts)

## Affected Leaves

**Phases:** Vertical / V7 — Diagnostics

**Leaves (implementation order):**

- `V7a-T` — Diagnostics primitive and `loom-system-note` channel (tests) — (modified)
- `V7a` — Diagnostics primitive and `loom-system-note` channel — (modified)

## Consequence

**Severity:** correctness

PIC-21 ships with a coverage-matrix row claiming `V7a` closes it while `V7a`'s tests never assert the renderer no-throw contract, so two reasonable implementers diverge — one adds the exception-safety test, one treats the three listed bullets as the complete acceptance set and ships a renderer that can propagate a throw out of `MessageRenderer`, corrupting the session transcript and the rendering of subsequent `loom-system-note` deliveries. The `H5a` closing gate passes vacuously on PIC-21's mapping arm because the row exists, masking the absent closure evidence.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The corpus is a git work tree, but the defect-bearing content is not committed: `docs/plan_topics/V7a-diagnostics-primitive.md` and `docs/plan_topics/V7a-T-diagnostics-primitive.md` are untracked (`git status` → `??`), and the `PIC-21 → V7a` row lives only in the uncommitted working-tree edit to `docs/plan_topics/coverage-matrix.md` (`HEAD` has no numbered-REQ-ID table). With both sides of the mismatch outside version control, the defect cannot be attributed to any commit.

## Solution Space

**Shape:** single

### Recommendation

Add a PIC-21 Tests bullet to `docs/plan_topics/V7a-diagnostics-primitive.md` and the mirror bullet to `docs/plan_topics/V7a-T-diagnostics-primitive.md`, asserting the renderer exception-safety contract. The bullet must verify that when the registered `loom-system-note` `MessageRenderer` body hits an internal failure, the throw does not propagate out of the invocation, and the renderer returns the degraded fallback `Component` (raw `message.content` when `display === true`, `undefined` when `display === false`), with no `loom/runtime/*` diagnostic emitted. Suggested literal text for the implementation leaf:

> - `PIC-21`: when the `loom-system-note` renderer body throws internally, the throw does not escape the `MessageRenderer` invocation; the renderer returns a minimal `Component` rendering raw `message.content` for `display === true` and `undefined` for `display === false`, and emits no `loom/runtime/*` diagnostic.

Keep `V7a` and `V7a-T` mirror-consistent — add the identical bullet to both per the project's paired-TDD convention. The `coverage-matrix.md` `PIC-21 → V7a` row is already correct and needs no edit.

## Relationships

- T22 "`PIC-2` mapped to `V9c` in the coverage matrix but never asserted; `subagent.md` missing from `V9c` `Spec.`" — same-cluster (identical defect pattern — a coverage-matrix PIC mapping with no asserting test in the named leaf; resolves independently).
- T03 "`DIAG-2` describes a `src/**` emission scan the closing gate does not perform" — same-cluster (both concern closure evidence reconciled through the `H5a` gate; resolve independently).
- T13 "`V6e`/`V6e-T` assert a non-existent `loom/parse/...` diagnostic code instead of the registered `loom/load/frontmatter-value-out-of-range`" — same-cluster (both produce a coverage/closure mismatch the `H5a` gate must catch; different leaf and fix).

---

# T24 — Parallel-batch settle-and-independent-lowering rule has no asserting leaf

**Original heading:** Parallel-batch settlement/lowering behaviour not pinned to a closing leaf
**Original section:** Subagent / tool-call concurrency coverage
**Kind:** spec-coverage
**Importance:** high
**Score:** 85
**MustFix:** false

## Finding

`tool-calls.md` §*Concurrency* (anchor `#concurrency`) and `query/query-tool-loop.md` §*Tool-call loop bound* both pin a normative runtime behaviour for the model-driven parallel tool batch: when the model emits multiple `tool_use` blocks in one assistant message, the runtime executes them in parallel, **awaits the whole batch to settle before constructing the next user turn**, and **lowers each sibling's outcome independently** — a failing sibling (`execute()` throws or resolves `{ content, isError: true }`) becomes that block's `isError: true` tool-result and is fed back to the model alongside the successful siblings' results.

This is a code-keyed (QRY / TOOL area) obligation with no numbered REQ-ID. The only plan test that touches the parallel batch is `V13c`'s `CIO-4` bullet — "a parallel batch counts as one slot" — which asserts the round-accounting facet (one batch consumes one `tool_loop.max_rounds` slot) and nothing about settlement ordering or per-sibling lowering. `V14a` covers the code-side `<name>(args)` path, which the spec explicitly defines as sequential, so it does not exercise the model-driven parallel batch at all. `V13d` covers respond-repair, unrelated.

The result: the await-all-settle-before-next-turn rule and the per-sibling-independent-lowering rule can both ship unimplemented (e.g. constructing the next turn after the first sibling settles, or collapsing a mixed batch to a single error) with every `V13c`/`V14a`/`V13d` test green and no closing-gate signal, because the obligation is code-keyed and asserted by no test.

## Plan Documents

- `docs/plan_topics/V13c-T-query-tool-loop.md` — Tests (edited)
- `docs/plan_topics/V13c-query-tool-loop.md` — Tests (edited)
- `docs/plan_topics/coverage-matrix.md` — code-keyed obligation areas / mapping table (edited)
- `docs/plan_topics/V14a-tool-calls.md` — Tests (option-dependent)

## Spec Documents

- `docs/spec_topics/tool-calls.md` — §*Concurrency* (`#concurrency`) (read-only)
- `docs/spec_topics/query/query-tool-loop.md` — §*Tool-call loop bound* (read-only)

## Affected Leaves

**Phases:** Vertical slice V13 — Query

**Leaves (implementation order):**

- `V13c` — Query tool loop and typed two-phase — (modified)
- `V14a` — Tool calls (code-side) and `CodeToolError` — (option-dependent)

## Consequence

**Severity:** correctness

A normative parallel-batch behaviour the spec marks as a runtime MUST has no closing test, so it can silently ship unimplemented and pass the `H5a` gate vacuously. Two reasonable implementers diverge: one awaits the full batch and lowers each sibling independently; another constructs the next turn on first settle or collapses a mixed success/failure batch to one error — and nothing fails red.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The plan leaf files that carry this defect — `docs/plan_topics/V13c-query-tool-loop.md`, `docs/plan_topics/V13c-T-query-tool-loop.md`, and the alternate-home `docs/plan_topics/V14a-tool-calls.md` — are untracked in the repository (`git status` reports `??`; only `conventions.md`, `coverage-matrix.md`, and `leaf-template.md` under `docs/plan_topics/` are tracked). With no committed history for the defect-carrying files, the introducing change cannot be located.

## Solution Space

**Shape:** single

### Recommendation

Home the missing assertion in `V13c` (the query tool-call loop owner; the model-driven parallel batch is a query-loop behaviour, not a code-side `V14a` concern, since `V14a` tool calls are sequential per `tool-calls.md` §*Concurrency*).

- Add a `Tests.` bullet to `V13c-T-query-tool-loop.md` (authoritative test spec) and mirror it verbatim in `V13c-query-tool-loop.md`, citing `[tool-calls.md — Concurrency](../spec_topics/tool-calls.md#concurrency)` (TOOL code-keyed area), asserting: a model-driven parallel tool-call batch mixing one succeeding and one failing sibling awaits every call in the batch to settle before the runtime constructs the next user turn, and each sibling's outcome is lowered independently — the failing sibling becomes that `tool_use` block's `isError: true` tool-result fed back alongside the successful siblings' results.
- In `coverage-matrix.md`, add `V13c` to the `tool-calls.md` (TOOL) row of the *Code-keyed obligation areas* table (currently `V14a` only), recording that the §*Concurrency* parallel-batch obligation closes in `V13c`.

Edge cases for the implementer: keep the existing `CIO-4` "counts as one slot" bullet — it asserts the round-accounting facet and is distinct from the new settle/lowering facet. Do not fold in the `.loom`-callable parallel re-entrancy / per-invocation `AgentSession` isolation concern (that is `subagent.md` / `V9i` territory); this bullet covers only batch settlement and per-sibling lowering.

## Relationships

- T28 "Subagent parallel-initiation MUST has no closing leaf and cannot be lawfully authored" — same-cluster (both are concurrency-coverage gaps in the same source neighbourhood, but pin different mandates in different leaves and resolve independently).

---

# T25 — `V5d` lowering-pass outputs are named only in descriptive `Adds.`, bound by no `Tests.` bullet

**Original heading:** Lowering obligations live in descriptive Adds., not binding Tests.
**Original section:** V5d — Schema-subset gate, lowering, and canonical hash
**Kind:** placement, implementability
**Importance:** high
**Score:** 90
**MustFix:** false

## Finding

`V5d` `Adds.` names four normative outputs of `schema-subset.md` *Lowering Algorithm* steps 2–5: the `__inline_<slug>` hoist (step 2), the auto-generated `$defs`/`$ref` reuse (step 3), the per-schema sidecar of two maps (step 5), and the per-query `$defs` pruning (step 4). The `V5d`/`V5d-T` `Tests.` bullets cover only the subset reject gate, `loom/load/schema-slug-collision`, the canonical-hash recipe, and `Result`-in-schema-position with array-element-order preservation. None of the four lowering outputs is asserted by a `Tests.` bullet.

Because `schema-subset.md` (`SUBS`) is a code-keyed area that owns its obligations through diagnostic codes rather than numbered `PREFIX-N` REQ-IDs, and `conventions.md` *Leaf format* makes `Adds.` descriptive-by-default, an obligation named only in `Adds.` binds the implementer only when it carries a cited REQ-ID or is a seam a consumer's `Deps.` relies on. The lowering outputs satisfy neither cleanly, so they can ship unimplemented with every `V5d` test green and the `H5a` closing gate silent (the gate reconciles asserted diagnostic codes, of which these obligations have none).

Two outputs are concretely unprotected. (a) **Per-query `$defs` pruning** (step 4): the leaves that build per-query request schemas — `V13b` (`Deps. V13b-T, V13a, V2b`) and `V13c` (`Deps. V13c-T, V13b, V9c, V16a, V5e`) — do not list `V5d` in `Deps.` at all, so unpruned `$defs` can ship on every typed-query request with no test exercising the prune. (b) **The sidecar** (step 5): it is a genuine cross-leaf seam consumed by `V2c` (`Deps.` lists `V5d`; its `Tests.` exercise enum-tag reattach via the sidecar), but the producer contract — two maps, the named-enum-position map keyed by JSON Pointer and present iff the source was a named `enum`, anonymous unions absent — is asserted by neither the producer (`V5d`) nor the consumer (`V2c`), so producer and consumer can silently diverge.

## Plan Documents

- `docs/plan_topics/V5d-subset-lowering.md` — Adds. / Tests. (edited)
- `docs/plan_topics/V5d-T-subset-lowering.md` — Tests. (edited)
- `docs/plan_topics/V13b-query-schema-inference.md` — Deps. / Tests. (option-dependent)
- `docs/plan_topics/V13c-query-tool-loop.md` — Deps. (option-dependent)
- `docs/plan_topics/V2c-value-model.md` — Tests. (read-only)
- `docs/plan_topics/conventions.md` — Leaf format (`Adds.` descriptive-by-default rule) (read-only)
- `docs/plan_topics/coverage-matrix.md` — Code-keyed obligation areas (`SUBS → V5d, V5e`) (read-only)

## Spec Documents

None — `schema-subset.md` *Lowering Algorithm* steps 2–5 already define the obligations; the fix is internal to the plan (new `Tests.` bullets and `Deps.` edges that cite the existing spec steps).

## Affected Leaves

**Phases:** V5 (Schemas, descriptions, schema-subset), V13 (Query)

**Leaves (implementation order):**

- `V5d` — Schema-subset gate, lowering, and canonical hash — (modified) — and its paired `V5d-T`
- `V13b` — Query schema inference — (modified) — option-dependent home for the per-query `$defs` pruning assertion; gains `V5d` in `Deps.` if homed here
- `V13c` — Query tool loop and typed two-phase — (modified) — builds per-query request schemas without `V5d` in `Deps.`

## Consequence

**Severity:** correctness

The lowering pass can ship with the per-query `$defs` prune and the sidecar's two-map shape unimplemented or divergent while every `V5d`/`V5d-T` test passes and the `H5a` closing gate stays green, because `SUBS` carries no REQ-ID and these outputs carry no asserting bullet. Two reasonable implementers would produce different sidecar shapes (e.g. including anonymous string-literal-union positions, or keying by name instead of JSON Pointer), breaking `V2c`'s inbound enum-tag reattach; and unpruned `$defs` would inflate every typed-query request payload.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited plan leaves (`docs/plan_topics/V5d-subset-lowering.md` and its paired `V5d-T-subset-lowering.md`) are untracked working-tree files: `git ls-files` does not list them and `git log --follow` returns no commits, so the defect cannot be localised to any commit. The repository is a git work tree, but these files have never been committed.

## Solution Space

**Shape:** multiple

The finding carries two independent obligations that touch different vectors; resolving them in one diff over-couples the change. Address the smaller, scope-bounded obligation (the sidecar, confined to `V5d`/`V5d-T`) first, so the second obligation (per-query pruning, which adds a `Deps.` edge in a query leaf) lands on a stable baseline.

### Option A — Bind the sidecar producer contract in `V5d`

**Approach.** Add a code-keyed `Tests.` bullet to `V5d-T` (mirrored in `V5d`) asserting the *Lowering Algorithm* step-5 sidecar shape: the lowering pass captures, per `$defs` entry, a two-map sidecar — a wire-name translation map and a named-enum-position map keyed by JSON Pointer into the lowered fragment, with a position present iff its source type was a named `enum` declaration and anonymous string-literal-union positions absent.

**Plan edits.** New `V5d-T` / `V5d` `Tests.` bullet citing `schema-subset.md` *Lowering Algorithm* step 5 (the sidecar is a code-keyed `SUBS` obligation; cite the section/anchor, no REQ-ID exists). No `Deps.` change — `V2c` already lists `V5d`.

**Spec edits.** None.

**Pros.** Closes the producer/consumer divergence the seam route leaves open; bounded entirely to the `V5d` pair.

**Cons.** Adds one more bullet to a leaf the sibling atomicity finding already flags as oversized.

**Risks.** Low.

### Option B — Bind per-query `$defs` pruning and close its `Deps.` gap

**Approach.** Assert that a typed query's request schema contains only the `$defs` transitively reachable from its response-schema root (step 4). Home the assertion either in `V5d-T` (keeping all lowering obligations in one place) or in `V13b-T` (where per-query request schemas are first built); declare the chosen home in the leaf. Whichever leaf owns the per-query request construction must list `V5d` in its `Deps.`.

**Plan edits.** A `Tests.` bullet citing `schema-subset.md` *Lowering Algorithm* step 4 in the chosen home leaf and its `-T` partner; add `V5d` to the `Deps.` of `V13b` (and `V13c` if it constructs request schemas independently).

**Spec edits.** None.

**Pros.** Closes both the missing test and the missing dependency that currently lets unpruned `$defs` ship.

**Cons.** Touches a second slice (`V13`); the home choice is a real fork the implementer must record.

**Risks.** If homed in `V13b` but `V13c` also builds requests, the `Deps.` edge must be added there too or the gap reopens.

### Recommendation

Apply Option A first — it is confined to the `V5d`/`V5d-T` pair and closes the seam-divergence risk against `V2c` with no cross-slice edit. Then apply Option B on that baseline; home the per-query `$defs` pruning assertion in `V13b-T` (the leaf that first constructs per-query request schemas) and add `V5d` to `V13b` `Deps.`, checking whether `V13c` constructs request schemas independently — if so, add the `Deps.` edge there too. The `__inline_<slug>` hoist (step 2) and auto `$defs`/`$ref` (step 3) are already exercised transitively by the existing slug-collision and canonical-hash bullets; no separate bullet is required for them unless a reviewer finds an uncovered branch.

## Relationships

- T30 "Un-anchored normative MUSTs are invisible to the closing gate by construction" — must-follow (a general rule enumerating code-keyed obligations with closing leaves would govern how this case is closed).
- T31 "Adds. clause (ii) seam-binding test is undecidable from the `Deps.` field" — must-follow (decides whether the sidecar binds via the `Deps.`-consumer route or needs an explicit test).
- T24 "Parallel-batch settle-and-independent-lowering rule has no asserting leaf" — same-cluster (same class: a code-keyed lowering/settlement obligation bound to no `Tests.` bullet).
- T28 "Subagent parallel-initiation MUST has no closing leaf and cannot be lawfully authored" — same-cluster (same class: a code-keyed Class-1 obligation that binds to no leaf under the descriptive-`Adds.` discipline).

---

# T26 — Cancellation checkpoint granularity set unverified

**Original heading:** Cancellation checkpoint granularity set unverified
**Original section:** V17a — Cancellation core
**Kind:** validation
**Importance:** high
**Score:** 90
**MustFix:** false

## Finding

`V17a` `Adds.` names "the fixed checkpoint set (including pre-binder)" as a thing the leaf implements, and `cancellation.md` *Granularity* pins this down precisely: the interpreter checks the cancellation signal "at exactly these points and no others" — immediately before each `for`/`while` iteration, before dispatching each `@`-query, before each tool call, before each `invoke`, and before issuing the slash-command argument binder's LLM call. The same section mandates a load-bearing timing rule: the loop-iteration checkpoint yields one macrotask turn *before* reading the signal, so a Pi-dispatched abort (a macrotask) that flips `loomAbort.signal.aborted` during a compute-bound loop is observed before the next iteration — without this yield, Esc during such a loop never lands.

None of these is asserted by any `V17a` or `V17a-T` Tests bullet. The Tests cover `CNCL-1`/`CNCL-2`/`CNCL-3` (late-settlement discard), forwarding into `loomAbort`, downward-only propagation, and the `loom/parse/timeout-field-rejected` parse diagnostic — but nothing exercises which operations carry a checkpoint, the exhaustivity claim ("and no others", i.e. no checkpoint inside primitive ops or at straight-line statement boundaries), or the macrotask-yield-before-signal-check loop behaviour.

The Granularity rule is observable Class-1 behaviour, but it carries no numbered REQ-ID and is not a seam, so under `conventions.md`'s descriptive-by-default `Adds.` discipline it binds to no test surface as written. The spec itself notes the deterministic testability hook exists: the `Checkpoint` seam (`host-interfaces-services.md#checkpoint-seam`), already provided by `V8a` and already in `V17a` `Deps.`. The assertions are therefore authorable today; they are simply absent.

## Plan Documents

- `docs/plan_topics/V17a-T-cancellation-core.md` — Tests (edited)
- `docs/plan_topics/V17a-cancellation-core.md` — Tests, Adds. (edited)
- `docs/plan_topics/coverage-matrix.md` — CNCL row / Granularity mapping (option-dependent)

## Spec Documents

- `docs/spec_topics/cancellation.md` — Granularity (option-dependent — read-only for the minimal plan-internal fix; edited only if the Granularity rule is given a REQ-ID / GOV-16 inline label so it becomes coverage-mappable)

## Affected Leaves

**Phases:** V17 (Cancellation), vertical slice

**Leaves (implementation order):**

- `V17a-T` — Cancellation core (tests) — (modified)
- `V17a` — Cancellation core — (modified)

## Consequence

**Severity:** correctness

The fixed checkpoint set and the loop-iteration macrotask-yield can ship implemented incorrectly — extra or missing checkpoints, or a synchronous loop check with no yield — while every `V17a` test stays green, because no test observes checkpoint placement or the yield. The yield is the only thing that lets Esc abort a compute-bound `for`/`while`; two reasonable implementers would diverge on both the checkpoint set and the yield with no red signal to catch it.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited plan leaf files (`docs/plan_topics/V17a-cancellation-core.md` and `docs/plan_topics/V17a-T-cancellation-core.md`) are untracked in the git work tree (`git status` reports `??`; `git log --follow` returns no commits), so the defect cannot be localised to any commit.

## Solution Space

**Shape:** single

### Recommendation

Add Tests bullets to `V17a-T` (the authoritative test spec), mirrored in `V17a`, that drive the `Checkpoint` seam (`V8a`, already in `Deps.`) to assert the Granularity contract from `cancellation.md` *Granularity*:

- A checkpoint fires immediately before each of the five sites — each `for`/`while` iteration, each `@`-query dispatch, each tool call, each `invoke`, and the slash-command argument binder's LLM call — and fires at no other site (specifically: not inside a primitive operation such as arithmetic/comparison/field-index access, and not at a straight-line statement boundary).
- A signal flipped during a synchronous compute-bound `for`/`while` body is observed before the next iteration — i.e. the loop-iteration checkpoint yields one macrotask turn before reading the signal (the `loop-iter` case of the `Checkpoint` seam).

Cite the `cancellation.md` *Granularity* section for both. The section currently exposes no stable anchor or REQ-ID; if a citable identifier is wanted, add a GOV-16 inline label (or `<a id>`) to the *Granularity* section in `cancellation.md` first, then cite it from the bullets — otherwise reference `[cancellation.md — Granularity]` and the `Checkpoint` seam anchor (`host-interfaces-services.md#checkpoint-seam`) as the testability hook. Keep the assertions homed in `V17a-T` first so the implementation leaf's mirror lands on a stable test baseline.

Edge case the implementer must watch: the exhaustivity arm ("and no others") is the harder half — the `Checkpoint` seam hook must be able to witness the *absence* of a checkpoint at a primitive-op / statement boundary, not merely the presence of one at the five sites.

## Relationships

- T27 "V17a leaves three normative cancellation MUSTs with no asserting test" — same-cluster (same leaf; another set of normative `cancellation.md` MUSTs with no REQ-ID and no asserting `V17a-T` bullet; resolves independently via separate Tests bullets).
- T16 "Cancellation test bullet keyed by one diagnostic conflates four independent obligations" — same-cluster (same leaf; splitting the merged CNCL bullet touches the same Tests fields but is an orthogonal edit).
- T18 "Binder-call cancellation forwarding named in `V11f` `Adds.` but never asserted" — same-cluster (`V11f`; the pre-binder checkpoint and binder-call cancellation forwarding are adjacent facets of the same Granularity entry, but close in different leaves).

---

# T27 — V17a leaves three normative cancellation MUSTs with no asserting test

**Original heading:** Abort-reason propagation and two race-semantics MUSTs unasserted
**Original section:** V17a — Cancellation core
**Kind:** validation
**Importance:** high
**Score:** 90
**MustFix:** false

## Finding

`cancellation.md` carries three distinct normative MUSTs that `V17a` / `V17a-T` do not assert and that carry no REQ-ID:

1. **Abort-reason propagation** — when any forwarding path fires `loomAbort.abort(...)`, the runtime MUST propagate the source's `reason` so `loomAbort.signal.reason === source.reason` is observable at every downstream checkpoint, and the two reason-less paths MUST synthesise a JavaScript `Error` whose `message` is exactly `"loom cancelled by agent_end"` (the `agent_end`-driven slash-command trigger) and exactly `"loom cancelled by session shutdown"` (the `session_shutdown` teardown trigger).
2. **No retroactive rewrite of a completed `Ok`** — an operation that has already returned `Ok(v)` retains that value even if the signal fires before the next checkpoint; the interpreter MUST NOT rewrite a completed `Ok` into `Err({kind:"cancelled"})`.
3. **No top-level synthesis on tail abort** — when no further checkpoint executes before the loom returns, the top-level result is the value the loom would otherwise have produced; the runtime does NOT synthesise a top-level `cancelled`.

`V17a`/`V17a-T` Tests assert only `CNCL-1`/`CNCL-2`/`CNCL-3` — which `cancellation.md` defines narrowly as the *tool-call late-settlement discard* clauses (a) no-rebind, (b) no-second-`Err`, (c) no-second-`RuntimeEvent` — plus one generic `loomAbort`-forwarding bullet. None of the three MUSTs above is covered. The adjacent leaf `V4c` (terminal outcomes) covers conversation non-mutation and side-effect no-rollback (ERR-8…ERR-13) but not result-value retention vs. rewrite, so MUST (2) is genuinely uncovered rather than closed elsewhere.

Because these MUSTs are neither REQ-ID-anchored nor diagnostic-code-keyed, the `H5a` closing gate — which reconciles test-asserted REQ-IDs / registry codes — cannot detect their omission. All three are deterministically testable through the `Checkpoint` seam (`V8a`), so the gap is closeable; it is simply unclosed.

## Plan Documents

- `docs/plan_topics/V17a-cancellation-core.md` — Tests / Adds (edited)
- `docs/plan_topics/V17a-T-cancellation-core.md` — Tests (edited)
- `docs/plan_topics/coverage-matrix.md` — CNCL mapping rows (option-dependent)
- `docs/plan_topics/V9g-session-shutdown.md` — Tests (option-dependent — owns the synthesised `"loom cancelled by session shutdown"` reason emission)
- `docs/plan_topics/conventions.md` — REQ-ID discipline / code-keyed obligation areas (read-only — the un-anchored-MUST policy this fix interacts with)

## Spec Documents

- `docs/spec_topics/cancellation.md` — *Abort-reason propagation* paragraph and the two *Race semantics* paragraphs (no-retroactive-rewrite, no-top-level-synthesis) (edited under Option B; read-only under Option A)

## Affected Leaves

**Phases:** V9 — Extension host integration; V17 — Cancellation

**Leaves (implementation order):**

- V9g — Session-shutdown teardown and emission isolation — (modified) — option-dependent; the `"loom cancelled by session shutdown"` synthesised-reason assertion may home here
- V17a — Cancellation core — (modified)
- V17a-T — Cancellation core (tests) — (modified)

## Consequence

**Severity:** correctness

Each of the three MUSTs can ship broken with every `V17a` test green: a forwarder that drops `reason`, an interpreter that rewrites a completed `Ok` to `cancelled`, or a runtime that synthesises a spurious top-level `cancelled` on a pure-tail abort would all pass the existing `CNCL-1/2/3` + forwarding bullets, and the `H5a` closing gate cannot fire on un-anchored MUSTs. Two reasonable implementers would diverge on the race semantics and the synthesised-reason byte-exactness.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The cited leaf files `docs/plan_topics/V17a-cancellation-core.md` and `docs/plan_topics/V17a-T-cancellation-core.md` are untracked working-tree additions (never committed), so git history cannot localise when the missing-assertion defect entered the corpus. The repository is a git work tree, but these two files are not yet under version control.

## Solution Space

**Shape:** multiple

### Option A — Plan-only assertion bullets

**Approach.** Add three Tests bullets to `V17a-T` (mirrored verbatim in `V17a`) that assert the three MUSTs by driving the `Checkpoint` seam, citing the relevant `cancellation.md` section anchors as behavioural references. Leaves the MUSTs un-anchored (no REQ-ID).

**Plan edits.** In `V17a-T` (mirror in `V17a`), add:
- abort-reason propagation: after each forwarding path fires, assert `loomAbort.signal.reason === source.reason`; assert the two synthesised `Error.message` strings byte-exact — `"loom cancelled by agent_end"` and `"loom cancelled by session shutdown"`.
- no-retroactive-rewrite: land an abort (via the `Checkpoint` seam) after an operation returns `Ok(v)` but before the next checkpoint; assert the value is retained and is not rewritten to `Err({kind:"cancelled"})`.
- no-top-level-synthesis: land an abort in a pure tail after the final cancellable operation; assert the top-level result is the produced value and no synthesised top-level `cancelled` appears.

**Spec edits.** None.

**Pros.** Plan-internal; no spec edit; closes the behavioural gap immediately.
**Cons.** The three MUSTs remain invisible to the `H5a` REQ-ID/code-keyed reconciliation; future coverage tracking still relies on the named tests existing, not on a gate.
**Risks.** A later re-anchoring of these MUSTs would force a re-edit of the same bullets.

### Option B — Anchor in spec, map, then assert

**Approach.** Anchor the three MUSTs in `cancellation.md` (REQ-ID or GOV-16 inline label), map them in `coverage-matrix.md`, then add the Tests bullets citing those identifiers, so the closing gate tracks them mechanically.

**Plan edits.** The same three Tests bullets as Option A, but each citing its new identifier; add `coverage-matrix.md` rows mapping the new IDs → `V17a` (and the `"loom cancelled by session shutdown"` synthesised-reason facet → `V9g`, since `V9g`'s handler produces that reason).

**Spec edits.** Add stable anchors / REQ-IDs to the *Abort-reason propagation* paragraph and the two *Race semantics* paragraphs of `cancellation.md` (candidate identifiers continuing the CNCL series, e.g. `CNCL-4` abort-reason propagation, `CNCL-5` no-retroactive-rewrite, `CNCL-6` no-top-level-synthesis).

**Pros.** Mechanically gate-trackable; closes the gap by rule rather than case-by-case; consistent with the corpus's fix-spec-first pattern for un-anchored Class-1 MUSTs.
**Cons.** Touches the spec; overlaps the unresolved un-anchored-MUST policy in `conventions.md`.
**Risks.** Choosing concrete REQ-IDs before the `conventions.md` un-anchored-MUST policy is settled could collide with the code-keyed-obligation-table mechanism that finding proposes.

### Recommendation

Take Option B: anchor the three MUSTs in `cancellation.md`, map them in `coverage-matrix.md`, and add the citing Tests bullets to `V17a-T` (mirrored in `V17a`), so the `H5a` gate can confirm each MUST has a closing test. Edge cases the implementer must watch: the abort-reason bullet must assert reason *identity* (`===`) at a downstream checkpoint, not merely that `aborted` is true; the two synthesised-reason strings are byte-exact and the first source's reason wins under the one-shot guard; and the session-shutdown synthesised-reason facet is produced by `V9g`'s handler, so its assertion (and matrix row) should target `V9g` while the propagation contract itself stays in `V17a`. If the `conventions.md` un-anchored-MUST policy lands first, prefer its chosen anchoring mechanism for the identifiers.

## Relationships

- T26 "Cancellation checkpoint granularity set unverified" — same-cluster (same leaf `V17a`; another un-anchored Class-1 cancellation behaviour; resolved by the same `V17a-T` assertion pass but independently).
- T16 "Cancellation test bullet keyed by one diagnostic conflates four independent obligations" — same-cluster (same `V17a-T` Tests block; the loomAbort-forwarding bullet split).
- T30 "Un-anchored normative MUSTs are invisible to the closing gate by construction" — must-follow (the chosen policy for un-anchored MUSTs determines whether these three get REQ-IDs or code-keyed-table entries; Option B depends on it).
- T28 "Subagent parallel-initiation MUST has no closing leaf and cannot be lawfully authored" — same-cluster (same class: un-anchored Class-1 MUST with no closing leaf).
- T24 "Parallel-batch settle-and-independent-lowering rule has no asserting leaf" — same-cluster (same class of un-anchored MUST coverage gap).

---

# T28 — Subagent parallel-initiation MUST has no closing leaf and cannot be lawfully authored

**Original heading:** Subagent parallel-initiation MUST uncovered and un-authorisable (V9i)
**Original section:** Subagent / tool-call concurrency coverage
**Kind:** spec-coverage
**Importance:** blocker
**Score:** 200
**MustFix:** true

## Finding

`subagent.md` §*Concurrent-invocation isolation and concurrency disposition* states a runtime obligation with a prescribed conformance test: when the model emits N (for any fixed N ≥ 3) subagent-mode `.loom` callables as parallel tool calls in one assistant turn, the runtime **MUST** initiate `createAgentSession` for all N invocations before any one of them returns, witnessed by a fake `AgentSession` whose `sendUserMessage` blocks until explicitly released (a conformant runtime has created all N sessions and entered each `sendUserMessage` before any blocked call is released). This MUST sits in section prose between `PIC-9` and `PIC-2` and carries no numbered `PIC-N` REQ-ID of its own; it is also not a diagnostic-coded obligation and not a cross-leaf seam.

Because `coverage-matrix.md`'s closing gate (operationalised by `H5a`) keys only on numbered REQ-IDs (the *Numbered REQ-IDs* table) and diagnostic-code-keyed areas (the *Code-keyed obligation areas* table), this MUST binds to no leaf. No leaf in the subagent/tool-call neighbourhood — `V9i`, `V9e`, `V9c`, or `V14a` — carries a `Tests.` bullet asserting the N≥3 blocking-fake witness. `V9i`'s only PIC bullet is `PIC-9` (session lifecycle); the coverage matrix maps `PIC-9 → V9i` but nothing closes the parallel-initiation obligation.

The gap compounds with `conventions.md` *Sequential by default*: `Promise.all` / `Promise.race` / `Promise.allSettled` / `Promise.any` are forbidden in `src/**` unless the calling leaf's `Spec.` field cites a spec REQ-ID whose normative text mandates concurrency, with the leaf's `Adds.` naming the construct and REQ-ID together (and the ESLint allow-list entry carrying a `// allow: <REQ-ID> — <spec-page>` comment). Initiating all N spawns before any returns is inherently concurrent dispatch, yet there is no REQ-ID to cite — so the parallel dispatch the MUST demands cannot even be lawfully authored under the allow-list discipline. `coverage-matrix.md` already shows this exact gap being patched case-by-case for one peer obligation (the *No additional access channels* denial-surface MUST, listed in *Code-keyed obligation areas* mapped to `V14a`), confirming the parallel-initiation MUST is an omission rather than a deliberate exclusion.

## Plan Documents

- `docs/plan_topics/V9i-subagent-isolation.md` — Tests / Spec (edited)
- `docs/plan_topics/coverage-matrix.md` — Code-keyed obligation areas / Numbered REQ-IDs (edited)
- `docs/plan_topics/conventions.md` — Sequential by default (option-dependent)
- `docs/plan_topics/V14a-tool-calls.md` — Spec / Tests (read-only; alternative dispatch-surface home)
- `docs/plan.md` — V9 / V14 slice listing (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/subagent.md` — Concurrent-invocation isolation and concurrency disposition (edited)
- `docs/spec_topics/governance.md` — REQ-ID prefix table / PIC numbering (edited)

## Affected Leaves

**Phases:** V9 — Extension host integration (and V14 — Tool calls, if the dispatch-surface home is chosen)

**Leaves (implementation order):**

- `V9c` — Prompt-mode conversation drive and active-set gating — (read-only context)
- `V9e` — `ActiveInvocationRegistry` — (read-only context)
- `V9i` — Subagent-mode session isolation and lifecycle — (modified)
- `V14a` — Tool calls (code-side) and `CodeToolError` — (read-only context; alternative home)

## Consequence

**Severity:** blocking

A normative spec MUST with a prescribed conformance test has no closing leaf and is invisible to the `H5a` closing gate, so the gate passes vacuously and loom 1.0 silently ships without the parallel-initiation guarantee. Worse, the concurrency the MUST requires cannot be lawfully written: *Sequential by default* demands a REQ-ID citation that does not exist, so the implementer of `V9i` (or `V14a`) cannot author the required `createAgentSession`-for-all-N dispatch without first introducing the missing anchor.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 7afe9bb — pi-loom spec: resolve "no-invocation-cap MUST NOT is unobservable" (2026-05-31, Thomas Andersen); relocated by f5e89f4 — docs: enforce 100KB hard / 30KB recommended size cap on spec set (2026-06-04, Thomas Andersen)
**History:** Commit 7afe9bb added the N≥3 parallel-initiation MUST and its blocking-fake conformance test into `pi-integration-contract.md` (it became observable then); f5e89f4 split that prose into `subagent.md` during the spec-set size-cap reorganisation. The spec obligation is committed, but the plan-side coverage that would close it — the populated `coverage-matrix.md` and the `V9i` leaf — exists only as uncommitted working-tree content (`coverage-matrix.md` modified, `V9i-subagent-isolation.md` untracked) that never added a mapping row or `Tests.` bullet for it, so the omission is not pinnable to a plan commit.

## Solution Space

**Shape:** single

### Recommendation

Mint a new numbered `PIC-N` REQ-ID on the parallel-initiation MUST in `subagent.md` §*Concurrent-invocation isolation and concurrency disposition*, per the `conventions.md` *Spec drift* rule (fix the spec first in a dedicated commit), and register the new ID in the `governance.md` PIC prefix table.

- Add a `Tests.` bullet to `V9i` (and its `V9i-T` partner) citing the new `PIC-N` and asserting the N≥3 blocking-fake witness (all N `createAgentSession` calls entered before any blocked `sendUserMessage` is released).
- Add a `PIC-N → V9i` row to the *Numbered REQ-IDs* table in `coverage-matrix.md`.
- Add the concurrency-construct allow-list entry in `conventions.md` / the ESLint allow-list citing the new `PIC-N`, satisfying *Sequential by default*.

The decisive constraint is the *Sequential by default* allow-list citation requirement: only a numbered REQ-ID both anchors the coverage and supplies the `// allow:` citation that makes the `createAgentSession`-for-all-N dispatch lawful to author. Resolve the spec anchor first (dedicated commit), then add the `V9i`/`V9i-T` `Tests.` bullet, the coverage-matrix row, and the allow-list entry citing the new ID. The implementer should confirm the home leaf: `V9i` owns `createAgentSession` and is the finding's attributed home, but `V14a` (the parallel-tool-call dispatch surface) is a defensible alternative — pick one and declare it so the conformance test has a single owner. PIC numbering / retirement rules in `governance.md` must be honoured (append-only, no numbering hole).

## Relationships

- T30 "Un-anchored normative MUSTs are invisible to the closing gate by construction" — must-follow (the systemic policy for un-anchored MUSTs; if a `conventions.md`/`H5a` rule is adopted there, it mechanically forces this MUST into the *Code-keyed obligation areas* table).
- T24 "Parallel-batch settle-and-independent-lowering rule has no asserting leaf" — same-cluster (sibling parallel-tool-call concurrency coverage gap; resolves via its own `Tests.` bullet).
- T32 "Adds. binding clause (i) cannot bind code-keyed obligations" — must-follow (constrains whether a code-keyed-area mapping could bind the implementer in lieu of the new REQ-ID).

---

# T29 — Release-gate activation has no owning leaf

**Original heading:** Release-gate activation has no named owner
**Original section:** H5a — Closing-gate automation
**Kind:** assumptions
**Importance:** high
**Score:** 100
**MustFix:** true

## Finding

`H5a` builds the REQ-ID / diagnostic-code closing gate but explicitly defers its most load-bearing failure mode: the live-corpus reconciliation of the *live* spec REQ-ID set against the live `coverage-matrix.md` "does not gate `npm test` at this leaf and first becomes binding at the loom 1.0 release gate." That same "loom 1.0 release gate" is the CI enforcement point promised in `plan.md` item 5 ("every executable spec REQ-ID has at least one closing leaf by the loom 1.0 release gate") and in `coverage-matrix.md` ("at the loom 1.0 release gate, any executable REQ-ID without a mapping fails CI").

No leaf owns the step that activates that flip. The vertical phases end at `V18` (build-time SDK gates); there is no release-gate / 1.0-gate leaf, and no existing leaf's `Adds.` or `Ships when` wires the live-corpus mode from non-gating to gating. The full-coverage guarantee the plan leans on for its central traceability promise therefore depends on an activation step that no leaf is responsible for producing.

## Plan Documents

- `docs/plan_topics/H5a-closing-gate-automation.md` — `Adds.` / `Ships when.` (edited)
- `docs/plan_topics/coverage-matrix.md` — header paragraph (release-gate CI clause) (edited)
- `docs/plan.md` — "How to use this plan" item 5 (edited)
- `docs/plan_topics/conventions.md` — *REQ-ID discipline* (read-only)
- `docs/plan_topics/V18c-version-bump-checklist.md` — `Adds.` / `Ships when.` (option-dependent)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal, Vertical (V18)

**Leaves (implementation order):**

- `H5a` — REQ-ID / diagnostic-code closing-gate automation — (modified)
- `V18c` — Pi version-bump procedure and gates — (option-dependent)
- `<new>` — terminal live-corpus-activation leaf — (added; option-dependent)

## Consequence

**Severity:** blocking

The live-corpus full-coverage gate never fires in its binding form: with no leaf owning the non-gating→gating flip, the reconciliation that backs `plan.md` item 5 silently stays in fixture-only mode, so an executable spec REQ-ID with no closing-leaf mapping ships unimplemented without ever reddening CI. The plan's central coverage safety net is unobservable as written.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** 15f69aa — "pi-loom plan: finish scaffold/template re-pivot from commit 657ee76"
**History:** The release-gate-as-coverage-CI-deadline was introduced in 15f69aa (2026-05-26), which first wrote both `coverage-matrix.md`'s "at the … release gate, any executable REQ-ID without a mapping fails CI" clause and `plan.md` item 5's "by the … release gate" promise; it was carried unchanged through the "V1.0"→"loom 1.0" rename in d3860db (2026-05-28). No release-gate / 1.0-gate leaf has ever existed in any commit (`git log --all` over `H5a*` / `*closing-gate*` is empty). The `H5a` leaf that makes the live-corpus deferral explicit ("does not gate `npm test` at this leaf and first becomes binding at the loom 1.0 release gate") is an uncommitted working-tree addition and likewise names no activation owner. The missing owner is therefore latent since the release-gate concept's inception, not introduced by any single later edit.

## Solution Space

**Shape:** multiple

### Option A — Fold the activation into `H5a` (no phantom release gate)

**Approach.** Strike the deferral-to-a-separate-"release gate" framing; make `H5a` own the live-corpus reconciliation mode itself, gated behind an explicit trigger the same leaf wires (so it does not redden `main` before all coverage-producing leaves land). The "loom 1.0 release gate" stops being a distinct, unowned thing and becomes the live-corpus mode of the gate `H5a` already builds.
**Plan edits.** `H5a` `Adds.` / `Ships when.`: state that the live-corpus reconciliation runs as a mode of the same gate, owned by `H5a`, with the named trigger/condition under which it becomes binding; retarget `plan.md` item 5 and `coverage-matrix.md`'s clause to name `H5a`'s live-corpus mode instead of an abstract "release gate."
**Spec edits.** None.
**Pros.** No new leaf; single owner; eliminates the phantom "release gate" referenced in three places.
**Cons.** `H5a` lands early (Horizontal), so the binding trigger must be unambiguous to avoid either reddening `main` prematurely or never firing; the activation condition becomes `H5a`'s responsibility to define precisely.
**Risks.** If the trigger is under-specified, the same "never actually fires" gap re-appears inside `H5a`.

### Option B — Dedicated terminal activation owner

**Approach.** Add a terminal leaf (`<new>`) sequenced after the last coverage-producing leaf whose `Ships when` flips `H5a`'s live-corpus reconciliation to binding and asserts green full coverage of the live spec REQ-ID set. Alternatively, assign that step to the existing release-adjacent leaf `V18c` (version-bump procedure and gates) by extending its `Adds.` / `Ships when` to include the live-corpus activation.
**Plan edits.** Either author `<new>` and link it as the tail leaf, or extend `V18c`; in both cases retarget `plan.md` item 5, `coverage-matrix.md`'s clause, and `H5a`'s deferral text to name that owner.
**Spec edits.** None.
**Cons.** Adds a leaf (or stretches `V18c`, which is otherwise scoped to SDK version-bump); the owner must be sequenced after every coverage-producing leaf.
**Pros.** Matches the deferred-to-release semantics exactly: the flip lands precisely when all leaves are done, so `main` is never red on incomplete coverage.
**Risks.** A mis-sequenced owner (deps not covering every coverage-producing leaf) would let the gate activate against incomplete coverage.

### Recommendation

Resolve the smaller, scope-bounding question first — pick the owner — then retarget the references. Prefer **Option B with a dedicated terminal leaf** (or `V18c` if a new leaf is unwanted): the live-corpus mode genuinely must not bind until all coverage-producing leaves land, so the activation belongs to a leaf sequenced last, not to early-Horizontal `H5a`. Whichever owner is chosen, the three release-gate references — `H5a`'s deferral sentence, `coverage-matrix.md`'s CI clause, and `plan.md` item 5 — must name that owner so the activation is traceable to a single leaf. Edge case the implementer must watch: the activating leaf's `Deps` must transitively include every leaf that can introduce an executable REQ-ID, or the gate can activate against incomplete coverage.

## Relationships

- T19 "Plan has no terminal end-to-end integration-acceptance leaf" — co-resolve (both are answered by an owned terminal release-gate leaf; the new terminal leaf can carry the live-corpus activation as well as the integrated run).

---

# T30 — Un-anchored normative MUSTs are invisible to the closing gate by construction

**Original heading:** REQ-ID discipline — un-anchored normative MUSTs dropped from coverage by construction
**Original section:** conventions.md
**Kind:** spec-coverage
**Importance:** high
**Score:** 100
**MustFix:** true

## Finding

The loom 1.0 closing gate is the plan's mechanical guarantee that every executable
spec obligation has a closing leaf. As specified in `conventions.md` *REQ-ID
discipline*, the gate fires on exactly two surfaces: a spec REQ-ID with no
`coverage-matrix.md` mapping, and a diagnostics-registry code with no asserting
test (plus the retired/live-ID clash and per-prefix numbering-hole checks). The
binding-class taxonomy in the same file's *Leaf format — Adds.* rule reinforces
the same two-surface model: a mechanism binds only when it is (i) an observable
behaviour carrying a cited REQ-ID or (ii) a named cross-leaf seam a `Deps.`
consumer relies on.

A normative MUST/MUST-NOT that carries no numbered `PREFIX-N` REQ-ID, is not
keyed to a `loom/{parse,load,runtime}/*` diagnostic code, and is not a seam falls
outside both surfaces. Such an obligation is invisible to the binding-class test
(it binds no leaf) and invisible to the closing gate (the gate enumerates only
REQ-IDs and registry codes), so it can ship unimplemented with no test red and no
CI failure. GOV-22 (`spec_topics/governance/req-id-prefix-table-active-b.md`)
names exactly this residue class — obligations never coined as REQ-IDs — but the
plan has no rule that forces each one onto a closing leaf.

The gap is currently handled case-by-case rather than by rule. `coverage-matrix.md`
patches one such MUST ad hoc — the *No additional access channels* denial-surface
MUST in `pi-integration-contract/conversation-drive.md`, mapped to `V14a` with the
inline annotation "(un-anchored; GOV-22 residue)". The cost of relying on manual
patching instead of a rule is demonstrated by the subagent parallel-initiation
MUST in `subagent.md` §*Concurrent-invocation isolation*, which carries no
`PIC-N`, is not a seam, and is mapped to no leaf at all (see Related Findings). A
reviewer cannot mechanically confirm that every un-anchored normative MUST has a
closing leaf, because nothing enumerates the class or gates on its closure.

## Plan Documents

- `docs/plan_topics/conventions.md` — *REQ-ID discipline* (edited)
- `docs/plan_topics/coverage-matrix.md` — *Code-keyed obligation areas* (edited)
- `docs/plan_topics/H5a-closing-gate-automation.md` — Tests / seeded fixtures (edited)
- `docs/plan_topics/V14a-tool-calls.md` — closes the one currently-patched un-anchored MUST (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — *No additional access channels* MUST (read-only)
- `docs/spec_topics/pi-integration-contract/subagent.md` — *Concurrent-invocation isolation* MUST (read-only)
- `docs/spec_topics/governance/req-id-prefix-table-active-b.md` — GOV-22 (un-anchored obligations) (read-only)

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H5a` — REQ-ID / diagnostic-code closing-gate automation — (modified)

The enumeration sweep may attach an already-existing closing leaf to each
un-anchored MUST (e.g. `V14a` for the denial-surface MUST) or, where a MUST is
currently uncovered, require a `<new>` closing leaf; those leaf assignments are
content produced by the fix, not changes to `H5a` itself.

## Consequence

**Severity:** correctness

An entire class of normative MUST/MUST-NOT obligations — those with no REQ-ID, no
diagnostic code, and no seam — can silently ship unimplemented because neither the
binding-class test nor the closing gate observes them. The plan's coverage
guarantee is therefore false for this class: it has already let the subagent
parallel-initiation MUST reach no leaf, and the gate would pass green regardless.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 15f69aa — pi-loom plan: finish scaffold/template re-pivot from commit 657ee76 (2026-05-26, Thomas Andersen)
**History:** The closing-gate rule in `conventions.md` *REQ-ID discipline* was authored at 15f69aa enumerating exactly two CI-failure surfaces — an unmapped spec REQ-ID and a diagnostics-registry code with no asserting test — and never carried a third arm for normative MUSTs that are neither REQ-ID-anchored nor diagnostic-code-keyed; the blind spot has been present in that rule since (the line's last touch, f5e89f4 on 2026-06-04, is a size-cap reflow, not a substantive change). The binding-class *Adds.* taxonomy and the populated `coverage-matrix.md` *Code-keyed obligation areas* table (including the ad-hoc "No additional access channels … (un-anchored; GOV-22 residue)" → `V14a` row) are uncommitted working-tree edits that make the gap concrete but do not themselves introduce it.

## Solution Space

**Shape:** multiple

This finding carries two independent obligations: (1) state the rule and enumerate
the obligation class, and (2) mechanically enforce closure of that class at the
gate. They touch different artefacts and cannot land as one paragraph edit, so
each is given its own option below; both are required.

### Option A — Rule + enumeration of the un-anchored-MUST class

**Approach.** Add a clause to `conventions.md` *REQ-ID discipline* requiring that
every normative MUST/MUST-NOT lacking a numbered REQ-ID and a registry diagnostic
code be enumerated in `coverage-matrix.md`'s *Code-keyed obligation areas* table
with a named closing leaf. Perform the enumeration sweep over `spec_topics/**`,
adding one row per such MUST (the existing *No additional access channels* → `V14a`
row becomes one rule-driven row among many rather than a one-off patch).

**Plan edits.** `conventions.md` *REQ-ID discipline*: insert the enumeration
obligation, cross-referencing GOV-22. `coverage-matrix.md` *Code-keyed obligation
areas*: add a row for each un-anchored normative MUST found in the sweep, each with
an existing or `<new>` closing leaf.

**Spec edits.** None — the MUSTs already exist in the spec; the sweep references
them.

**Pros.** Makes the obligation class explicit and auditable; converts the existing
ad-hoc patch into a uniform rule; surfaces currently-uncovered MUSTs (e.g. the
subagent parallel-initiation MUST) during the sweep.

**Cons.** The enumeration is a manual sweep; without Option B it is not
mechanically guarded against future drift.

**Risks.** A MUST missed by the sweep stays invisible until Option B's gate (or a
later reviewer) catches it.

### Option B — Closing-gate enforcement of the enumerated class

**Approach.** Add a closing-gate arm in `H5a` that fails CI when a normative
MUST/MUST-NOT lacking a REQ-ID and a registry code is not present in the
*Code-keyed obligation areas* table with a closing leaf, with a seeded fixture
exercising the new arm (green on the no-violation fixture, red on a seeded
un-enumerated-MUST fixture).

**Plan edits.** `H5a-closing-gate-automation.md`: add a `Convention:` Tests bullet
for the new arm and extend the *Adds.* description of the gate's failure modes;
add the seeded violation/no-violation fixtures to the *Ships when* gate.
`conventions.md` *REQ-ID discipline*: cross-reference the new `H5a` arm from the
rule added in Option A.

**Spec edits.** None.

**Pros.** Turns the rule into a mechanical guarantee; drift after the sweep fails
CI rather than silently accumulating.

**Cons.** Detecting "a normative MUST not in the table" mechanically requires a
discriminator for un-anchored normative MUSTs in `spec_topics/**`; the gate's
recogniser must define what counts (a precise recogniser is itself a small design
task).

**Risks.** An over-broad recogniser produces false-positive gate failures; an
over-narrow one re-opens the same blind spot.

### Recommendation

Resolve **Option A first**, then **Option B**. Option A bounds the scope — it
defines the obligation class and produces the enumerated set the gate checks —
so Option B's recogniser and fixtures land against a stable enumeration rather
than a moving target. The implementer must watch that the recogniser in Option B
matches the obligation class defined in Option A exactly (REQ-ID-less,
registry-code-less, non-seam normative MUST/MUST-NOT), so the gate neither
over-fires nor lets the residue class slip. The spec is read-only for this fix:
the un-anchored MUSTs are referenced, not re-anchored — re-anchoring any
individual MUST as a REQ-ID is a fix-spec-first decision owned by the relevant
spec-coverage finding (e.g. the subagent MUST), not by this systemic rule.

## Relationships

- T28 "Subagent parallel-initiation MUST has no closing leaf and cannot be lawfully authored" — must-precede (a concrete un-anchored MUST mapped to no leaf; its fix — "add the mandate to the Code-keyed obligation areas table with a closing leaf" — is exactly the mechanism this systemic rule would force, so settle the systemic rule's shape first).
- T24 "Parallel-batch settle-and-independent-lowering rule has no asserting leaf" — must-precede (another un-anchored behaviour with no closing leaf that the enumeration sweep + gate would catch).
- T27 "V17a leaves three normative cancellation MUSTs with no asserting test" — must-precede (three un-anchored cancellation MUSTs whose anchoring mechanism this rule determines).
- T32 "Adds. binding clause (i) cannot bind code-keyed obligations" — same-cluster (refines the same binding-class taxonomy this finding's gap rests on; resolves independently).

---

# T31 — Adds. clause (ii) seam-binding test is undecidable from the `Deps.` field

**Original heading:** Leaf format — Adds. clause (ii): "seam another leaf's Deps. relies on" not decidable
**Original section:** conventions.md
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The `conventions.md` *Leaf format* rule makes `Adds.` descriptive by default and then lists two ways a named mechanism becomes binding. Clause (ii) says a mechanism binds when it is "a named cross-leaf **seam** that another leaf's **Deps.** relies on." But the same *Leaf format* section defines `Deps.` as "Other leaf IDs that must be complete first … Cite specific leaf IDs (`V4b`, `V9a–V9e`); never a bare group token." A `Deps.` field therefore contains only leaf IDs — it never names a seam, so a `Deps.` field can never literally "rely on" a named seam.

As written, clause (ii) is either inert (no seam is ever named in any `Deps.` field, so the clause matches nothing) or it silently requires reading the consumer leaf's prose to decide binding — and that reading step is exactly the hinge that separates a permitted Class-2 seam from a forbidden Class-3 mechanism. The binding test cannot be applied mechanically against the artifact it names.

The corpus already depends on this test resolving correctly: `V2c` lists `V5d` in its `Deps.` and relies on `V5d`'s enum-tag/wire-name **sidecar** seam, but that seam is named only in `V2c`'s `Adds.` prose, not in its `Deps.` field. Under clause (ii)'s literal wording the sidecar's producer contract is non-binding; a reviewer cannot decide otherwise without leaving the `Deps.` field the clause points at.

## Plan Documents

- `docs/plan_topics/conventions.md` — *Leaf format*, `Adds.` rule clause (ii) (edited)
- `docs/plan_topics/leaf-template.md` — `Adds.` field gloss, which paraphrases the same clause (option-dependent)

## Spec Documents

None

## Affected Leaves

**Phases:** None

**Leaves (implementation order):**

None — the defect is confined to the cross-cutting `Adds.` rule and its template paraphrase; correcting the wording forces no leaf edit. (`V2c`/`V5d` illustrate the failure mode but are not themselves modified by this fix.)

## Consequence

**Severity:** correctness

Two reasonable reviewers diverge on whether a seam named in a leaf's `Adds.` binds, because the stated test references a field (`Deps.`) that structurally cannot carry a seam name. A genuine cross-leaf seam can be treated as illustrative-only, so its producer contract ships unasserted and the producer and consumer silently diverge — the exact failure already latent for the `V5d` sidecar consumed by `V2c`.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** The `Adds.` binding-clause prose carrying clause (ii) ("a named cross-leaf **seam** that another leaf's **Deps.** relies on") is an uncommitted working-tree edit to `docs/plan_topics/conventions.md`; `git blame` reports the line as "Not Committed Yet" and `git diff HEAD` shows it added on top of the original one-sentence `Adds.` text from `fecb504f` (2026-05-04, "Split spec.md and plan.md into per-topic / per-phase files"). Because the defect lives only in the working tree and is not yet in any commit, no introducing SHA can be cited.

## Solution Space

**Shape:** single

### Recommendation

Reword clause (ii) in the `conventions.md` *Leaf format* `Adds.` rule so the binding test names an observable artifact rather than the `Deps.` field. State that a seam named in a leaf's `Adds.` binds when some other leaf that lists this leaf in its `Deps.` names that seam in its own `Adds.` or `Tests.` — i.e. "relies on" is observed in the consumer leaf's `Adds.`/`Tests.` prose, while the `Deps.` edge only establishes that the consumer reaches this leaf. Suggested literal replacement for the clause:

> (ii) a named cross-leaf **seam** that some other leaf binds against — i.e. a leaf listing this leaf in its `Deps.` names the seam in its own `Adds.` or `Tests.`

Apply the matching wording to the `leaf-template.md` `Adds.` gloss so the template paraphrase does not drift from the convention. Edge case for the author: a seam named in `Adds.` with no such consumer remains illustrative (non-binding) by the same test — keep that residual case explicit so the descriptive-by-default default still holds.

## Relationships

- T32 "Adds. binding clause (i) cannot bind code-keyed obligations" — same-cluster (sibling clause in the same `Adds.` rule; resolves independently).
- T25 "`V5d` lowering-pass outputs are named only in descriptive `Adds.`, bound by no `Tests.` bullet" — must-precede (the `V5d` sidecar's binding status turns on this clause's test; settle the clause wording before deciding the sidecar's coverage route).

---

# T32 — Adds. binding clause (i) cannot bind code-keyed obligations

**Original heading:** Leaf format — Adds. clause (i): code-keyed obligations unbindable
**Original section:** conventions.md
**Kind:** implementability
**Importance:** high
**Score:** 100
**MustFix:** false

## Finding

The `Adds.` binding rule in `conventions.md` makes `Adds.` prose descriptive by default and elevates a named mechanism to binding only when it is either (i) "an observable behaviour carrying a cited REQ-ID," or (ii) a named cross-leaf seam another leaf's `Deps.` relies on. Clause (i)'s only binding hook is a numbered `PREFIX-N` REQ-ID.

The plan, however, recognises an entire class of pages that own their obligations through diagnostic codes or named normative spec steps rather than numbered REQ-IDs. `coverage-matrix.md` enumerates these explicitly under "Code-keyed obligation areas (no numbered REQ-IDs)" — `lexical.md` (LEX), `grammar.md` (GRAM), `runtime-value-model.md` (RVM), `expressions.md` (EXPR), `schema-subset.md` (SUBS), `query/` (QRY), `tool-calls.md` (TOOL) — and the leaves closing them cite `loom/...` diagnostic codes or named normative steps in their `Tests.` bullets, never a `PREFIX-N` ID (these are a standing spec residue under `governance.md` GOV-22).

For these pages, a mechanism whose only Class-1 surface is a code-keyed behavioural assertion can never satisfy clause (i) — there is no REQ-ID to cite. Unless the mechanism happens to be a cross-leaf seam (clause (ii)), it falls into the closing "illustrative — authorises no … mandate absent a REQ-ID or a `Deps.` consumer" residue, even when the cited spec page makes the behaviour normative. The (i)/(ii) classification an author must apply to each named mechanism is therefore undecidable (or silently under-binds) for every code-keyed obligation page.

## Plan Documents

- `docs/plan_topics/conventions.md` — `Adds.` rule binding clause (edited)
- `docs/plan_topics/coverage-matrix.md` — "Code-keyed obligation areas (no numbered REQ-IDs)" table (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** None

**Leaves (implementation order):** None

The defect is confined to the cross-cutting `Adds.` rule in `conventions.md`. The recommended clarification does not change any leaf's `Tests.` / `Ships when` criteria: the code-keyed implementation leaves (e.g. `V1a`, `V1b`, `V2a`, `V2c`, `V3a`, `V5d`, `V5e`, `V13a`–`V13d`, `V14a`) already cite diagnostic codes / named spec steps in their `Tests.` bullets, and the fix only brings the binding rule's vocabulary into line with what those leaves already do.

## Consequence

**Severity:** correctness

Two reasonable authors classifying an `Adds.`-named mechanism on a code-keyed page diverge: one reads clause (i) literally (no REQ-ID ⇒ illustrative / non-binding), the other treats the normative spec step as binding. The literal reading silently drops normative obligations on LEX/GRAM/RVM/EXPR/SUBS/QRY/TOOL pages into the non-binding bucket, so a mechanism the spec mandates can ship unimplemented while the leaf still passes its declared gate.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** none committed — the `Adds.` binding clause is an uncommitted working-tree edit to `docs/plan_topics/conventions.md`; the clause is absent at HEAD (`f9c5354`, 2026-06-09, Thomas Andersen), where the `Adds.` bullet reads only "One sentence — what the leaf introduces."
**History:** The defect is git-tracked corpus but lives in an as-yet-uncommitted change. `git diff HEAD -- docs/plan_topics/conventions.md` shows the entire descriptive-by-default `Adds.` binding rule — including the REQ-ID-only clause (i), clause (ii), and the "illustrative / no Class-3 mandate" residue — was added wholesale by the current working-tree edit. The pickaxe (`git log -S 'cited REQ-ID' -- conventions.md`) returns no commit, confirming the clause has never been committed; the defect entered with this single in-progress edit.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/conventions.md`, broaden the binding surface of clause (i) of the `Adds.` rule (the bullet beginning "**Adds.** One sentence — what the leaf introduces.") from a cited REQ-ID alone to any observable behaviour traced to a normative spec obligation, so that the code-keyed anchor forms the plan already uses bind on the same footing.

Concretely, replace the current clause-(i) text:

> (i) an observable behaviour carrying a cited REQ-ID (e.g. the concurrency construct the *Sequential by default* rule requires `Adds.` to name alongside its mandating REQ-ID)

with wording admitting the three anchor forms the corpus already relies on — a cited numbered `PREFIX-N` REQ-ID, a cited `loom/...` diagnostic-registry code, or a named normative step on a code-keyed obligation page per `coverage-matrix.md` "Code-keyed obligation areas (no numbered REQ-IDs)". For example:

> (i) an observable behaviour traced to a normative spec obligation — a cited `PREFIX-N` REQ-ID, a cited `loom/...` diagnostic-registry code, or a named normative step on a code-keyed obligation page per [`coverage-matrix.md`](./coverage-matrix.md) (e.g. the concurrency construct the *Sequential by default* rule requires `Adds.` to name alongside its mandating REQ-ID)

Keep clause (ii) (the cross-leaf seam) unchanged, and restate the closing residue sentence so the only non-binding `Adds.` mechanism is one that is neither a Class-1 observable behaviour (REQ-ID- or code-keyed) nor a Class-2 seam.

Edge case for the implementer: this must stay consistent with the binding-taxonomy definition — if Class 1 is defined as "constraint traced to a spec REQ-ID," widen that definition in the same edit to cover code-keyed obligation surfaces, otherwise the two changes reintroduce the same gap from opposite ends.

## Relationships

- T31 "Adds. clause (ii) seam-binding test is undecidable from the `Deps.` field" — same-cluster (sibling clause in the same `Adds.` rule; resolves independently).
- T25 "`V5d` lowering-pass outputs are named only in descriptive `Adds.`, bound by no `Tests.` bullet" — same-cluster (a concrete instance on the SUBS code-keyed page where `Adds.`-only mechanisms bind to nothing).
- T30 "Un-anchored normative MUSTs are invisible to the closing gate by construction" — same-cluster (the broader symptom of obligations without a numbered REQ-ID escaping binding; resolves independently).
