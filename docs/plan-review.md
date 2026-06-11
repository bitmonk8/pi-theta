# Triaged Plan Review — plan

_Generated: 2026-06-11T11:35:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T18) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 4 medium retained; 38 low discarded; 0 low findings merged into 0 medium findings; 13 NIT dropped; 0 false dropped._

---

# T01 — `minimatch` runtime dependency required by V10b is never provisioned

**Original heading:** `minimatch` runtime dependency not provisioned anywhere
**Original section:** docs/plan_topics/H1a-scaffold-and-toolchain.md
**Kind:** codebase-grounding-broad
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

Spec `DISC-5` (`spec_topics/discovery/package-and-settings.md`) pins `minimatch` as the matcher engine for `pi.looms` glob resolution: "Glob patterns are matched with the `minimatch` engine — the same package Pi applies to its own resource arrays". `V10b` (Package discovery) and `V10b-T` consume this directly — V10b's Adds names "minimatch with `!`/`+`/`-` ordering" and DISC-5 is one of its closing obligations. So `minimatch` is a hard runtime dependency of the loom package.

That dependency is provisioned nowhere. The repository `package.json#dependencies` declares `ajv`, `ajv-formats`, `chokidar`, `semver`, `yaml` — no `minimatch`. `H1a`'s Adds, which is the plan's runtime-dependency-enumeration owner, lists only `ajv`/`semver`/`chokidar`/`yaml`. The spec's own recommended-recipe list, `implementation-notes.md` §"Loom-package implementation dependencies (loom 1.0)", names `semver`, `chokidar`, and `yaml` but not `minimatch`. The spec notes `minimatch` is the same package Pi uses internally (`@earendil-works/pi-coding-agent` `dist/core/package-manager.js`), but Pi's internal use does not place `minimatch` on the SDK's public export surface, so loom cannot reach it transitively through a peer dependency.

The gap is invisible at `H1a`: a fresh `npm install && npm run build && npm test` passes against an empty `src/**` tree because nothing imports `minimatch` yet. It first manifests when `V10b` is implemented and its `minimatch` import fails to resolve — at which point the V10b implementer must provision the dependency ad hoc, diverging from the plan's stated model where `H1a` owns the runtime-dependency set.

## Plan Documents

- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — Adds (runtime-dependency enumeration) (edited)
- `docs/plan_topics/V10b-package-discovery.md` — Adds / Tests (read-only)

## Spec Documents

- `docs/spec_topics/discovery/package-and-settings.md` — §DISC-5 (read-only)
- `docs/spec_topics/implementation-notes.md` — §"Loom-package implementation dependencies (loom 1.0)" (read-only)

## Affected Leaves

**Phases:** Horizontal; Vertical V10 (Discovery and settings)

**Leaves (implementation order):**

- H1a — Project scaffold and toolchain — (modified)
- V10b — Package discovery (bounded walk) — (blocked)
- V10b-T — Package discovery (tests) — (blocked)

## Consequence

**Severity:** correctness

`H1a` as authored ships an incomplete runtime-dependency set; because no H1a test reads `package.json#dependencies` for completeness, the omission stays green until V10b. Two implementers would then diverge on where to provision `minimatch` (V10b ad hoc vs. retro-fitting H1a), contradicting the plan's stated model that H1a owns the runtime-dependency set.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** `1cb54c7` (spec, 2026-06-06 — "resolve 'Glob !/+/- precedence and matcher engine unspecified for pi.looms / loomPaths'"); `c6a664e` (plan, 2026-06-10 — "build/update plan for spec.md + review")
**History:** The plan corpus is git-tracked. `git log -S minimatch` over `package.json`, `docs/plan_topics/H1a-scaffold-and-toolchain.md`, and `docs/spec_topics/implementation-notes.md` returns no commits — `minimatch` has never appeared in any provisioning surface. The runtime-dependency obligation was created in `1cb54c7`, which pinned the `minimatch` engine into spec DISC-5 (`discovery/package-and-settings.md`); that commit added no corresponding entry to the spec's dependency-recipe list (`implementation-notes.md`) or to `package.json`. The package.json runtime deps were established earlier (`d511337` 2026-05-04 ajv/ajv-formats/chokidar; `cb6cf60` 2026-05-07 semver) and never revisited for `minimatch`. When the plan leaves were authored in `c6a664e` (2026-06-10), `H1a`'s runtime-dependency enumeration faithfully mirrored the still-incomplete `implementation-notes.md` list, propagating the omission into the plan. The defect is thus the unreconciled interaction between the spec's `minimatch` matcher-engine pin and the dependency-provisioning surfaces that predate and post-date it.

## Solution Space

**Shape:** single

### Recommendation

Add `minimatch` to `H1a`'s runtime-dependency enumeration in Adds, alongside `ajv`/`semver`/`chokidar`/`yaml`, grounding it in DISC-5 (which already pins the `minimatch` engine for `pi.looms` glob matching) and citing `[discovery/package-and-settings.md §DISC-5]` as the obligation source. The H1a implementer then declares `minimatch` in `package.json#dependencies`.

The spec is read-only for this fix; DISC-5 already names `minimatch`, so the plan can ground the dependency without touching the spec. The spec's incomplete `implementation-notes.md` recipe list is a separate spec-review concern and is out of scope here.

Edge case: keep H1a's enumeration and the eventual `package.json#dependencies` in step. No H1a architectural test reads the runtime-`dependencies` set (the existing tests read `devDependencies`/`peerDependencies`), so the gap will not red until V10b — the H1a implementer must add `minimatch` even though H1a's own `npm test` passes without it.

## Relationships

None

---

# T02 — V6a's model-reference-matcher seam has no declared producer

**Original heading:** V6a's injected model-reference matcher seam is not produced by any leaf in its Deps
**Original section:** docs/plan_topics/V6a-frontmatter-contract.md
**Kind:** assumptions, implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V6a` resolves a present-but-unresolvable `model:` frontmatter value at loom-load time, firing `loom/load/model-unresolved`. Its Adds and the `loom/load/model-unresolved` Tests bullet route this through "an injected model-reference matcher", and the Adds explicitly states the hook "calls an injected model-reference matcher, so the leaf carries no forward dependency on the downstream binder-model machinery." The spec backs this resolution path: `frontmatter/frontmatter-fields-a.md` (`model` row, line 39 / §`model` prose) says a present `model:` is resolved at load time via the binder-model parse rule, and `binder/binder-model-and-context.md#binder-model-parse-rule` resolves the reference by passing it to Pi's `findExactModelReferenceMatch` against `ctx.modelRegistry.getAvailable()`.

The defect is that the injected matcher seam has no declared producer. `V6a`'s Deps are `V6a-T`, `V1a`, `V5a` — none supplies a model-reference matcher, a `getAvailable()` source, or `ctx.modelRegistry`. The leaf that owns the concrete resolver, `V11a` (its Adds declares "binder-model resolution via `findExactModelReferenceMatch`"), is neither in `V6a`'s Deps nor cross-referenced for the `model:` path. The Adds names the matcher only as "injected" without stating that `V6a` itself defines the injection interface, and no leaf is assigned the production wiring point that constructs the concrete matcher and binds it into the parser at load time.

Because the seam is referenced but unowned, an implementer building `V6a` would invent an ad-hoc matcher interface for the loom's own `model:` resolution that can diverge from `V11a`'s `findExactModelReferenceMatch`-based binder-model resolution — even though both close the same underlying "reference matches no available model" condition against the same `ctx.modelRegistry` surface.

## Plan Documents

- `docs/plan_topics/V6a-frontmatter-contract.md` — Adds, Tests, Deps (edited)
- `docs/plan_topics/V6a-T-frontmatter-contract.md` — Tests (edited)
- `docs/plan_topics/V11a-binder-model-resolution.md` — Adds (edited)
- `docs/plan_topics/V9b-registration-drain-state.md` — Adds (option-dependent)
- `docs/plan_topics/coverage-matrix.md` — `frontmatter-fields-a.md §model` row (read-only)
- `docs/plan.md` — §Vertical slices V6 / V11 interleave note (read-only)

## Spec Documents

- `docs/spec_topics/frontmatter/frontmatter-fields-a.md` — `model` row / §`model` prose (read-only)
- `docs/spec_topics/binder/binder-model-and-context.md` — §binder-model-parse-rule (read-only)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — model-registry surface / `ModelRegistry.getAvailable()` (read-only)

## Affected Leaves

**Phases:** V6 — Frontmatter; V9 — Extension host integration; V11 — Binder

**Leaves (implementation order):**

- V6a — Frontmatter field contract — (modified)
- V6a-T — Frontmatter field contract (tests) — (modified)
- V9b — Registration and drain-state — (option-dependent)
- V11a — Binder-model resolution and strict-capability probe — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: `V6a`'s `model:` resolution invents a local matcher interface that need not match `V11a`'s `findExactModelReferenceMatch`-based resolver, so the same "reference matches no available model" condition can be decided differently for `loom/load/model-unresolved` versus `loom/load/binder-model-unresolved`. The production wiring point that constructs the concrete matcher and injects it into the parser at load time is also unassigned, so no leaf is responsible for building it.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 4088e2e — pi-loom plan: resolve "model/bind_* resolution hooks named in V6a Adds with no closing assertion" (2026-06-10, Thomas Andersen)
**History:** `V6a-frontmatter-contract.md` was created (7678da2 / 1064946, 2026-06-10) with no `model:` resolution hook. Commit 4088e2e added the `loom/load/model-unresolved` Tests bullet and the Adds clause introducing the "injected model-reference matcher" hook while resolving an earlier coverage finding about unclosed model/`bind_*` hooks; that commit named the seam but added no producer to Deps (still `V6a-T, V1a, V5a`) and named no owning contract, introducing the unowned-seam gap.

## Solution Space

**Shape:** single

### Recommendation

Pin the seam to a declared producer without forcing a forward Deps edge from `V6a` onto the late-landing binder slice:

- In `V6a`'s Adds, state that `V6a` itself defines the model-reference-matcher injection seam — the interface the parser's `model:` resolution hook calls — so the seam declaration is owned in-leaf and no Deps edge is needed. Apply the same statement to the `loom/load/model-unresolved` bullet wording in both `V6a-frontmatter-contract.md` and `V6a-T-frontmatter-contract.md`.
- Cross-reference `V11a` from `V6a`'s Adds (and add the reciprocal note in `V11a`'s Adds) establishing that the concrete matcher is the shared resolution contract `V11a` owns — Pi's `findExactModelReferenceMatch` run against `ctx.modelRegistry.getAvailable()` (`binder/binder-model-and-context.md#binder-model-parse-rule`) — so `V6a`'s `model:` resolution and `V11a`'s binder-model resolution bind one contract and cannot diverge.
- Name the leaf that constructs the concrete matcher and injects it into the parser at the load pass. The natural owner is the registration/load-pass leaf that invokes the parser (`V9b`); `V11a` is the alternative if the concrete resolver is constructed there. Record the chosen owner on that leaf so the production wiring point is assigned.

The `frontmatter-fields-a.md §model` coverage-matrix row already names `V6a` as the closing leaf for `loom/load/model-unresolved`; it needs no change.

## Relationships

None

---

# T03 — V18a's partition assertion imports a `V9a` probe constant that `V9a` never declares

**Original heading:** V18a reconciles against "V9a's probe constant" but V9a declares no named/importable constant
**Original section:** docs/plan_topics/V18a-capability-inventory.md
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V18a`'s build-time partition assertion is specified to reconcile each `CAPABILITY_OBLIGATIONS` entry's factory-probed/verified-otherwise flag against "the Step-0 factory-probable capability set derived from `V9a`'s probe constant (not a literal re-listed here)" (`V18a` and `V18a-T`, PIC-15 bullet; echoed in `V18a` Adds and Ships-when). The clause requires importing a named symbol owned by `V9a`.

`V9a` declares no such symbol. Its Adds describes "the single load-bearing capability probe … Node-floor check, `AbortSignal`/`AbortController` shape check, SDK named-member check, peer-dep lock-step check, and the `typebox` `Type.Unsafe` callable check," and PIC-5 asserts "there are exactly five checks" — all prose. Neither `V9a` nor `V9a-T` exposes an importable constant enumerating the factory-probable capability set.

The build-time partition assertion therefore has no resolvable import target. An implementer must either invent a symbol name and location for the probe set (so `V18a` and `V18a-T` may bind to a different symbol than `V18c`'s gate, which separately consumes "the capability-probe constants"), or re-list the set as a literal — which the PIC-15 bullet explicitly forbids ("not a literal re-listed here").

## Plan Documents

- `docs/plan_topics/V9a-capability-probe.md` — Adds / Tests (edited)
- `docs/plan_topics/V9a-T-capability-probe.md` — Tests (edited)
- `docs/plan_topics/V18a-capability-inventory.md` — Adds / Tests / Ships when (edited)
- `docs/plan_topics/V18a-T-capability-inventory.md` — Tests (edited)
- `docs/plan_topics/V18c-version-bump-checklist.md` — Adds (option-dependent)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/capability-probe.md` — Step-0 probe definition (read-only)
- `docs/spec_topics/pi-integration-contract/capability-inventory-items.md` — seven named SDK capabilities (read-only)

## Affected Leaves

**Phases:** Vertical V9 (Extension host integration), Vertical V18 (Build-time SDK gates)

**Leaves (implementation order):**

- V9a — Capability probe (Step 0) — (modified)
- V9a-T — Capability probe (Step 0) (tests) — (modified)
- V18a — SDK capability inventory — (both)
- V18a-T — SDK capability inventory (tests) — (both)
- V18c — Pi version-bump static gates — (blocked)

## Consequence

**Severity:** correctness

`V18a`'s build-time partition assertion names an import target (`V9a`'s probe constant) that does not exist, and the leaf forbids the only fallback (re-listing the set as a literal). Two reasonable implementers would invent divergent symbol names/locations for the probe set, and `V18c`'s "capability-probe constants" gate could bind to a different symbol than `V18a`, so the cross-leaf reconciliation the assertion is meant to guarantee silently fails to be a single source of truth.

## Issue introduction

**Verdict:** single-commit introduction (regression from a prior plan-review fix)
**Introducing commit:** `235fdfe` — "pi-loom plan: resolve \"V18a Ships-when claims partition verification with no backing mechanism\"" (2026-06-11)
**History:** The plan corpus is git-tracked. `V9a-capability-probe.md` and `V18a-capability-inventory.md` both first appeared at `c6a664e`; at that point `V18a`'s Adds/Tests/Ships-when described "the factory-probable/non-probable partition" with no cross-reference to `V9a`, and `V9a` has never declared an importable probe constant (its file history is the single commit `c6a664e`, untouched since). Commit `235fdfe` rewrote `V18a` and `V18a-T` to reconcile the partition "against `V9a`'s Step-0 factory-probable capability set … derived from `V9a`'s probe constant (not a literal re-listed here)" while leaving `V9a` unchanged, introducing the dangling cross-reference. `git log -S "probe constant" -- docs/plan_topics/` confirms `235fdfe` as the commit that first introduced the phrase into the leaf files.

## Solution Space

**Shape:** single

### Recommendation

Give the factory-probable capability set a named, importable home in `V9a`, then have the existing consumers reference that symbol instead of the prose "`V9a`'s probe constant":

- In `V9a`'s **Adds**, declare a named exported constant enumerating the Step-0 factory-probable capability identifiers — the subset of the seven inventory capabilities the five probe checks cover (items 1/2/3/4/6 per `V18a`'s PIC-15). Add a corresponding `V9a-T` **Tests** bullet pinning that constant so the seam is verified at its owning leaf.
- In `V18a` and `V18a-T`, change the PIC-15 bullet (and `V18a`'s Adds and Ships-when) to name that `V9a`-owned symbol as the import source for the partition assertion, replacing the prose phrase "`V9a`'s probe constant."
- Ensure `V18c`'s "capability-probe constants" gate (Adds) consumes the same `V9a`-owned symbol, so `V18a` and `V18c` reconcile against one source of truth.

The spec pages (`capability-probe.md`, `capability-inventory-items.md`) are read-only for this fix — they ground what the constant enumerates but require no edit; naming the constant is internal to the plan leaf files.

## Relationships

None

---

# T04 — V16a's Adds gives two divergent ceiling-#2 enforcement leaf sets

**Original heading:** V16a names two different ceiling-#2 enforcement leaf sets in the same section
**Original section:** docs/plan_topics/V16a-ceiling-order-masked.md (Adds)
**Kind:** consistency
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V16a`'s **Adds** enumerates the set of feature leaves that own per-ceiling breach detection and consult the cross-ceiling arbitration seam — but it does so twice with different membership. The "Enforcement stays distributed" sentence lists `(`V5e`, `V6e`/`V13c`, `V11f`, `V15b`)`, including `V6e`. The two later passages — the "All CIO bullets are exercised…" sentence and the implicit binding rule — list only `V5e`, `V11f`, `V13c`, `V15b`, with no `V6e`.

`V6e` does not belong in the enforcement set. `V6e` owns the `respond_repair` / `tool_loop.max_rounds` **frontmatter fields** (range validation and defaults); its Deps are `V6e-T`, `V6a`, `V13c`, `V13d` — it carries no Dep on `V16a` and consults no seam. Ceiling-#2 first-enforcement (the round-boundary `tool_loop.max_rounds` check) is owned by `V13c`, which consults `V16a` at the round boundary and declares `V16a` in its Deps.

The first enumeration therefore also contradicts the same section's own rule, "Each downstream leaf's `Deps` on `V16a` binds the seam it consults": `V6e` has no `V16a` Dep, so by that rule it cannot be a consulting leaf. The canonical consulting set is the one the two later passages already use.

## Plan Documents

- `docs/plan_topics/V16a-ceiling-order-masked.md` — Adds (edited)
- `docs/plan_topics/V13c-query-tool-loop.md` — Adds / Deps (read-only)
- `docs/plan_topics/V6e-respond-repair-tool-loop.md` — Adds / Deps (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** V16 — Hard ceilings

**Leaves (implementation order):**

- `V16a` — Hard-ceiling interaction order and `masked` co-fire — (modified)

## Consequence

**Severity:** correctness

An implementer reading the first enumeration would treat `V6e` as a ceiling-#2 enforcement leaf and could wire it to consult the arbitration seam (adding a spurious `V16a` Dep), duplicating the ceiling-#2 first-enforcement that `V13c` already owns at the round boundary. A second implementer following the later set would not, so the two diverge on which leaf enforces ceiling #2 and on `V6e`'s dependency edges.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** `c6a664e` (2026-06-10, "pi-loom plan: build/update plan for spec.md + review")
**History:** The plan corpus is git-tracked. `git show` over the three commits touching this file shows both enumerations co-existed from the file's creation in `c6a664e`: the "feature leaf" sentence has always read `(`V5e`, `V6e`/`V13c`, `V11f`, `V15b`)` while the "downstream leaves" sentence has always read `(`V5e`, `V11f`, `V13c`, `V15b`)`. The divergence is original, not regression-introduced. The later edit `e2b7e81` (2026-06-10, "resolve isolated cross-ceiling unit interface/authority undefined") added the "Each downstream leaf's `Deps` on `V16a` binds the seam it consults" rule, which made the `V6e` inclusion additionally inconsistent with an explicit rule but did not introduce the underlying two-set defect.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/V16a-ceiling-order-masked.md`, in the **Adds** "Enforcement stays distributed" sentence, strike `V6e` from the feature-leaf enumeration so it reads `(`V5e`, `V11f`, `V13c`, `V15b`)` — matching the two later enumerations and the section's "Each downstream leaf's `Deps` on `V16a` binds the seam it consults" rule. Replace the literal `(`V5e`, `V6e`/`V13c`, `V11f`, `V15b`)` with `(`V5e`, `V11f`, `V13c`, `V15b`)`. Leave `V6e` untouched: it owns the `tool_loop.max_rounds` frontmatter field, not ceiling-#2 enforcement, and correctly carries no `V16a` Dep.

## Relationships

- T07 "V5e references V4d-owned `ValidationIssue` / `ValidationError` without declaring a `V4d` dependency" — same-cluster (V5e is in the ceiling-consulting set; resolves independently)
