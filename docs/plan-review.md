# Triaged Plan Review — plan

_Generated: 2026-06-10T06:20:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T32) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blockers, 2 high, 19 medium retained; 18 low discarded; 3 low findings merged into 1 medium finding; 5 NIT dropped; 0 false dropped. One verbatim duplicate (a re-pasted V6b finding under the V11d section) was de-duplicated into T12._

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

- `docs/spec_topics/errors-and-results/error-model.md` — Pattern grammar / Exhaustiveness / Arm syntax / Runtime panics (edited only if the positive-destructuring facet gets its own bullet and no existing stable anchor is reused)
- `docs/spec_topics/type-system.md` — Type compatibility / `match-arm-type-mismatch` (read-only)
- `docs/spec_topics/diagnostics/code-registry-parse.md`, `code-registry-runtime.md` — registry rows for the cited codes (read-only)

The only possible spec touch is conditional: if the positive-destructuring facet is given its own bullet and no existing stable anchor is reused, the *Pattern grammar* section of `error-model.md` may need an `<a id>` anchor (or a GOV-16 inline label) to cite. The behaviours with registered codes (`loom/runtime/match-error`, `loom/parse/match-arm-type-mismatch`) need no spec edit.

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

- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — procedure outputs / acceptance contract (edited)
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

**Shape:** single

### Recommendation

Close both missing obligations together: add a runtime-evidence acceptance gate that defines what "landed safely" means, and a plan-only revert path that defines the rollback when that evidence is red.

**Spec edits (first, per the `conventions.md` *Spec drift* rule).** Strengthening the acceptance contract is a spec change because the procedure's stated outputs are currently scoped to build-time in `version-bump-triggers.md` and recovery/runtime behaviour is a declared non-goal in `version-bump-intro.md`. Amend `version-bump-triggers.md`'s outputs paragraph to require end-to-end runtime evidence at the new pin — a representative integrated `.loom` running through the `H4a` harness against the new pin (typed query + tool loop + invoke + schema validation + binder + cancellation), not surface-inventory alone — and reconcile `version-bump-intro.md` §Non-goals so this runtime-evidence acceptance step is not mistaken for the delegated loom-side recovery non-goal.

**Plan edits.** Mirror the runtime-evidence gate into `V18c` (and `V18c-T`): a `Tests.`/`Ships when` clause requiring the `H4a` end-to-end harness to pass against the bumped pin before the bump is considered complete. Add a `Ships when` clause (mirrored in `V18c-T`) stating that when the bump's acceptance evidence is red, the prior pin is restored before merge — reverting step 4's edit in one commit: the single-source-of-truth Pi-SDK pin literal at `host-prerequisites.md#pi-sdk-pin` and the four `@earendil-works/*` `peerDependencies` entries (`pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-tui`). Reference the pin anchor rather than restating the literal, and phrase the revert trigger generically ("if the bump's acceptance evidence is red") so it does not hard-couple to the gate's exact wording.

Edge case the implementer must watch: the runtime-evidence gate runs through the `H4a` double, so its value is bounded by the double's fidelity to the bumped SDK — do not let a green double-backed harness be read as real-host coverage (see the related `H4a` fidelity-contract finding).

## Relationships

- T19 "Plan has no terminal end-to-end integration-acceptance leaf" — must-follow (a release-gate leaf running a representative `.loom` through the `H4a` harness end-to-end would supply the same mechanism this fix's runtime-evidence gate needs; build that first so this fix references it).
- T20 "H4a in-process Pi session double has no stated fidelity contract against the pinned SDK" — must-follow (this fix's runtime-evidence gate runs against the `H4a` double; without the double's fidelity to the new pin asserted, "harness passing against the new pin" is false-green).

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
- `docs/plan_topics/V12a-slash-dispatch.md` — `SLSH-2` Tests bullets (edited — reference the named H4a contract)
- `docs/plan_topics/V12a-T-slash-dispatch.md` — `SLSH-2` Tests bullets (edited — reference the named H4a contract)
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

**Shape:** single

### Recommendation

State the double's fidelity contract at `H4a` and name where and by whom that fidelity is asserted, so the double-dependent ship-gates reference one named contract rather than each scoping its claim independently.

Add to `H4a` a behavioural contract enumerating the specific Pi behaviours the in-process double must reproduce relative to the pinned SDK — streamed-token order relative to `ctx.waitForIdle()` resolution, single-turn append semantics, the `pi.on` cancel-forward subscription, and cancellation propagation — via its `Adds.`/`Tests.`/`Ships when`, and name the mechanism/owner that validates the double against the pinned SDK (a harness self-check listed as an `H4a` inline test, plus `V18c`'s version-bump runtime-evidence gate as the real-host backstop). Introduce a `<new>` harness-conformance leaf if the assertion is too large for `H4a`. Establish this contract at `H4a` before any per-gate scoping; the double-dependent gates (most acutely `V12a`/`V12a-T` `SLSH-2`) then cite the named contract.

Edge case the implementer must watch: a true conformance check against the real SDK may need a live Pi session the in-process harness deliberately avoids. If a full real-SDK conformance check cannot run in-process, scope the affected double-dependent gates (`V12a` `SLSH-2` ordering, `M`, `V9c`, `V17a`, `V11f`) to state they assert behaviour *as modelled by the in-process double* **and** pair that scoping with a real-host end-to-end gate (see the related terminal-integration finding), so the coverage is not merely deleted.

## Relationships

- T19 "Plan has no terminal end-to-end integration-acceptance leaf" — decision-overlap (a release-gate real-host end-to-end leaf would double as the fidelity backstop this finding needs).
- T17 "Version-bump acceptance is build-time surface checks only — no runtime-evidence gate or revert path" — same-cluster (both want runtime evidence against the pinned/real SDK rather than static/surface gates).
