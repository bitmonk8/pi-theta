# Triaged Plan Review — plan

_Generated: 2026-06-11T11:35:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T18) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 6 high, 10 medium retained; 38 low discarded; 0 low findings merged into 0 medium findings; 13 NIT dropped; 0 false dropped._

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

---

# T05 — Real-host smoke pass criterion (e) names a permitted code set with no committed source

**Original heading:** Real-host smoke pass criterion (e) permitted-code set has no committed artifact
**Original section:** docs/plan_topics/H4a-factory-shell-and-harness.md
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H4a`'s third Tests bullet defines the manual real-host smoke run's pass/fail criteria (a)–(e). Criterion (e) passes iff the emitted `loom-system-note` codes are a **subset** of a permitted set defined inline as "the union of `loom/...` codes the slices in `H7a`'s **Deps** can emit". Unlike the two artefacts `H7a` checks in alongside its multi-feature fixture `.loom` — the committed golden transcript and the committed golden diagnostics list — this permitted *union* has no committed, reviewed artefact anywhere in the corpus.

`H7a`'s committed golden diagnostics list enumerates the codes the integrated fixture path **emits** (a fixed, reviewed set). Criterion (e)'s permitted set is deliberately broader: the union of every code each of the eight slices in `H7a`'s Deps (`H4a`, `V5d`, `V8a`, `V11f`, `V13c`, `V14a`, `V16a`, `V17a`) *can* emit, so that a benign live-model variant code (permitted by the composition but not present in the deterministic double's golden run) is not scored as a fail. Because that union is never materialised as a committed list, the human running the smoke must reconstruct it by hand from the eight slices on every run.

A by-hand reconstruction is not reproducible: two runners can derive different unions, so the same emitted code can be scored "permitted" by one runner and "out-of-set" (a fail / confirmed behavioural-divergence finding) by another. Criterion (e) — the only criterion that detects an unexpected emitted code — therefore lacks a fixed reference set, and `H6a`'s release-gate evidence record (which records the run's result "against `H4a`'s narrowed model-output-invariant criterion … and emitted `loom-system-note` codes within the permitted set") inherits the same unmaterialised reference.

## Plan Documents

- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Tests, third bullet, pass/fail criterion (e) (edited)
- `docs/plan_topics/H7a-integration-acceptance.md` — Adds / Tests (committed fixture + golden lists) (option-dependent)
- `docs/plan_topics/H6a-live-corpus-activation.md` — Release-gate acceptance (manual real-host smoke) bullet (read-only)
- `docs/plan.md` — Release gate (read-only)

## Spec Documents

None — the fix is internal to the plan's leaf files; the permitted set is derived from `loom/...` registry codes the plan's own slices emit.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H4a` — Extension factory shell and end-to-end harness — (modified)
- `H7a` — Terminal integration-acceptance run — (modified)
- `H6a` — Live-corpus closing-gate activation — (modified)

## Consequence

**Severity:** correctness

Criterion (e) is the only smoke criterion that catches an unexpected emitted diagnostic code, yet its permitted set is reconstructed by hand from eight slices per run. Two runners can compute different permitted unions, so the same emitted code is scored "permitted" by one and a merge-blocking divergence by another — the (e) pass/fail is not reproducible across runners, and the `H6a` release-gate evidence record cites a reference set that does not exist as a committed artefact.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 3911733 — pi-loom plan: resolve "Live-host smoke pass criterion assumes a non-deterministic LLM reproduces a transcript" (2026-06-11, Thomas Andersen)
**History:** Before this commit, criterion (e) required the live-host run to emit exactly the codes in `H7a`'s committed golden diagnostics list — a committed, reviewed artefact. The 2026-06-11 rewrite, addressing a separate finding that a non-deterministic LLM cannot reproduce an exact transcript/code-set, relaxed (e) to a subset check against "the union of `loom/...` codes the slices in `H7a`'s Deps can emit". That broader union — distinct from the committed golden diagnostics list — was introduced with no committed artefact, leaving the permitted set the runner checks against unmaterialised.

## Solution Space

**Shape:** single

### Recommendation

Materialise the permitted union as a committed, reviewed list checked in alongside `H7a`'s fixture `.loom` and golden lists, and have criterion (e) reference it by name. The list enumerates the `loom/...` codes the slices in `H7a`'s Deps can emit; the smoke passes iff the live run's emitted codes are a subset of that committed list. This keeps the subset-of-union semantics (benign live-model code variance remains non-failing) while giving the runner — and `H6a`'s evidence record — a single committed, reviewed reference set.

- In `H7a` Adds/Tests, add the committed permitted-code list to the artefacts checked in alongside the fixture `.loom` (next to the golden transcript and golden diagnostics list), drawn from the same Deps-slice provenance and human-reviewed at first commit like the goldens.
- In `H4a` criterion (e), reference that committed list as the permitted set rather than describing a by-hand union.
- In `H6a`'s Release-gate acceptance bullet, cite the same committed list as the source for "emitted `loom-system-note` codes within the permitted set".

Tie the list's maintenance to the same provenance obligation that keeps `H7a`'s golden diagnostics list current. Edge case for the implementer: keep the permitted list a superset of `H7a`'s golden diagnostics list (every code the deterministic run emits is permitted), so the in-process gate and the smoke cannot disagree on a code the fixture path actually emits. The spec is read-only for this fix.

## Relationships

- T06 "Release-gate evidence artifact has no defined committed home or format" — same-cluster (both are committed-artefact gaps in the H4a smoke / H6a release-evidence chain; resolve independently)

---

# T06 — Release-gate evidence artifact has no defined committed home or format

**Original heading:** Release-gate evidence artifact has fields but no defined location/format
**Original section:** docs/plan_topics/H6a-live-corpus-activation.md
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H6a`'s **Release-gate acceptance (manual real-host smoke)** item obligates a *committed evidence artifact* capturing four fields — the shipping Pi-SDK pin literal (the single-source-of-truth pin at `host-prerequisites.md#pi-sdk-pin`), the named owner who ran the `H4a` pre-merge real-host smoke, the run date, and the observed result against `H4a`'s narrowed model-output-invariant criterion. `H6a`'s **Ships when** then makes release-gate passage conditional on that artifact existing — "The release does not pass until that committed evidence record exists — not merely when the box is ticked — so a skipped, mis-recorded, or stale-pin run is detectable after the fact." Neither `H6a` nor `conventions.md` states *where* that artifact is committed or *in what form*.

`conventions.md` §Doc updates enumerates only three committed documentation homes — the `README.md` status table, `CHANGELOG.md`, and `notes.md` — and none is designated to carry this evidence; `H6a` does not point at any of them nor at a dedicated file. With the home unstated, two implementers can record the run in different places (or in the commit message), and the "detectable after the fact" property that `H6a`'s Ships when gate rests on has no fixed location to inspect — a later check cannot be told where to look.

The spec has already settled the analogous question for the version-bump smoke/audit evidence: `pi-integration-contract/version-bump-triggers.md` states "The procedure produces no separate artefact file," and `pi-integration-contract/version-bump-step2.md` records the per-item audit outcomes "in the bump commit message." `H6a`'s "committed evidence artifact" framing sits in unstated tension with that precedent — the plan should say whether the release-gate evidence follows the same commit-message convention or lives in a named committed file, so the same kind of manual-run evidence is not recorded two incompatible ways across the plan.

## Plan Documents

- `docs/plan_topics/H6a-live-corpus-activation.md` — Release-gate acceptance bullet + Ships when (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — manual real-host smoke gate (owner / record-the-result clause) (option-dependent)
- `docs/plan_topics/conventions.md` — §Doc updates committed-artifact homes (option-dependent)
- `docs/plan.md` — release-gate item 5 (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/version-bump-triggers.md` — "produces no separate artefact file" outputs (read-only)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — per-item outcomes recorded "in the bump commit message" (read-only)

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H4a` — Extension factory shell and end-to-end harness — (modified)
- `H6a` — Live-corpus closing-gate activation (loom 1.0 release gate) — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers place and format the evidence record differently (commit message, `notes.md`, or some new file), so the "detectable after the fact" guarantee `H6a`'s Ships when depends on has no fixed location to read. A downstream attempt to mechanically observe that the record exists cannot even be specified until the home is named.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** eca63cf — pi-loom plan: resolve "Manual real-host fidelity gate leaves no falsifiable record" (2026-06-11, Thomas Andersen)
**History:** `H6a`'s release-gate item originally recorded only a checklist tick ("the release does not pass until this item is checked"). Commit eca63cf rewrote it into the four-field "committed evidence artifact" obligation to give the manual smoke a falsifiable record, but specified neither the artifact's committed location nor its format. The location/format gap entered the corpus with that same rewrite — the obligation has carried fields-without-a-home since it was first authored.

## Solution Space

**Shape:** single

### Recommendation

Record the four fields in the gate-activation commit message, so the release-gate evidence follows the same manual-run-evidence convention the spec already fixes for the version-bump path (`version-bump-triggers.md`'s "no separate artefact file"; `version-bump-step2.md`'s "in the bump commit message"), and the plan carries one recording convention rather than two.

State the home explicitly in both `H6a`'s Release-gate acceptance bullet and its Ships when clause, and in `H4a`'s record-the-result clause for the two pre-merge triggers, so the same artifact is located the same way wherever the smoke is run. The spec stays read-only for this fix.

Watch the cross-reference with the mechanical-observer concern: if a closing-gate check is later added on the record's existence, the home named here is the path that check reads — keep the two choices consistent.

## Relationships

- T05 "Real-host smoke pass criterion (e) names a permitted code set with no committed source" — same-cluster (a sibling undefined-committed-artifact gap in the same `H6a`/`H4a` smoke gate; resolves independently)

---

# T07 — V5e references V4d-owned `ValidationIssue` / `ValidationError` without declaring a `V4d` dependency

**Original heading:** V5e emits a `maxDepth` ValidationIssue / routes to ValidationError without a V4d dep (low confidence, ordering)
**Original section:** docs/plan_topics/V5e-json-depth.md (+ V5e-T)
**Kind:** ordering
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V5e` (JSON document depth enforcement) emits the `maxDepth` depth-violation issue and asserts its per-boundary routing. Its first Tests bullet fires `schema_keyword:"maxDepth"` / `cause:"schema_validation"` and its Ships-when states it "proves the `maxDepth` `ValidationIssue` fires"; the routing-decision bullet names `ValidationError` as the typed-query-response destination class. Both `ValidationIssue` and `ValidationError` are owned by `V4d` — its Adds declares "the nine-variant `QueryError` union (its `kind`/`cause` wire forms), the `ValidationIssue` canonical ordering" and `ValidationError` is one of the nine variants — yet `V5e`'s `Deps` are `V5e-T`, `V5d`, `V16a` and `V5e-T`'s are `V5d`, `V16a`. Neither declares `V4d`, and `V5d` (their only shared upstream) does not transitively pull in `V4d` (the edge runs the other way: `V4d` deps on `V5d`).

Every other leaf that consumes a V4d-owned error type declares the `V4d` edge — `V9j`, `V12b`, `V13a`, `V13d`, `V14a`, and `V17a` all list `V4d` in `Deps`. `V5e`/`V5e-T` are the lone consumers that reference V4d-owned types without it. `V5e` is deliberately scoped to assert the routing *decision* in isolation and defers the actual wrapping into each carrier to the site owners (`V13c`, `V14a`, `V15a`, `V4e`), so it may legitimately emit a leaf-local shape rather than constructing the canonical `V4d` schema — but the plan never pins which of these two readings is intended, leaving the ownership boundary undefined.

## Plan Documents

- `docs/plan_topics/V5e-depth-enforcement.md` — `V5e` leaf, Deps / Ships-when (edited)
- `docs/plan_topics/V5e-T-depth-enforcement.md` — `V5e-T` leaf, Deps / Tests (edited)
- `docs/plan_topics/V4d-queryerror-variants.md` — `V4d` leaf, `ValidationIssue` / `ValidationError` ownership (read-only)
- `docs/plan.md` — §Vertical slices, V4 / V5 build order (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** V5 — Schemas, descriptions, schema-subset

**Leaves (implementation order):**

- `V4d` — `QueryError` variant schema — (read-only producer; gains a new inbound Deps edge but is not itself edited)
- `V5e` — JSON document depth enforcement (hard ceiling #4) — (modified)
- `V5e-T` — JSON document depth enforcement (hard ceiling #4) (tests) — (modified)

## Consequence

**Severity:** correctness

With the ownership boundary unpinned, two reasonable implementers diverge: one references the V4d-owned `ValidationIssue` / `ValidationError` schemas directly — risking a wrong-reason red ("unknown type") because the dep-DAG does not guarantee `V4d` is built before `V5e`/`V5e-T` (both become eligible once `V5d` and `V16a` land, with no `V4d` edge forcing the order) — while the other invents a leaf-local shape that may drift from the canonical `V4d` schema. `V5e` is the only V4d-owned-type consumer in the corpus that omits the edge, so the inconsistency is also a maintenance trap.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V5e` and `V5e-T` were created in the initial plan build (c6a664e) already referencing the V4d-owned `ValidationError` destination surface in their routing-decision tests while declaring `Deps` of `V5e-T, V5d, V16a` and `V5d, V16a` respectively — no `V4d` edge. A later commit (3fa39a9, 2026-06-11), resolving the sibling finding "V5e per-boundary routing test asserts destination error surfaces its Deps cannot reach", reworded the tests into the in-isolation framing and introduced the explicit `ValidationIssue` term in `V5e`'s Ships-when, sharpening the coupling to V4d-owned types but leaving the missing `V4d` dependency in place.

## Solution Space

**Shape:** single

### Recommendation

Add `V4d` to both `V5e` and `V5e-T` `Deps`, treating the `maxDepth` `ValidationIssue` and the `ValidationError` destination class as the canonical V4d-owned schemas that `V5e` constructs and asserts against, matching every other V4d-type consumer:

- `docs/plan_topics/V5e-depth-enforcement.md`: change `**Deps.** `V5e-T`, `V5d`, `V16a`` to `**Deps.** `V5e-T`, `V5d`, `V16a`, `V4d``.
- `docs/plan_topics/V5e-T-depth-enforcement.md`: change `**Deps.** `V5d`, `V16a`` to `**Deps.** `V5d`, `V16a`, `V4d``.

This aligns `V5e` with the established corpus convention (`V9j`, `V12b`, `V13a`, `V13d`, `V14a`, `V17a` all carry the `V4d` edge); the dep-DAG then enforces the build order and eliminates the wrong-reason-red hazard, and the emitted issue remains the canonical `ValidationIssue`. The edge is acyclic (`V4d` deps on `V5d` only, with no path back to `V5e`). Edge case: declaring `V4d` does not pull the carrier wrapping into `V5e` — `V5e` still asserts only the routing *decision* in isolation, with `ValidationError` / `CodeToolError` / `InvokeInfraError` wrapping asserted at `V13c` / `V14a` / `V15a` and the slash-load cross-route at `V4e`.

## Relationships

- T14 "V4a omits a Deps edge on V4d despite consuming the V4d-owned `QueryError` type" — same-cluster (same missing-`V4d`-edge ordering pattern on a different leaf; resolves independently)

---

# T08 — ERR-13 no-rollback vectors do not span the spec's enumerated authoring sites

**Original heading:** No-rollback / no-compensating-path guarantee (ERR-13) asserted only on sampled cases
**Original section:** docs/plan_topics/V4c-terminal-outcomes.md (+ V4c-T)
**Kind:** validation
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`ERR-13` ("No rollback") in [`error-model.md`](../../../docs/spec_topics/errors-and-results/error-model.md#err-13) enumerates five distinct authoring sites at which a prior side effect must survive a terminal event: `?`-early-return inside a function, `?`-early-return at the top of a loom block, a panic in a slash-command loom, a panic in an `invoke` child (surfaced to the parent as `InvokeInfraError { cause: "panic" }`), and mid-execution cancellation. The cancellation paragraph independently lists the side-effect kinds that must persist (filesystem writes, network requests, Pi-side service calls, sub-loom mutations) for a completed tool call, query, or `invoke` child.

`V4c` / `V4c-T` collapse this into two `ERR-13` test bullets phrased generically — "a `?`/panic/cancel does not unwind side effects" and a completed-callee-finality bullet that drives "a tool call / invoke child to completion … then fire a downstream `?`/panic/cancel". Neither bullet pins which of the five enumerated causes the test vectors actually drive. The plan states the guarantee is architectural and that the tests witness it "on the enumerated cases rather than exhaustively" — that framing correctly disclaims any attempt to prove the *absolute* absence of a compensating path anywhere in the runtime (an inherent testability limit, not a defect). What it leaves open is the breadth of the sampled set itself: an implementer reading only `V4c` could satisfy "the enumerated cases" with a single representative `?`-and-cancel pair, never exercising the slash-command-panic, `invoke`-child-panic, or top-of-loom-`?` sites that the spec enumerates separately.

The negative-direction assertion the validation concern asks for — "assert the effect persists and no compensating turn is injected" — is already present in the completed-callee-finality bullet. The remaining gap is that the vector set is not anchored to the spec's enumerated causes, so the closure evidence for `ERR-13` can pass while leaving several enumerated authoring sites unwitnessed.

## Plan Documents

- `docs/plan_topics/V4c-terminal-outcomes.md` — Tests / Ships when (edited)
- `docs/plan_topics/V4c-T-terminal-outcomes.md` — Tests (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — session-double / response-programming categories (read-only)
- `docs/plan_topics/coverage-matrix.md` — `ERR-8 … ERR-13` → `V4c` row (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices → V4 — Errors and results

**Leaves (implementation order):**

- V4c-T — Terminal outcomes, partial-append, and no-rollback (tests) — (modified)
- V4c — Terminal outcomes, partial-append, and no-rollback — (modified)

## Consequence

**Severity:** advisory

Two reasonable implementers can read "the enumerated cases" at different breadths; one drives all five `ERR-13` authoring sites, the other a single `?`/cancel pair. The `ERR-13` green tests are the coverage-matrix closure evidence for the no-rollback obligation, so a narrow sampling lets the closure gate pass while the slash-command-panic, `invoke`-child-panic, and top-of-loom-`?` sites ship unwitnessed.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** e8f0236 — pi-loom plan: resolve "V4c-T/V4c assert no-rollback over later-slice surfaces" (2026-06-11, Thomas Andersen); db918a2 — pi-loom plan: resolve "ERR-13 no-rollback / completed-callee finality over-claimed in V4c" (2026-06-11, Thomas Andersen)
**History:** `V4c`/`V4c-T` carried `ERR-13` from the first plan build (c6a664e, 2026-06-10) as a single universal bullet ("`?`/panic/cancel never unwind side effects; … are final"). e8f0236 added the "no-rollback guarantee is architectural: the runtime contains no compensating path" framing to the **Adds** paragraph; db918a2 then softened the test bullet to "on the enumerated cases … the tests witness it on the sampled cases rather than exhaustively" and split out the completed-callee-finality bullet. The two resolutions together replaced an over-claimed universal assertion with a sampled posture but never enumerated which causes the sample must span, which is the surface this finding flags.

## Solution Space

**Shape:** single

### Recommendation

In `V4c-T-terminal-outcomes.md` (and mirror the same vector list into `V4c-terminal-outcomes.md`'s `ERR-13` test bullet), replace the generic "a `?`/panic/cancel" phrasing with a vector list that names each `ERR-13` authoring site from [`error-model.md` §No rollback](../../../docs/spec_topics/errors-and-results/error-model.md#err-13): `?`-early-return inside a function, `?`-early-return at the top of a loom block, a panic in a slash-command loom, a panic in an `invoke` child (parent observes `InvokeInfraError { cause: "panic" }`), and mid-execution cancellation. Each vector drives a completed callee — modelled through the existing `H4a` session double and the `V17a` side-effect seam (`loomAbort`, checkpoint set, late-settlement discard) the bullet already cites — and asserts both that the prior side effect persists and that no compensating turn is appended.

Leave the **Adds** and **Ships when** "architectural / witnessed on the enumerated cases rather than exhaustively" framing intact — the un-assertable absolute-absence property is an inherent limit, not part of this fix. The fix is purely to anchor "the enumerated cases" to the spec's enumerated causes; the `coverage-matrix.md` `ERR-8 … ERR-13` → `V4c` row is unchanged.

Edge case for the implementer: the `invoke`-child-panic and completed-`invoke`-child vectors depend on `H4a` exposing a scripting/observation point for a completed nested-invoke outcome; resolve that seam ownership before authoring those two vectors.

## Relationships

- T10 "V4c ERR-13 routes a completed invoke-child through H4a, which scripts no invoke-child outcome" — must-follow (the completed-`invoke`-child vector this fix would add has no `H4a` scripting point until that finding is resolved)
- T09 "V4c's ERR-12 consumes an H4a subagent-mode-callee modelling H4a does not enumerate" — same-cluster (same `V4c`/`H4a` seam, `ERR-12` side; resolves independently)

---

# T09 — V4c's ERR-12 consumes an H4a subagent-mode-callee modelling H4a does not enumerate

**Original heading:** V4c consumes an H4a subagent-mode-callee capability H4a does not enumerate
**Original section:** docs/plan_topics/V4c-terminal-outcomes.md (+ V4c-T)
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V4c` and `V4c-T` close `ERR-12` ("ERR-8 holds inside a subagent loom") and pin it to "the `H4a` harness modelling a subagent-mode callee — not the live `V9i` surface." The test therefore depends on `H4a` providing an observable way to script a subagent-mode callee.

`H4a`'s response-programming surface enumerates exactly five scripting categories: (a) scripted assistant turns + streamed fragments; (b) `tool_use` results incl. `isError: true` and a mixed-success parallel batch; (c) binder/provider-call responses and failures; (d) `tool_loop.max_rounds` round-exhaustion; (e) abort/cancellation injection. None of the five scripts or observes a subagent-mode callee. Subagent dispatch is a distinct invocation mode in this plan — `V9i` owns the subagent-mode private `AgentSession`, spawn sequence, and lifecycle (`PIC-22`) — and `H4a`'s "the named injection points above are the content the contract must define" closes the enumeration to those five points by omission.

The consumer/producer mismatch means an implementer building `ERR-12` finds no `H4a` scripting point for a subagent-mode callee. They would either invent an ad-hoc harness extension (diverging from the single shared scripting contract `H4a` is meant to be) or shoehorn the test into category (a)'s plain scripted-turn surface, in which case `ERR-12` passes against a harness fiction that does not model subagent dispatch at all and need not match the live `V9i` surface it is meant to stand in for.

## Plan Documents

- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Adds (response-programming surface enumeration) + consumer list (edited)
- `docs/plan_topics/V4c-terminal-outcomes.md` — Tests (ERR-12 bullet) (read-only)
- `docs/plan_topics/V4c-T-terminal-outcomes.md` — Tests (ERR-12 bullet) (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/subagent.md` — subagent-mode session contract `V9i`/`H4a` would model (read-only)

## Affected Leaves

**Phases:** Horizontal; Vertical V4

**Leaves (implementation order):**

- `H4a` — Extension factory shell and end-to-end harness — (modified)
- `V4c` — Terminal outcomes, partial-append, and no-rollback — (modified)
- `V4c-T` — Terminal outcomes, partial-append, and no-rollback (tests) — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one extends `H4a`'s harness with an unstated subagent-scripting point, the other maps `ERR-12` onto category (a)'s plain turn-scripting. The second produces a green `ERR-12` that never exercises subagent-mode dispatch, so the subagent-loom no-rollback guarantee `ERR-12` claims to witness is unproven while the suite reports it covered.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 27e12be — pi-loom plan: resolve "Session double's model / tool / binder-response scripting surface is undefined" (2026-06-10, Thomas Andersen); e8f0236 — pi-loom plan: resolve "V4c-T/V4c assert no-rollback over later-slice surfaces" (2026-06-11, Thomas Andersen); 35c0237 — pi-loom plan: resolve "V4c/V4c-T omit H4a from Deps" (2026-06-11, Thomas Andersen)
**History:** `27e12be` introduced `H4a`'s response-programming surface with its five categories (a)–(e), none scripting a subagent-mode callee, and listed `V4c` as not yet a consumer. `e8f0236` rewrote `V4c`/`V4c-T`'s `ERR-12` to be "exercised via the `H4a` harness modelling a subagent-mode callee", creating a consumer dependence on a capability `H4a` never enumerated. `35c0237` then added `H4a` to `V4c`/`V4c-T` Deps and added `V4c` to `H4a`'s consumer list without adding a subagent-mode category, cementing the consumer↔producer mismatch.

## Solution Space

**Shape:** single

### Recommendation

Extend `H4a`'s response-programming-surface enumeration in Adds with an injection point that scripts/observes a subagent-mode callee, and name `V4c` against it as a consumer (already listed). Add a matching `Convention:` functional-effect assertion in `H4a`'s self-check Tests bullet for the new category so the seam is verified at the owning leaf. `V4c`/`V4c-T`'s `ERR-12` is then unchanged (it resolves against a real producer).

The subagent-mode harness category should model the `V9i` subagent-mode session contract (`subagent.md`), not a harness fiction — a category that diverges from `V9i`'s real spawn/lifecycle contract would reintroduce the same fiction at the producer instead of the consumer. The spec is read-only; the subagent contract the category models is already owned by `V9i` / `subagent.md`. Watch that the related completed-invoke-child gap may be closed by the same enumeration pass.

## Relationships

- T10 "V4c ERR-13 routes a completed invoke-child through H4a, which scripts no invoke-child outcome" — co-resolve (same defect class: ERR-12's subagent-mode callee and ERR-13's invoke-child callee both lack an H4a category; one H4a-enumeration expansion can close both)
- T08 "ERR-13 no-rollback vectors do not span the spec's enumerated authoring sites" — same-cluster (same `V4c`/`H4a` seam; resolves independently)

---

# T10 — V4c ERR-13 routes a completed invoke-child through H4a, which scripts no invoke-child outcome

**Original heading:** V4c ERR-13 models a "completed invoke child" with no H4a injection category
**Original section:** docs/plan_topics/V4c-terminal-outcomes.md (+ V4c-T)
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V4c` / `V4c-T` ERR-13 must drive "a tool call / invoke child to *completion* (via the `H4a` session double)", then fire a downstream `?`/panic/cancel and assert the completed callee's side effect persists. The bullet routes the completed tool-call, query, and invoke-child outcomes "through the `H4a` session double and the `V17a` side-effect seam … not the live `V14a`/`V13c`/`V15a` surfaces."

The completed tool-call maps to H4a response-programming category (b) (`tool_use` result, including `isError: true` and mixed-success batch) and the completed query maps to category (a)/(d). But H4a's response-programming surface enumerates exactly five scripting categories — (a) assistant turns, (b) `tool_use` results, (c) binder/provider responses, (d) `tool_loop.max_rounds` exhaustion, (e) abort injection — none of which scripts an **invoke-child** outcome. `invoke(...)` is a distinct invocation mode whose completion is owned by `V15a`, which ERR-13 explicitly excludes ("not the live … `V15a` surfaces"). `V17a`'s Adds defines only the cancellation substrate (`loomAbort`, the checkpoint set, late-settlement discard), not a way to drive an invoke-child to a produced final value.

The result: the seam ERR-13 needs — a scripting/observation point that drives a nested invoke-child to completion through the harness — is owned by no named producer. An implementer must invent an ad-hoc mechanism, and the ERR-13 invoke-child case can pass against a harness fiction that does not match `V15a`'s real invoke-child completion path.

## Plan Documents

- `docs/plan_topics/V4c-terminal-outcomes.md` — Tests (ERR-13 bullets) (edited)
- `docs/plan_topics/V4c-T-terminal-outcomes.md` — Tests (ERR-13 bullets) (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Adds (response-programming surface enumeration) (edited)
- `docs/plan_topics/V17a-cancellation-core.md` — Adds (side-effect seam) (read-only)
- `docs/plan_topics/V15a-invocation-core.md` — Adds (invoke-child resolution owner; the excluded live surface) (read-only)

## Spec Documents

None — the fix is internal to plan / harness files; the harness scripting surface is test infrastructure, not a spec obligation.

## Affected Leaves

**Phases:** Horizontal phases; Vertical slices V4, V15, V17

**Leaves (implementation order):**

- H4a — Extension factory shell and end-to-end harness — (modified)
- V4c — Terminal outcomes, partial-append, and no-rollback — (modified)
- V4c-T — Terminal outcomes, partial-append, and no-rollback (tests) — (modified)
- V15a — Invocation core — (read-only context; owns the excluded invoke-child surface)

## Consequence

**Severity:** correctness

ERR-13's completed-invoke-child case cites a harness scripting point that no leaf produces. Two implementers would invent divergent ad-hoc mechanisms for "drive an invoke-child to completion through the double," and the resulting test can go green against a harness fiction that does not reproduce `V15a`'s real invoke-child completion — the no-rollback property is then witnessed against behaviour that may not match the production invoke path.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 27e12be — pi-loom plan: resolve "Session double's model / tool / binder-response scripting surface is undefined" (2026-06-10, Thomas Andersen); e8f0236 — pi-loom plan: resolve "V4c-T/V4c assert no-rollback over later-slice surfaces" (2026-06-11, Thomas Andersen)
**History:** 27e12be established H4a's response-programming surface with five scripting categories (assistant turns, `tool_use` results, binder/provider responses, `tool_loop.max_rounds` exhaustion, abort) and listed H4a's consumers without `V4c`; none of the five scripts an invoke-child outcome. e8f0236 then routed `V4c`/`V4c-T`'s ERR-13 completed tool-call/query/invoke-child modelling onto the H4a session double and the V17a side-effect seam while excluding the live `V14a`/`V13c`/`V15a` surfaces, so the completed-invoke-child case points at an H4a category that does not exist. A later refinement (db918a2, 2026-06-11) split the ERR-13 bullets but preserved the unproduced routing.

## Solution Space

**Shape:** single

### Recommendation

Extend `H4a`'s response-programming surface enumeration with a category that scripts/observes a nested invoke-child driven to completion (a produced final value), and add `V4c` to `H4a`'s consumer list so ERR-13 binds a declared producer.

- In `H4a-factory-shell-and-harness.md` Adds, add an invoke-child-completion entry to the enumerated response-programming categories (alongside (a)–(e)); add `V4c` to the consumer list; add the corresponding functional-effect assertion to `H4a`'s per-category self-check Tests bullet.
- Leave `V4c`/`V4c-T` ERR-13 routing as-is (it already cites the `H4a` double).

The spec is read-only. Edge case for the implementer: if `H4a` is split per the sibling too-large concern, the new invoke-child-completion category must land in the half `V4c` depends on, and the `V4c`/`V4c-T` Deps edge must point at that half. This category and the subagent-mode category can be added in the same enumeration pass.

## Relationships

- T09 "V4c's ERR-12 consumes an H4a subagent-mode-callee modelling H4a does not enumerate" — co-resolve (same defect class: ERR-12's subagent-mode callee also has no H4a category; one H4a-enumeration expansion can close both)
- T08 "ERR-13 no-rollback vectors do not span the spec's enumerated authoring sites" — must-precede (the widened ERR-13 vector set's completed-`invoke`-child vector has no H4a scripting point until this finding is resolved)

---

# T11 — Closing-gate clause omits the "executable" qualifier and reddens on deliberately-unmapped `GOV-*`

**Original heading:** §REQ-ID discipline (closing-gate clause) — omits "executable" qualifier, conflicts with unmapped GOV-*
**Original section:** docs/plan_topics/conventions.md
**Kind:** clarity
**Importance:** high
**Score:** 100
**MustFix:** false

## Finding

The `REQ-ID discipline` convention in `conventions.md` states the loom 1.0 closing gate's first failure surface as: "The loom 1.0 closing gate treats **a spec REQ-ID** without a coverage-matrix mapping, a retired-ID clashing with a live-ID, or a per-prefix numbering hole as a CI failure." This sentence carries no `executable` qualifier, so it reads as: *every* spec REQ-ID without a coverage-matrix row reds CI.

The rest of the corpus contradicts that literal reading. `coverage-matrix.md`'s "Governance REQ-IDs (`GOV-*`)" section deliberately leaves every `GOV-1, GOV-3, GOV-5 … GOV-31` unmapped — they "govern the spec corpus itself … not behaviours the loom runtime implements, so they map to no runtime leaf." The matrix intro, `H5a`'s `Adds`, and `H6a`'s `Tests`/`Ships when` all scope the gate to an **executable** spec REQ-ID ("any executable REQ-ID without a mapping fails CI"; "an unmapped executable REQ-ID"; "every executable spec REQ-ID maps to a closing leaf"). The same `conventions.md` bullet even uses the qualified form further down ("on the same live-corpus footing as an unmapped executable REQ-ID"). Only the first sentence drops it.

The authoritative governance statement therefore disagrees with the matrix it governs: read literally, the gate must red on every deliberately-unmapped `GOV-*`, which is exactly the set `coverage-matrix.md` declares out of scope.

## Plan Documents

- `docs/plan_topics/conventions.md` — `REQ-ID discipline` convention, closing-gate sentence (edited)
- `docs/plan_topics/coverage-matrix.md` — intro + "Governance REQ-IDs (`GOV-*`)" section (read-only)
- `docs/plan_topics/H5a-closing-gate-automation.md` — `Adds` (read-only)
- `docs/plan_topics/H6a-live-corpus-activation.md` — `Tests` / `Ships when` (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** None

**Leaves (implementation order):**

None — the fix is confined to the cross-cutting `conventions.md` wording. `H5a`, `H5b`, and `H6a` (the leaves that build, canary, and activate the gate) already phrase the surface with the `executable` qualifier, so they need no change; the defect does not propagate to any leaf's acceptance criteria.

## Consequence

**Severity:** correctness

`conventions.md` is the authoritative definition of the closing gate. An implementer building the `H5a`/`H6a` gate from its first sentence verbatim would flag every deliberately-unmapped `GOV-*` and the loom 1.0 release gate could never go green; an implementer cross-referencing `coverage-matrix.md`, `H5a`, and `H6a` would exclude them. Two reasonable implementers diverge on whether `GOV-*` reds CI.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** c1e5d64 — spec: REQ-ID infrastructure + Phase 12a heading promotion on five named pages (Decision #12, partial) (2026-05-05, Thomas Andersen); c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** c1e5d64 introduced the `REQ-ID discipline` closing-gate clause in `conventions.md` as "treats a spec REQ-ID without a coverage-matrix mapping … as a CI failure"; `git log -G 'treats an executable spec REQ-ID'` finds no commit, so the `executable` qualifier was never present in this sentence. The omission was latent until c6a664e rebuilt `coverage-matrix.md` to deliberately leave every `GOV-*` unmapped (the "map to no runtime leaf" section) and standardised the matrix intro, `H5a`, and `H6a` on the "executable spec REQ-ID" wording the `conventions.md` clause never adopted. The two commits together make the un-qualified clause read as reddening CI on the deliberately-unmapped `GOV-*` set.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/conventions.md`, within the `REQ-ID discipline` convention, insert the `executable` qualifier into the closing-gate sentence so it reads: "The loom 1.0 closing gate treats an **executable** spec REQ-ID without a coverage-matrix mapping, a retired-ID clashing with a live-ID, or a per-prefix numbering hole as a CI failure." This aligns the authoritative governance statement with `coverage-matrix.md`'s intro ("any executable REQ-ID without a mapping fails CI"), `H5a`'s `Adds` ("an unmapped executable REQ-ID"), `H6a`'s `Tests` ("every executable spec REQ-ID maps to a closing leaf"), and the same bullet's own later phrasing ("an unmapped executable REQ-ID").

Implementer note: the term `executable` is itself not yet defined as a mechanical predicate (it is the subject of a separate finding); inserting the qualifier here makes that definition gap load-bearing for this clause, but defining the predicate is out of scope for this edit.

## Relationships

- T19 "\"executable spec REQ-ID\" is the closing-gate selector but is never defined as a predicate" — must-follow (this fix makes `conventions.md` rely on the `executable` predicate, so the term's definition must be pinned first to cover this clause)
- T12 "Un-anchored-MUST recogniser names two different diagnostics-registry scopes across `conventions.md` and `coverage-matrix.md`" — same-cluster (same `REQ-ID discipline` bullet; resolves independently)

---

# T12 — Un-anchored-MUST recogniser names two different diagnostics-registry scopes across `conventions.md` and `coverage-matrix.md`

**Original heading:** §REQ-ID discipline / coverage-matrix.md — un-anchored-MUST recogniser registry-code scope diverges
**Original section:** docs/plan_topics/conventions.md
**Kind:** clarity
**Importance:** high
**Score:** 100
**MustFix:** true

## Finding

The closing-gate's un-anchored-MUST recogniser is defined with two different diagnostics-registry-code scopes in the two files that author it. `conventions.md` (*REQ-ID discipline*) restricts the anchoring exclusion to the closed set `loom/{parse,load,runtime}/*` in both places it states the predicate ("carries neither a numbered `PREFIX-N` REQ-ID nor a `loom/{parse,load,runtime}/*` diagnostics-registry code" and "that excludes obligations already carrying a `PREFIX-N` REQ-ID or a `loom/{parse,load,runtime}/*` registry code"). `coverage-matrix.md` (and the gate-implementation leaves `H5a`, `H5b`, `H6a`) state the same predicate with the open form "no `loom/...` registry code".

The diagnostics registry actually owns **four** code namespaces, not three: `code-registry-parse.md`, `code-registry-load.md`, `code-registry-runtime.md`, **and** `code-registry-host.md`. The corpus has live `loom/host/*` codes (e.g. the `loom/host/session-shutdown-*` teardown family). A normative MUST on a `pi-integration-contract` page anchored only by a `loom/host/*` code therefore reads two ways: under `conventions.md`'s closed set the MUST carries no recognised registry code and is **flagged un-anchored** (CI failure absent a closing-leaf row); under `coverage-matrix.md`'s open `loom/...` the same MUST matches and is **excluded** from the gate. Incompatible gate behaviour on the same pages.

The corpus also carries the build-time `loom/typecheck/*` brand-string prefix (e.g. `loom/typecheck/session-shutdown-reason-snapshot`), which is **not** a diagnostics-registry code — it is a `tsc` brand string, and `H5a` already carves it out of registry reconciliation. The open `loom/...` wording literally matches `loom/typecheck/*` too, so whichever scope is chosen must also state that a `loom/typecheck/*` brand does not anchor a normative obligation. Aligning the two files requires settling both questions — the `host` namespace and the `typecheck` prefix — in one wording stated identically wherever the recogniser predicate appears.

## Plan Documents

- `docs/plan_topics/conventions.md` — *REQ-ID discipline* (closed `loom/{parse,load,runtime}/*` form, two occurrences) (edited)
- `docs/plan_topics/coverage-matrix.md` — *Code-keyed obligation areas* intro / un-anchored-MUST clause (open `loom/...` form) (read-only)
- `docs/plan_topics/H5a-closing-gate-automation.md` — *Adds* and *Convention* bullets (open `loom/...` recogniser; already excludes `loom/typecheck/*` from registry reconciliation) (read-only)
- `docs/plan_topics/H5b-warn-only-canary.md` — *Adds* / *Convention* (open `loom/...` recogniser) (read-only)
- `docs/plan_topics/H6a-live-corpus-activation.md` — *Adds* / *Convention* (open `loom/...` recogniser) (read-only)
- `docs/plan_topics/H2a-cross-cutting-gates.md` — *Specific exception types only* broad-catch allow-list (shares the open `loom/...` registry-code arm; separate predicate) (read-only)
- `docs/plan.md` — §Authoring item 5 / §Release gate (release-gate references; no scope wording) (read-only)

## Spec Documents

- `docs/spec_topics/diagnostics/code-registry-host.md` — establishes the live `loom/host/*` namespace (read-only)
- `docs/spec_topics/diagnostics/code-registry-parse.md` / `code-registry-load.md` / `code-registry-runtime.md` — the other three registry namespaces (read-only)
- `docs/spec_topics/diagnostics/placeholder-rendering-a.md` — enumerates the four registry tables (parse/load/runtime/host) (read-only)

The fix is internal to the plan files; it edits no spec page.

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H2a` — Cross-cutting lint and architectural gates — (modified)
- `H5a` — REQ-ID / diagnostic-code closing-gate automation — (modified)
- `H5b` — Warn-only live-corpus canary (pre-activation pre-flight) — (modified)
- `H6a` — Live-corpus closing-gate activation (loom 1.0 release gate) — (modified)

(`H5a`/`H5b`/`H6a` carry the recogniser-scope wording; whether they are edited or merely the read-site of an aligned wording depends on the chosen scope. `H2a` shares the open `loom/...` registry-code arm in a separate broad-catch predicate; touch only if the chosen scope wording is unified across that arm too.)

## Consequence

**Severity:** correctness

A normative MUST anchored only by a `loom/host/*` code is flagged un-anchored under `conventions.md` (reddening CI at the `H6a` live-corpus gate unless a closing-leaf row is added) but excluded under `coverage-matrix.md`/`H5a`. Two implementers reading the two files build the recogniser with different scopes, so the closing gate either over-fires on already-code-keyed `host` obligations or, conversely, lets a genuinely un-anchored MUST slip — and the divergence is invisible until the gate runs against the live `spec_topics/**` corpus.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** 0603eb4 — pi-loom plan: resolve "un-anchored normative MUSTs invisible to closing gate" (2026-06-10, Thomas Andersen)
**History:** The un-anchored-MUST recogniser feature was introduced in a single commit (0603eb4) that authored both files' scope wording at once, with the divergence already baked in: the new `conventions.md` *REQ-ID discipline* clause used the closed `loom/{parse,load,runtime}/*` form while the new `coverage-matrix.md` un-anchored-obligation clause used the open `loom/...` form in the same diff. The later refinement commit 1035d0b ("…recogniser overclaims precision/recall", same day) reworked the recogniser but preserved the closed form in `conventions.md`, so the mismatch has existed since the feature's first commit.

## Solution Space

**Shape:** single

### Recommendation

Change the two `loom/{parse,load,runtime}/*` occurrences in `conventions.md` *REQ-ID discipline* to the open `loom/...` form, matching `coverage-matrix.md`, `H5a`, `H5b`, and `H6a`. Add a sentence to `conventions.md` stating that a `loom/typecheck/*` build-time brand string is not a diagnostics-registry code and does not anchor a normative obligation — the same carve-out `H5a` already applies to registry reconciliation, restated here for the un-anchored-MUST recogniser. This converges all five files to a single wording with a one-file diff, consistent with the form `H5a`/`H5b`/`H6a` already implement.

Edge case the fixer must watch: the carve-out sentence must scope to the un-anchored-MUST recogniser specifically, since `H5a`'s existing carve-out is phrased for registry reconciliation and may be read as not covering the recogniser surface. If the `loom/typecheck/*` carve-out sentence is omitted, the open form silently re-admits the typecheck prefix as an anchor.

## Relationships

- T11 "Closing-gate clause omits the \"executable\" qualifier and reddens on deliberately-unmapped `GOV-*`" — same-cluster (adjacent clause of the same *REQ-ID discipline* rule; resolves independently)
- T19 "\"executable spec REQ-ID\" is the closing-gate selector but is never defined as a predicate" — same-cluster (same §REQ-ID-discipline / coverage-matrix surface; resolves independently)
- T13 "V9h's two `pi-integration-contract` pages have no coverage-matrix closing rows" — same-cluster (both bear on which un-anchored MUSTs the gate flags on pi-integration-contract pages; resolves independently)

---

# T13 — V9h's two `pi-integration-contract` pages have no coverage-matrix closing rows

**Original heading:** Two pi-integration-contract pages V9h implements have no PIC rows
**Original section:** docs/plan_topics/coverage-matrix.md
**Kind:** traceability
**Importance:** high
**Score:** 100
**MustFix:** true

## Finding

`V9h` lists [`spec_topics/pi-integration-contract/session-only-degraded-state.md`](../../docs/spec_topics/pi-integration-contract/session-only-degraded-state.md) and [`unknown-reason-rule.md`](../../docs/spec_topics/pi-integration-contract/unknown-reason-rule.md) in its **Spec.** field and closes their obligations (its Tests assert `loom/host/session-shutdown-reason-unknown`, `…-pinned-constant-unreadable`, and `…-runtime-degraded`). Both pages sit under the `pi-integration-contract/` directory, which carries the `PIC` REQ-ID prefix in the [active prefix table](../../docs/spec_topics/governance/req-id-prefix-table-active-a.md) — i.e. they are **non-narrative** pages in the sense the closing-gate recogniser uses (their prefix-table cell is not the byte-exact `(no IDs — narrative)` literal).

Neither page carries any numbered `PIC-n` REQ-ID, and neither appears in `coverage-matrix.md` — not in the numbered-REQ-ID table and not in the *Code-keyed obligation areas (no numbered REQ-IDs)* table. Yet both pages are dense with un-anchored normative MUST/MUST-NOTs: the Recovery-path prohibitions (`MUST NOT un-drain`, `MUST NOT re-subscribe`, `MUST NOT poll`, `MUST NOT introduce any other … self-recovery path`), the *Seam-minimality* `MUST NOT introduce any handler-scoped state seam …`, the inline-normative-triplet clause, and the three independently-anchored sub-obligations of the unknown-reason rule (`#unknown-reason-rule-membership-check`, `#unknown-reason-rule-constant-source`, `#unknown-reason-rule-handler-trycatch`), among others.

Per `conventions.md` §REQ-ID discipline, the third closing-gate surface treats a normative MUST/MUST-NOT on a non-narrative `spec_topics/**` page that carries neither a `PREFIX-N` REQ-ID nor a `loom/{parse,load,runtime}/*` registry code as the GOV-22 un-anchored-obligation class, and the gate reds on any such MUST that is not enumerated in `coverage-matrix.md` with a named closing leaf. The sibling PIC pages V9b/V9c/V9e close (`drain-state-contract.md`, `conversation-drive.md`, `active-invocation-registry.md`) each received a code-keyed row naming their closing leaf; V9h's two pages were left without that bridge.

## Plan Documents

- `docs/plan_topics/coverage-matrix.md` — *Code-keyed obligation areas (no numbered REQ-IDs)* table (edited)
- `docs/plan_topics/conventions.md` — §REQ-ID discipline, third closing-gate surface (read-only)
- `docs/plan_topics/V9h-degraded-unknown-reason.md` — Spec / Tests (read-only)
- `docs/plan_topics/H5a-closing-gate-automation.md` — closing-gate recogniser (read-only)
- `docs/plan_topics/H6a-live-corpus-activation.md` — live-corpus footing flip (read-only)

## Spec Documents

None — the closure path is internal to the plan's coverage matrix; both spec pages already carry the MUSTs that need a closing-leaf bridge, so no spec edit is required.

## Affected Leaves

**Phases:** V9 — Extension host integration

**Leaves (implementation order):**

- `V9h` — Session-only degraded state and unknown-reason rule — (modified)

`V9h` is already inside `H5b`'s `Deps.` (via the `V9a`–`V9j` range), so no transitive-completeness `Deps.` edit is triggered; the fix adds coverage rows naming the already-existing leaf rather than introducing a new one.

## Consequence

**Severity:** blocking

At the loom 1.0 release gate (the live-corpus footing `H6a` activates), the closing gate's un-anchored-MUST scan over `session-only-degraded-state.md` and `unknown-reason-rule.md` finds many MUST/MUST-NOTs with no enumerated closing leaf and reds CI, so the release cannot pass until the rows exist. The obligations are in fact implemented by `V9h`, but the missing matrix bridge means that work is untraceable to the obligations it closes and the gate cannot distinguish "covered but un-rowed" from "genuinely uncovered".

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** `0603eb4` (`pi-loom plan: resolve "un-anchored normative MUSTs invisible to closing gate"`, 2026-06-10), `adb521f` (`pi-loom plan: resolve "V9b/V9c/V9e PIC-area MUSTs missing from code-keyed obligation-area table"`, 2026-06-11)
**History:** The corpus is git-tracked. `V9h` was authored in `c6a664e` (2026-06-10 08:16) with both pages already in its **Spec.** field. The un-anchored-MUST closing-gate surface and the *Code-keyed obligation areas* table were introduced in `0603eb4` (2026-06-10 09:07), at which point only a single PIC code-keyed row existed (`conversation-drive.md` → `V14a`); the obligation to enumerate every un-anchored-MUST page with a closing leaf bound V9h's two pages from that commit, but no rows were added for them. The remediation pass `adb521f` (2026-06-11 06:58) added code-keyed rows for the analogous sibling PIC pages closed by `V9b`/`V9c`/`V9e` (`drain-state-contract.md`, `conversation-drive.md` §`untyped-query-ok-extraction`, `active-invocation-registry.md`) but did not extend the same treatment to `V9h`'s `session-only-degraded-state.md` and `unknown-reason-rule.md`, leaving them as the residual un-rowed PIC pages. The defect is thus the interaction of the obligation introduced at `0603eb4` and the incomplete sibling sweep at `adb521f`.

## Solution Space

**Shape:** single

### Recommendation

Add two rows to the *Code-keyed obligation areas (no numbered REQ-IDs)* table in `docs/plan_topics/coverage-matrix.md`, one per page, each naming `V9h` as the closing leaf, following the same row form as the existing `pi-integration-contract/drain-state-contract.md … | V9b` and `pi-integration-contract/active-invocation-registry.md … | V9e` rows (spec-area prefix with the page path, a short enumeration of the page's un-anchored MUST obligations, the `(un-anchored; GOV-22 residue)` tag, and `V9h` in the closing-leaf column).

- Row for `pi-integration-contract/session-only-degraded-state.md` enumerating its un-anchored obligations — at minimum the Recovery-path prohibition set (no un-drain / no re-subscribe / no poll / no other self-recovery path), the state-independent drain-state tag write, the *Predicate split* diagnostic-emission-vs-tag-transition rule, the *Seam-minimality* `MUST NOT introduce any handler-scoped state seam` prohibition, and the *Inline triplet is normative* clause — naming `V9h`.
- Row for `pi-integration-contract/unknown-reason-rule.md` enumerating its three sub-anchored obligations (`#unknown-reason-rule-membership-check`, `#unknown-reason-rule-constant-source`, `#unknown-reason-rule-handler-trycatch`) and the anchor-stable contract-surface MUSTs (the two diagnostic codes, the closed-set literal, and the three `details.failure` discriminator literals), naming `V9h`.

The spec pages are read-only for this fix: do not re-anchor any of these MUSTs as new `PIC-n` REQ-IDs (re-anchoring is a spec-side GOV-22 decision owned by a spec-coverage finding, not this plan edit). Honour the leaf-ID scheme already in use; the closing leaf is the existing `V9h`, not a new ID. Edge case the implementer must watch: the unknown-reason rule's own carve-out marks its *in-paragraph restatements* of the diagnostic codes and closed-set literal as out of anchor-stable scope, so the row should describe the page's standing obligations rather than treat every in-prose code occurrence as a separate gate target.

## Relationships

- T12 "Un-anchored-MUST recogniser names two different diagnostics-registry scopes across `conventions.md` and `coverage-matrix.md`" — same-cluster (both bear on which un-anchored MUSTs the gate flags on pi-integration-contract pages; resolves independently)

---

# T14 — V4a omits a Deps edge on V4d despite consuming the V4d-owned `QueryError` type

**Original heading:** V4a uses the `QueryError` type but does not depend on V4d (ordering)
**Original section:** docs/plan_topics/V4a-match-result.md (+ V4a-T)
**Kind:** ordering
**Importance:** high
**Score:** 100
**MustFix:** false

## Finding

`V4a` and `V4a-T` close ERR-18: a `?` whose operand is not statically `Result<_, QueryError>` fires `question-on-non-result` (type phase). That assertion requires the `QueryError` type to be resolvable at the time the leaf is built. `QueryError` is owned by `V4d` — `V4d`'s Adds introduces the nine-variant `QueryError` union and its wire forms; it is not a primordial built-in registered elsewhere.

`V4a`'s Deps are `V4a-T`, `V2b`, `V3a`, and `V4a-T`'s Deps are `V2b`, `V3a`. Neither edge — nor anything in their transitive closure (`V2b`, `V3a`, `V3a`'s chain) — introduces `QueryError`. Following the plan's "pick the next leaf whose Deps are satisfied" build order, `V4a-T`/`V4a` therefore become buildable before `V4d`, at which point the ERR-18 test references an unknown type and the suite reds on "unknown type `QueryError`" instead of the intended `question-on-non-result` reason.

Every other leaf that consumes `QueryError` in a type-phase assertion declares the dependency explicitly (`V12b`, `V14a`, `V17a`, `V9j` all list `V4d` in Deps); `V4a` is the outlier. The defect also propagates one hop: `V3d` and `V3d-T` Dep on `V4a` and inherit the broken closure, so correcting `V4a`'s edge resolves them transitively without a separate edit.

## Plan Documents

- `docs/plan_topics/V4a-match-result.md` — Deps field (edited)
- `docs/plan_topics/V4a-T-match-result.md` — Deps field (edited)
- `docs/plan_topics/V4d-queryerror-variants.md` — QueryError owner, consulted to confirm ownership (read-only)
- `docs/plan_topics/V3d-functions-and-return.md` — transitive consumer (read-only)
- `docs/plan_topics/V3d-T-functions-and-return.md` — transitive consumer (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical (slices V3, V4)

**Leaves (implementation order):**

- `V3d-T` — Functions and return (tests) — (blocked)
- `V3d` — Functions and return — (blocked)
- `V4a-T` — `match`, `?`, and `Result` (tests) — (both)
- `V4a` — `match`, `?`, and `Result` — (both)

## Consequence

**Severity:** blocking

An implementer building in Deps-satisfied order can pick up `V4a-T`/`V4a` before `V4d` exists, so the ERR-18 type-phase assertion reds on "unknown type `QueryError`" rather than the intended `question-on-non-result`. `V4a-T`'s Ships-when ("the tests above exist, compile, and fail red for the intended reason") cannot be satisfied honestly, and `V3d`/`V3d-T` inherit the same broken-closure red transitively.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e (2026-06-10)
**History:** `V4a`'s ERR-18 test and its `QueryError` reference, and `V4d`'s `QueryError` ownership, were all authored in the initial plan-build commit `c6a664e` (`git log -S 'ERR-18'`/`-S 'QueryError'` on V4a/V4a-T resolve to `c6a664e`; `V4d` was created in the same commit). `git log -G 'V4d'` over `V4a-match-result.md` and `V4a-T-match-result.md` returns no commits, so the Deps edge has never been present. The two later edits (516fd86, 22f762c) reworked V4a's match-exhaustiveness wording but did not add the edge. The missing dependency has existed since the leaf was first authored.

## Solution Space

**Shape:** single

### Recommendation

Add `V4d` to the **Deps.** field of both `docs/plan_topics/V4a-match-result.md` (alongside the existing `V4a-T`, `V2b`, `V3a`) and `docs/plan_topics/V4a-T-match-result.md` (alongside `V2b`, `V3a`).

Edge cases for the implementer:
- The edge is acyclic: `V4d`'s closure is `V4d → V4d-T, V5d → {V5a, V5b, V2d} → V2a`, which never reaches `V4a`.
- `V4d` is listed after `V4a` in the V4 TOC of `docs/plan.md`; the new Deps edge makes `V4d` a build-time prerequisite of `V4a` despite the later listing. Build order is governed by the Deps DAG, not TOC appearance, so this is permitted and needs no TOC change.
- `QueryError` is not a primordial built-in (`V4d`'s Adds owns the union), so the "name the registering leaf instead" alternative does not apply.
- No edit to `V3d`/`V3d-T` is needed; their Dep on `V4a` picks up the corrected closure once `V4a` declares `V4d`.

## Relationships

- T07 "V5e references V4d-owned `ValidationIssue` / `ValidationError` without declaring a `V4d` dependency" — same-cluster (same missing-`V4d`-Deps-edge pattern; resolves independently)

---

# T15 — `Promise.allSettled` aggregate-await ownership is credited to V9e but the call site lives in V9g's `session_shutdown` handler

**Original heading:** `Promise.allSettled` aggregate-await call-site ownership split between V9e and V9g
**Original section:** docs/plan_topics/V9e + V9g — Promise.allSettled ownership
**Kind:** implementability
**Importance:** high
**Score:** 100
**MustFix:** true

## Finding

The spec splits two distinct constructs cleanly. The per-entry `disposeBarrier` is a `Promise<void>` that the per-invocation `finally` settles after `AgentSession.dispose()` returns (subagent mode) or immediately (prompt mode) — `active-invocation-registry.md` (*`disposeBarrier` resolver storage*) is explicit that this is a per-entry promise, never the aggregate. The aggregate await `await Promise.allSettled(activeInvocations.map(inv => inv.disposeBarrier))` is sub-step 3 of the `session_shutdown` handler, pinned in `patch-skew-degradation.md` and `host-interfaces-core.md`. The registry leaf owns the former; the session-shutdown handler leaf owns the latter.

The plan crosses these wires. V9e's Adds describes its `disposeBarrier` as "which awaits every in-flight entry's disposal to settle via `Promise.allSettled`", and V9e-T's Tests bullet asserts "the `disposeBarrier` blocks until all entries are disposed" — both attribute the *aggregate* settle-all to the *per-entry* barrier the registry leaf owns. The coverage-matrix code-keyed obligation-area row (row 80) likewise keys the "`disposeBarrier` `Promise.allSettled` settle-all" MUST to V9e. Meanwhile V9g — whose `session_shutdown` handler is where the spec actually performs the aggregate await — describes the teardown only as "abort-and-await within `SHUTDOWN_AWAIT_CAP_MS`" and never names `Promise.allSettled`.

Under the `conventions.md` *Sequential by default* carve-out, the leaf whose production code contains the `Promise.allSettled(...)` call must (i) cite the obligation in `Spec.`, (ii) name the construct in `Adds.` together with the REQ-ID or code-keyed obligation area, and carry an ESLint allow-list entry `// allow: <token> — <spec-page>` whose token resolves to a matrix-enumerated code-keyed area. The aggregate call site is V9g's handler, but the construct is named in V9e's Adds and the matrix row that enumerates it is keyed to V9e. Neither leaf unambiguously owns the production call site: the leaf that names and is credited with the construct (V9e) is not the leaf that contains the call, and the leaf that contains the call (V9g) neither names the construct nor is keyed to it in the matrix.

## Plan Documents

- `docs/plan_topics/V9e-active-invocation-registry.md` — Adds, Tests (edited)
- `docs/plan_topics/V9e-T-active-invocation-registry.md` — Tests (edited)
- `docs/plan_topics/V9g-session-shutdown.md` — Adds (edited)
- `docs/plan_topics/V9g-T-session-shutdown.md` — Tests (edited)
- `docs/plan_topics/coverage-matrix.md` — Code-keyed obligation areas (row keying the `disposeBarrier` `Promise.allSettled` settle-all MUST) (edited)
- `docs/plan_topics/conventions.md` — Sequential by default (read-only)

## Spec Documents

None — the spec already places the aggregate await in the `session_shutdown` handler (`patch-skew-degradation.md` sub-step 3, `host-interfaces-core.md`) and defines `disposeBarrier` as a per-entry `Promise<void>` (`active-invocation-registry.md`). The fix is internal to plan files.

## Affected Leaves

**Phases:** V9 — Extension host integration

**Leaves (implementation order):**

- `V9e-T` — `ActiveInvocationRegistry` (tests) — (modified)
- `V9e` — `ActiveInvocationRegistry` — (modified)
- `V9g-T` — Session-shutdown teardown and emission isolation (tests) — (modified)
- `V9g` — Session-shutdown teardown and emission isolation — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge on where the aggregate `Promise.allSettled(activeInvocations.map(inv => inv.disposeBarrier))` lives: V9e's Adds and the coverage matrix credit V9e, so a V9e implementer may place the aggregate await in the registry module to make V9e-T's "blocks until all entries are disposed" bullet green — contradicting the spec, which performs it in the V9g `session_shutdown` handler. The result is either a spec-violating registry implementation, or V9g holding the real call site while V9e's matrix-credited coverage is vacuous and the Sequential-by-default allow-list token is keyed to a leaf that does not contain the call.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen); 75b6a9b — pi-loom plan: resolve "Sequential by default carve-out admits only a numbered REQ-ID" (2026-06-10, Thomas Andersen); adb521f — pi-loom plan: resolve "V9b/V9c/V9e PIC-area MUSTs missing from code-keyed obligation-area table" (2026-06-11, Thomas Andersen)
**History:** `c6a664e` created both leaves; at that point V9g's Adds already described teardown as "abort-and-await within `SHUTDOWN_AWAIT_CAP_MS`" without naming the construct, and V9e's `disposeBarrier` carried no aggregate claim. `75b6a9b` added the parenthetical "(which awaits every in-flight entry's disposal to settle via `Promise.allSettled` …)" to V9e's Adds to satisfy the Sequential-by-default carve-out, attaching the construct to the per-entry-barrier leaf rather than the handler that performs the aggregate await. `adb521f` then added the coverage-matrix code-keyed row crediting the "`disposeBarrier` `Promise.allSettled` settle-all" MUST to V9e, cementing the mis-ownership. The split — construct named and keyed to V9e, call site in V9g — is the product of these three commits.

## Solution Space

**Shape:** single

This finding carries two complementary, both-required obligations across different leaves and files: removing the false aggregate claim from V9e, and installing ownership on V9g (Adds + coverage-matrix re-key + tests). Apply the de-conflation first so the construct is removed from the wrong leaf and the baseline is stable, then install ownership on V9g onto that clean baseline so ownership lands without a double-ownership window.

### Recommendation

The spec is authoritative and read-only here — it already places the aggregate await in the `session_shutdown` handler and defines `disposeBarrier` as a per-entry `Promise<void>`; do not edit the spec to match the plan. No new leaf is needed; honour the existing `V9*` leaf-ID scheme and the no-invented-IDs rule. Apply both edits below in order — first de-conflate V9e, then install ownership on V9g — so ownership never overlaps. No spec edits.

**De-conflate V9e — describe only the per-entry barrier the registry owns.**
- `docs/plan_topics/V9e-active-invocation-registry.md`, `Adds.`: strike the parenthetical `(which awaits every in-flight entry's disposal to settle via `Promise.allSettled` — [active-invocation-registry.md](...), PIC code-keyed area)` so `disposeBarrier` reads as the per-entry `Promise<void>` the per-invocation `finally` settles (per `active-invocation-registry.md` *`disposeBarrier` resolver storage*).
- `docs/plan_topics/V9e-T-active-invocation-registry.md`, `Tests.`: revise the `disposeBarrier` bullet so it asserts the per-entry barrier settles after that entry's `AgentSession.dispose()` returns (subagent mode) / immediately (prompt mode) — a single entry's `Promise<void>`, not the aggregate "until all entries are disposed".

**Assign aggregate-await ownership to V9g — the leaf whose production code performs the call.**
- `docs/plan_topics/V9g-session-shutdown.md`, `Adds.`: name `Promise.allSettled` for the sub-step-3 aggregate await over every entry's `disposeBarrier`, citing the matrix-enumerated code-keyed obligation area (the `session_shutdown` sub-step-3 settle-all obligation in `patch-skew-degradation.md` / `host-interfaces-core.md`), so the leaf that houses the call satisfies the Sequential-by-default carve-out and supplies a resolvable `// allow:` token.
- `docs/plan_topics/coverage-matrix.md`, *Code-keyed obligation areas*: key the "`disposeBarrier` `Promise.allSettled` settle-all" MUST to V9g (the leaf whose code performs it), leaving the insertion-order-iteration and `invocationId`-from-`IdSource.newInvocationId()` MUSTs keyed to V9e. Re-keying changes the row identifier the V9e/V9g tests cite, so coordinate with the row-identifier-citation concern.
- `docs/plan_topics/V9g-T-session-shutdown.md`, `Tests.`: assert sub-step 3 awaits every in-flight entry's `disposeBarrier` to settle, bounded by `SHUTDOWN_AWAIT_CAP_MS`, citing the re-keyed matrix row.

## Relationships

None

---

# T16 — Six `invoke` parse/load diagnostic codes have no asserting leaf and no coverage-matrix row

**Original heading:** Invoke arg/arity/return-type/static-resolution diagnostic codes have no asserting plan step
**Original section:** docs/plan_topics/coverage-matrix.md
**Kind:** spec-coverage
**Importance:** high
**Score:** 100
**MustFix:** true

## Finding

`spec_topics/invocation.md` defines six normative parse/load diagnostic codes as MUST-equivalents in narrative prose, each outside any `INV-N` anchor:

- `loom/parse/invoke-arg-type-mismatch` (§Argument binding — type mismatch when the callee is statically resolvable),
- `loom/parse/invoke-return-type-mismatch` (§Typed return — `T_calleeReturn ⊑ Schema` compatibility failure),
- `loom/parse/invoke-arity-too-few` and `loom/parse/invoke-arity-too-many` (§Argument arity — arity checked before per-argument type, `too-many` fires even when the callee is not statically resolvable),
- `loom/parse/invoke-non-loom-extension` (§Resolution — a non-`.loom` literal path, also applied to `tools:` `.loom` entries),
- `loom/load/callee-has-errors` (§Static resolution — emitted at the referencing site with a deliberate severity split: **error** for an unparseable `tools:` `.loom` entry, **warning** for a literal `invoke(...)` callee).

No plan leaf asserts any of these six codes. A grep across `docs/plan_topics/` and `docs/plan.md` for each code returns zero hits. The invocation slice splits its coverage as: `V15a` closes the numbered `INV-1/2/3`, `V15b` closes `INV-4` plus `loom/load/invocation-cycle`, and `V14a` closes the tool-side codes (`loom/parse/tool-arg-not-literal`, `tool-arg-arity`, `tool-arg-type-mismatch`) — none of these closes the six invoke parse/load codes above.

`coverage-matrix.md` compounds the gap: its numbered table maps `INV-1, INV-2, INV-3 → V15a` and `INV-4 → V15b`, but the §"Code-keyed obligation areas" table carries no `invocation.md` row for the un-anchored parse/load codes (unlike the rows it already carries for `drain-state-contract.md`, `active-invocation-registry.md`, etc.). The codes are therefore un-anchored normative MUST-equivalents with neither a numbered `PREFIX-N` REQ-ID nor a code-keyed matrix row — exactly the GOV-22 residue the un-anchored-MUST discipline (`conventions.md` §REQ-ID discipline) and the diagnostic-code closing gate are meant to catch, yet the closing gate enumerates its enforced set from the coverage matrix, so a code absent from the matrix is invisible to the gate.

## Plan Documents

- `docs/plan_topics/V15a-invocation-core.md` — Tests / Ships when (edited)
- `docs/plan_topics/V15a-T-invocation-core.md` — Tests / Ships when (edited)
- `docs/plan_topics/coverage-matrix.md` — §Code-keyed obligation areas (no numbered REQ-IDs) (edited)
- `docs/plan_topics/V15b-invoke-depth-cycle.md` — Tests (read-only; scoping boundary for `INV-4` / `invocation-cycle`)
- `docs/plan_topics/V14a-tool-calls.md` — Tests (read-only; scoping boundary for the tool-side codes)
- `docs/plan_topics/conventions.md` — §REQ-ID discipline / §Diagnostic message anchors (read-only; defines the closing-gate disciplines)

## Spec Documents

None (the six codes already exist in `spec_topics/invocation.md`; the fix is internal to plan files).

## Affected Leaves

**Phases:** Vertical slice V15 — Invocation and imports

**Leaves (implementation order):**

- `V14a` — Tool calls (code-side) and `CodeToolError` — (blocked) — scoping reference: confirms the six codes are not the tool-side codes it closes
- `V15a` — Invocation core — (modified) — candidate home for the six asserting Tests bullets
- `V15a-T` — Invocation core (tests task) — (modified) — paired failing tests for the six codes
- `V15b` — Invoke depth bound and cycle detection — (blocked) — scoping reference: confirms the six codes are not `INV-4` / `invocation-cycle`
- `<new>` — dedicated `V15*` assertion leaf (and its `-T`) — (added) — option-dependent; only if the codes are not folded into `V15a`

## Consequence

**Severity:** correctness

Six core `invoke` parse/load diagnostics have no asserting test, so an implementer can ship `invoke` without the argument-type, return-type, arity, non-`.loom`-extension, and `callee-has-errors` checks and no leaf's green tests will red. Because the codes are absent from the coverage matrix, the H5a closing gate enumerates its enforced set without them and passes vacuously rather than flagging the gap, so the under-implementation ships silently rather than being caught at the loom 1.0 release footing.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e ("pi-loom plan: build/update plan for spec.md + review", 2026-06-10)
**History:** The plan corpus is git-tracked. `git log --follow` shows `V15a-invocation-core.md`, `V15b-invoke-depth-cycle.md`, and `V14a-tool-calls.md` were all created in `c6a664e`, the build commit of the current plan generation; no later commit adds the six codes (`git log -S` for `invoke-arity-too-many`, `invoke-return-type-mismatch`, and `callee-has-errors` over `docs/plan_topics/` and `docs/plan.md` returns only the pre-reset commits `657ee76` and `31ff060`, both predating `c6a664e`). `coverage-matrix.md`'s code-keyed table was repopulated in `c6a664e` and extended by later "resolve" commits, but never gained an `invocation.md` row. A prior plan generation (`v15-invoke.md`) did reference these codes but was deleted in the `657ee76` reset-to-scaffold and is not part of the live corpus. Within the current plan generation the gap has existed since `c6a664e`.

## Solution Space

**Shape:** single

This finding carries two independent obligations that are both required: make an invocation leaf assert the six codes, then register a code-keyed coverage-matrix row so the H5a closing gate observes them. Resolve the assertion obligation first, because it fixes the closing-leaf identity the matrix row must cite.

### Recommendation

Add Tests bullets asserting each of the six `invoke` parse/load diagnostic codes to an invocation-core leaf and gate its Ships-when on them, then add the corresponding code-keyed coverage-matrix row that names that leaf. The spec is read-only for this fix — the six codes already exist in `invocation.md`; do not add or restate them in the spec.

**Assertion leaf.** In the chosen invocation leaf's `-T` (failing tests first) and impl `Tests` field, assert that each of `loom/parse/invoke-arg-type-mismatch`, `loom/parse/invoke-return-type-mismatch`, `loom/parse/invoke-arity-too-few`, `loom/parse/invoke-arity-too-many`, `loom/parse/invoke-non-loom-extension`, and `loom/load/callee-has-errors` fires on its triggering condition, and extend Ships-when to gate on them. Cite `invocation.md` anchors per the existing bullet style. The home is either `V15a` (folded into the existing invoke-core leaf and its `-T`) or a dedicated new `V15*` leaf plus its `-T`; if a dedicated leaf is created rather than folding into `V15a`, use the literal `<new>` placeholder for its ID until the implementer allocates a real one per the plan's leaf-ID scheme.

The assertions must pin the codes' behavioural edge cases: arity is checked **before** per-argument type (`invocation.md` §Argument arity); `invoke-arity-too-many` fires even when the callee is **not** statically resolvable, while `too-few` falls back to a runtime AJV `InvokeInfraError{validation}` when not statically resolvable; `invoke-return-type-mismatch` accepts compatibility not equality (`T_calleeReturn ⊑ Schema`, narrower-under-wider); `callee-has-errors` has the error-for-`tools:` / warning-for-`invoke()` severity split; and `invoke-non-loom-extension` also covers `tools:` `.loom` entries.

**Coverage-matrix row.** In `coverage-matrix.md` §"Code-keyed obligation areas (no numbered REQ-IDs)", add a `| invocation.md ... (un-anchored; GOV-22 residue) | <closing leaf> |` row enumerating the six codes (or the §-scope that owns them), mirroring the existing `drain-state-contract.md` / `active-invocation-registry.md` rows. Set the closing leaf to whatever the assertion step produced (`V15a` or the new leaf); the citation must match the leaf actually carrying the assertions, since a stale citation reds the gate for the wrong reason.

## Relationships

- T18 "`implementation-notes.md` (IMPL) is unmapped in the coverage matrix, leaving its static-resolution obligations unverified" — decision-overlap (both add code-keyed rows that name `V15a` and bind static-resolution / `loom/load/callee-has-errors` coverage; the closing-leaf assignment chosen here constrains that finding's `V15a` citation)
- T13 "V9h's two `pi-integration-contract` pages have no coverage-matrix closing rows" — same-cluster (independent spec pages, same code-keyed-row mechanism and H5a closing-gate footing)
