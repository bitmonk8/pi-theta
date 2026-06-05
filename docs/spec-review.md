# Triaged Spec Review - spec.md

_Generated: 2026-06-05T11:52:38Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T83) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 1 blocker, 15 high, 53 medium retained; ~139 low discarded; ~0 low merged into medium; ~122 nit dropped; 0 false dropped. Source: 344 deduplicated findings across 9 shards + global lenses; 68 retained after triage. Foundational governance/traceability findings (T75–T83) and the standalone blocker (T74) sit at the bottom for first addressing._

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
# T09 - Session-context truncation relies on an unstated `.messages` ordering

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The binder's session-context truncation walk (`#session-context-truncation-bind_context-session`) consumes the array returned by `buildSessionContext(...).messages` and selects turns by walking from one end, but the spec does not state which end of that array is newest. If the assumed ordering does not hold, the walk includes the wrong turns silently, with no type or SDK-surface signal.

## Solution approach

State the `.messages` ordering the truncation walk relies on, or cross-reference the `#messages-chronological-order-presupposition` pin in `host-interfaces-core.md` that already fixes the oldest-to-newest ordering for `SessionContext.messages`. If Pi guarantees no ordering, impose a deterministic sort before the walk.

## Solution constraints

- None.

## Relationships

None.
# T10 - Hot-reload system note ships a `/reload` command the shard never establishes

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The hot-reload `loom-system-note` template (binder-model-and-context.md `#binder-model-hot-reload`) ships the literal `/reload` command and assumes it exists and re-runs discovery to retry previously-failed loads. Other spec pages instead name the loom recovery path `_loom-reload` (frontmatter-fields-b-and-templates.md and tool-registration-lifetime.md, both citing "Extension entry point step 5"), and the Extension-entry-point watcher step registers a chokidar watcher and a closed-over dispatch handler but establishes no `/reload` or `_loom-reload` command. The two names are never reconciled, so an operator following the note cannot rely on the command the shard actually provides.

## Solution approach

Rename the recovery command to a single canonical form across the three surfaces — the hot-reload note template at `#binder-model-hot-reload`, the `_loom-reload` references in frontmatter-fields-b-and-templates.md and tool-registration-lifetime.md, and the Extension-entry-point watcher step — and clarify whether that command is the Pi-owned `/reload` (`ctx.reload()`, per host-prerequisites.md (c)) or a loom-established command, so the note's "run /reload to retry" semantics match what the named command actually does.

## Solution constraints

- Out of scope: the Pi-owned `/reload` / `ctx.reload()` references in the teardown, degraded-state, and capability-probe contexts (host-prerequisites.md (c), session-only-degraded-state.md, capability-probe.md), which name Pi's command in its own right and are not the recovery-note inconsistency.

## Relationships

None.
# T11 - `tools:` comma-form handling of `.loom` paths and `as` renames is undefined

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `YAML-shape` rule on `frontmatter/frontmatter-fields-b-and-templates.md` states the comma-separated short form of `tools:` is for plain-name entries and the YAML list form for entries that need an `as` rename, but it does not define what happens when a `.loom` path or an `as` clause appears inside the comma scalar. Two readings are possible — parse the comma scalar with the full per-entry grammar, or restrict it to plain Pi-tool names — and they produce divergent diagnostics and registration outcomes.

## Solution approach

Clarify the `YAML-shape` rule on `frontmatter/frontmatter-fields-b-and-templates.md` to state whether the comma scalar is parsed by the full per-entry grammar or restricted to plain Pi-tool names; if restricted, name the `loom/load/*` (or `loom/parse/*`) diagnostic that fires for a `.loom` path or `as` clause in the comma form.

## Solution constraints

- None.

## Relationships

None.
# T12 - `cross-format-collision` is a misnomer and DISC-4's heading understates its scope

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The diagnostic code `loom/load/cross-format-collision` names only the cross-format arm, but its registry trigger in `diagnostics/code-registry-load.md` fires the same code for two `.loom` files colliding at the same priority (the same-format arm). DISC-4's heading "Slash-name collisions at the same priority" likewise understates the rule's scope, since DISC-4 also covers the cross-priority `session_start` comparison against Pi-owned `.md` prompts, skills, and other extensions' commands. Both surfaces name a narrower scope than the collision rule actually has.

## Solution approach

Reconcile the `loom/load/cross-format-collision` code name with the rule's full scope (same-format and cross-format) — either rename to a scope-accurate name such as `loom/load/slash-name-collision`, or, given the breaking-change cost, clarify the registry trigger so the same-format arm is explicit in the code's name treatment. Rename DISC-4's heading in `discovery/discovery-sources.md` to a scope-accurate form such as "Slash-name collision rules".

## Solution constraints

- Renaming `loom/load/cross-format-collision` is a breaking change to the closed diagnostics contract per `diagnostics/diagnostic-shape.md` rules 2–3 (codes are stable identifiers); treat any rename as a spec-versioned breaking change, not an editorial wording fix.

## Relationships

None.
# T13 - Automatic context escalation carries an unresolved decision gate yet pins a normative MUST seam

**Kind:** scope
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The "Automatic context escalation" item under `surface-extensions-open-design` in `future-considerations/surface-extensions.md` carries an unresolved `*Decision required*` gate — whether escalation surfaces a user-visible turn or stays operator-only — yet its carrier already commits a normative seam: the re-entrancy invariant at `v1-seam-automatic-context-escalation` in `binder/binder-model-and-context.md`. A committed normative obligation thus exists for a feature whose shape is explicitly not yet settled.

## Solution approach

Either resolve the `*Decision required*` gate on the `surface-extensions-open-design` item so the seam's normative pin matches a settled feature shape, or move the item together with its `v1-seam-automatic-context-escalation` seam blockquote to a design-decision log, leaving a cross-reference on both pages.

## Solution constraints

- None.

## Relationships

None.
