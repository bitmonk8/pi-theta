# Triaged Plan Review — plan

_Generated: 2026-06-11T11:35:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T18) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 2 medium retained; 38 low discarded; 0 low findings merged into 0 medium findings; 13 NIT dropped; 0 false dropped._

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

