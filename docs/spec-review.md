# Triaged Spec Review - spec.md

_Generated: 2026-06-05T11:52:38Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T83) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 1 blocker, 15 high, 52 medium retained; ~139 low discarded; ~0 low merged into medium; ~122 nit dropped; 0 false dropped. Source: 344 deduplicated findings across 9 shards + global lenses; 66 retained after triage. Foundational governance/traceability findings (T75–T83) and the standalone blocker (T74) sit at the bottom for first addressing._

---

# T01 - README advertises an authored implementation plan that does not exist

**Kind:** doc-alignment
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The README `## Status` section calls the implementation plan "complete" and directs progress-tracking against `docs/plan.md`, which contains no authored leaves in any phase ("No leaves yet" under each of Horizontal phases, MVP phase, and Vertical slices). The companion `docs/plan_topics/coverage-matrix.md` is likewise empty. A reader is told to track progress against authored content that does not exist.

## Solution approach

Rewrite the README `## Status` wording so it distinguishes plan infrastructure being in place from leaves being authored incrementally, and does not imply authored plan content already exists.

## Solution constraints

- None.

## Relationships

- T02 "commitAddPaths omits root files the plan conventions mandate updating" — same-cluster (both are README/project-config alignment defects).
# T02 - commitAddPaths omits root files the plan conventions mandate updating

**Kind:** doc-alignment
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`conventions.md` mandates updating root-level `README.md`/`CHANGELOG.md`/`notes.md` per leaf, but `.pi/project-config.md` `commitAddPaths` covers only `docs/`, so those files are not auto-staged.

## Solution approach

Reconcile the two: either extend `commitAddPaths` in `.pi/project-config.md` to cover the root files, or amend `conventions.md` to state they are staged manually.

## Solution constraints

- None.

## Relationships

- T01 "README advertises an authored implementation plan that does not exist" — same-cluster.
# T03 - Glossary "schema slug" name enumeration cannot be complete

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The glossary "schema slug" entry enumerates the `<slug>`-using synthesised names as `__loom_respond_<slug>` and `__loom_callee_<slug>__<post-rename-name>`, while `schema-subset.md` step 5 ("Synthesised names" under "Canonical schema hash") enumerates `__inline_<slug>`, `__loom_respond_<slug>`, and `__loom_bind_<slug>`. Each list omits names the other carries, so neither enumeration is complete and a reader cannot trust either as the full set of slug-using synthesised names.

## Solution approach

Reconcile the glossary "schema slug" entry and `schema-subset.md` step 5 so the slug-using synthesised names agree, covering the full set `__inline_<slug>`, `__loom_respond_<slug>`, `__loom_callee_<slug>__<post-rename-name>`, and `__loom_bind_<slug>` — either by completing both enumerations or by having one delegate to the other as the single source of truth.

## Solution constraints

- None.

## Relationships

None.
# T04 - Glossary "type sink" defined query-only but used for array element-type inference

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The glossary "type sink" entry defines the term as an enclosing AST position whose declared type supplies the schema for a *query expression* during the outward type-inference walk. But `grammar.md`'s "array<T> literal type-sink rule" and `expressions.md` array construction use "type sink" for array element-type inference. A reader following the glossary anchor from the array-literal usage finds a definition scoped only to queries.

## Solution approach

Broaden the glossary "type sink" entry so its definition covers any enclosing AST position supplying a type to its operand, including array element-type inference, rather than query schema alone.

## Solution constraints

None.

## Relationships

None.
# T05 - Glossary "query-terminating" parks always-log membership owned elsewhere

**Kind:** placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The glossary `query-terminating` entry (anchor `id="query-terminating"`) states normative always-log membership — enumerating which `Err`-class carriers do and do not emit a `loom-system-note` at a discard site — but that enumeration is owned by `runtime-event-channel.md`. The glossary's own `always-log set` entry already delegates membership to that page, and the glossary preamble fixes each entry as a descriptive reminder where the canonical page wins on disagreement. Restating the normative membership in `query-terminating` duplicates it against its canonical home and invites drift.

## Solution approach

Demote the per-carrier discard-emission enumeration in the glossary `query-terminating` entry to a descriptive reminder, delegating to `runtime-event-channel.md` for the normative membership, matching the delegation the `always-log set` glossary entry already uses.

## Solution constraints

None.

## Relationships

None.
# T06 - `.warp` import resolution failure has no diagnostic code and no resolver failure contract

**Kind:** error-model, implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`.warp` import resolution failure (unresolvable / non-existent / non-relative) has no named diagnostic code and no row in the `loom/load/*` registry, while `imports.md`'s `Resolver` seam `resolve(spec, fromFile): string` has no failure-signaling contract despite the same paragraph requiring non-relative specs to "fail this resolver" and surface "through the same load-time diagnostic channel". The two gaps are one defect: there is no defined path from a resolver failure to a surfaced diagnostic.

## Solution approach

Specify `resolve`'s failure path (throw / sentinel / Result) and name a concrete diagnostic (e.g. `loom/load/unresolvable-warp-path`) with severity and message covering all three sub-cases; add the corresponding row to the `loom/load/*` registry and state that the importing file is not registered.

## Solution constraints

- Coining the diagnostic code adds a defining-obligation site: under GOV-22 mint a co-located REQ-ID anchor under the page's registered prefix in the same commit (no new prefix required).

## Relationships

None.
# T07 - Three subtype check sites name no diagnostic codes

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`type-system.md`'s `id="type-compatibility"` section declares the RHS of a typed `let`, a plain (non-`invoke`) function-argument slot, and ternary branches as `T₁ ⊑ T₂` check sites, but names no diagnostic code for any of the three. The codes that section enumerates (`loom/parse/invoke-arg-type-mismatch`, `loom/parse/array-element-type-mismatch`, `loom/parse/match-arm-type-mismatch`) are specific to the invoke / array / match sites, so an author hitting a compatibility failure at one of the three unnamed sites cannot determine which code fires.

## Solution approach

In `type-system.md`'s `id="type-compatibility"` section, name the exact `loom/parse/*` diagnostic code emitted at the let-RHS, plain function-argument, and ternary-branch sites. Cite the existing registry code in `diagnostics/code-registry-parse.md` where one already covers a site, and coin a new registry row there where none does.

## Solution constraints

- If the edit adds a new defining-obligation site on `type-system.md` that carries no co-located REQ-ID anchor, coin a `TYPE-N` anchor in the same commit per GOV-22.

## Relationships

None.
# T08 - npmCommand-resolved npm root presupposes a subprocess seam absent from the PIC inventory

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`discovery/package-and-settings.md` §"Package discovery" root #4 says that when `npmCommand` is configured the extension uses the global root reported by that command instead of the literal `~/.pi/agent/npm/` path. Reporting a command's resolved root presupposes a subprocess-execution capability, but the injected-seam inventory in `pi-integration-contract/host-interfaces-services.md` (`FileSystem`, `Clock`, `TokenEstimator`, `SchemaValidator`, `Checkpoint`) has no such seam and no test fake for it, so the resolution path is neither owned nor conformance-testable.

## Solution approach

Either add the injected seam the extension uses to run `npmCommand` to the PIC DI-seam inventory in `host-interfaces-services.md` alongside the existing seams, with its test fake, or clarify root #4 in `package-and-settings.md` that Pi resolves `npmCommand` and the extension reads the already-resolved root, removing the subprocess presupposition.

## Solution constraints

- If the seam direction is taken, the new PIC seam is a defining-obligation site and MUST coin a `PIC-N` REQ-ID anchor per GOV-22 under the page's registered `PIC` prefix.

## Relationships

None.
