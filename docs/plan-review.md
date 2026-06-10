# Triaged Plan Review — plan

_Generated: 2026-06-10T06:20:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T32) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blockers, 0 high, 11 medium retained; 18 low discarded; 3 low findings merged into 1 medium finding; 5 NIT dropped; 0 false dropped. One verbatim duplicate (a re-pasted V6b finding under the V11d section) was de-duplicated into T12._

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
- `docs/plan_topics/V2b-T-type-compat-engine.md` — paired tests leaf, mirror prose (edited only if it carries the same `Adds.` prose to mirror)
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

- `docs/spec_topics/lexical.md` — String literals section (edited only if the decode happy-path cites a new anchor added here rather than reusing an existing stable identifier)
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
