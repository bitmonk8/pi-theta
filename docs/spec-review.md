# Triaged Spec Review - spec.md

_Generated: 2026-06-05T11:52:38Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T83) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 1 blocker, 18 high, 60 medium retained; ~139 low discarded; ~0 low merged into medium; ~122 nit dropped; 0 false dropped. Source: 344 deduplicated findings across 9 shards + global lenses; 79 retained after triage. Foundational governance/traceability findings (T75–T83) and the standalone blocker (T74) sit at the bottom for first addressing._

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
# T14 - `ok`-envelope validate-vs-fill ordering contradicts two sibling sections

**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `ok`-envelope bullet in the "Binder envelope" list of `binder-bypass-and-envelope.md` specifies AJV-validate-then-fill, while `defaulting-system-note-echo.md` (the `post-default-merge-ajv-validation` site) and the relaxed-copy paragraph of the same envelope file specify fill-then-validate. The validate-first reading misclassifies omitted-but-defaulted fields into the no-retry AJV-on-`args` failure class.

## Solution approach

Rewrite the `ok`-envelope bullet in the "Binder envelope" list of `binder-bypass-and-envelope.md` to the fill-then-validate ordering used by the `post-default-merge-ajv-validation` site in `defaulting-system-note-echo.md`.

## Solution constraints

- None.

## Relationships

None.
# T15 - Esc-cancellation correctness assumes the abort flips within a single macrotask

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`cancellation.md`'s Granularity loop-iteration checkpoint yields exactly one macrotask turn before reading `loomAbort.signal.aborted`, which is correct only if Pi flips that signal within a single macrotask — i.e. the abort runs synchronously inside one Pi-dispatched event handler. That single-macrotask delivery assumption is never recorded as a loom-side presupposition alongside the five already enumerated in the `pi-slash-handler-promise-lifecycle-presupposition` consumption-posture list. If a future Pi deferred the flip across multiple macrotasks, an Esc during a compute-bound loop could be missed at the next iteration without surfacing against any named presupposition.

## Solution approach

Add the single-macrotask abort-flip as a further loom-side presupposition in the consumption-posture list at `pi-slash-handler-promise-lifecycle-presupposition`, and add a forward-link to it from `cancellation.md`'s Granularity loop-iteration checkpoint paragraph and the `loop-iter` description at the `checkpoint-seam`. Add a matching audit step to the Pi version bump procedure (`pi-version-bump-procedure`) so the presupposition is re-checked against each candidate Pi minor.

## Solution constraints

- Record as a loom-side consumption-posture presupposition only — MUST NOT author a normative MUST obligating Pi's macrotask scheduling or event-delivery timing (no Pi MUST in loom-side voice).

## Relationships

- T36 "PIC-9 says the runtime both discards and traps the `abort()` promise" — same-cluster (cancellation lifecycle).
# T16 - `cause: "validation"` means opposite directions on two error types

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

In `errors-and-results/queryerror-variants.md`, the `cause: "validation"` member names opposite failure directions across two `QueryError` variants: on `CodeToolError` it is an input-side (pre-execution) failure — arguments failed input-schema validation — while on `InvokeInfraError` it is an output-side (post-execution) failure — a typed invoke's return value failed AJV validation. The direction difference is not called out, so the same `cause` value reads as the same concept on both variants.

## Solution approach

Rename the `InvokeInfraError.cause` member `"validation"` to `"return_validation"` in `errors-and-results/queryerror-variants.md`'s `#invoke-variants` schema, and update its consumers — the ceiling tables in `hard-ceilings/ceilings-3-and-4.md` and `schema-subset.md`, and `invocation.md`'s Failures section.

## Solution constraints

- The rename targets only the `InvokeInfraError.cause` member; `CodeToolError.cause: "validation"` and the `ValidationError` wire `kind: "validation"` discriminator stay unchanged.

## Relationships

None.
# T17 - `argument-hint` field contract is defined once and duplicated word-for-word, missing from the field TOC

**Kind:** cruft, placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `argument-hint` field's contract — that it is binder grounding only and is not surfaced in Pi's slash-command autocomplete because `RegisteredCommand` has no `argumentHint` slot for extension-registered commands — is restated in near-duplicate prose across `slash-invocation.md`, `pi-integration.md`, and the `argument-hint` field-contract row and surrounding prose in `frontmatter/frontmatter-fields-a.md`. The duplicated copies can drift independently, and no single site is established as the owning definition.

## Solution approach

Establish the `argument-hint` field-contract row in `frontmatter/frontmatter-fields-a.md` as the single owning definition of the field's contract, and rewrite the duplicated explanatory prose in `slash-invocation.md` and `pi-integration.md` as forward-links to it.

## Solution constraints

- None.

## Relationships

None.
# T18 - `?` applied to a non-`Result` operand has no diagnostic or disposition

**Kind:** completeness
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`?` applied to a non-`Result` operand (`let x = 5?`) inside a Result-returning scope has no diagnostic, no parse/runtime disposition, and no postfix-`?` grammar production. The `loom/parse/question-outside-result-fn` diagnostic covers only the enclosing scope's return type, not the operand type.

## Solution approach

Clarify the `?` operator section in `errors-and-results/error-model.md` to state the operand-type precondition and its disposition, and register the corresponding diagnostic in `diagnostics/code-registry-parse.md`. Add the postfix-`?` production to `grammar.md`.

## Solution constraints

- A new diagnostic introduces a defining obligation site, so coin its REQ-ID anchor in the same commit per GOV-22.

## Relationships

- T58 "`?` operator gate uses an undefined `convertible` relation" — same-cluster (`?`-operator semantics).
# T19 - Binder relies on three unpinned `complete()` behaviours

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The binder/driven-turn path relies on three unpinned `complete()` / session behaviours: `complete()`'s internal retry/backoff for inter-attempt timing; `complete()` honouring `options.signal` for cancellation; and the driven turn's messages being committed before `waitForIdle()` resolves for prompt-mode error/Ok extraction. None is recorded as a loom-side presupposition or carries an editorial-review item; the existing `#complete-forced-tool-presupposition` enumerates only two other `complete()` properties, and the slash-handler lifecycle presupposition guarantees only eventual `agent_end`.

## Solution approach

Record each of the three reliances as a loom-side consumption-posture presupposition in the style of the existing `#complete-forced-tool-presupposition` and `#pi-slash-handler-promise-lifecycle-presupposition` paragraphs. Add a corresponding item to the *Editorial-review checklist for unpinned host presuppositions* in `version-bump-step2.md` for each.

## Solution constraints

- None.

## Relationships

- T63 "Turn-lifecycle subscription surface and `pi.on` are never pinned" — same-cluster (pi-ai/pi-coding-agent consumption presuppositions).
# T20 - registration-steps step 1 contradicts itself on whether `pi.looms` is read

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`registration-steps.md` step 1 says the walk reads "every installed package's `pi.looms` entry" yet later states "the `pi` manifest namespace does not enumerate `pi.looms`" — read as a self-contradiction. The two clauses describe different actors (the loom extension's own package-root walk versus Pi's `resources_discover` manifest namespace) but the prose does not distinguish them.

## Solution approach

Clarify `registration-steps.md` step 1's `pi` manifest-namespace clause to separate Pi's resource-discovery namespace (which does not enumerate `pi.looms`) from the loom extension's own walk of package roots (which reads the loom-owned `pi.looms` key directly).

## Solution constraints

- None.

## Relationships

None.
# T21 - A throw from a `pi.on(...)` subscription call has no granularity rule

**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `**Extension-bootstrap SDK failures.**` paragraph in `extension-bootstrap-and-per-loom.md` declares a throw/rejection from any registration call in steps 1–5 fatal "at the granularity of the failing surface", but enumerates granularity bullets only for the three `pi.register*` surfaces (`pi.registerMessageRenderer`, `pi.registerCommand`, `pi.registerFlag`). A throw/rejection from a `pi.on(...)` subscription call (the `resources_discover`/`session_start`/`session_shutdown` subscriptions in steps 1/3/4) is therefore covered by the preamble but has no bullet, leaving a load-bearing failure with undefined disposition.

## Solution approach

Add a `pi.on(...)` subscription-failure bullet to the per-call-type granularity rule in the `**Extension-bootstrap SDK failures.**` paragraph of `extension-bootstrap-and-per-loom.md`, fixing the failure disposition (whole-extension fatal mirrors the step-1 `pi.registerFlag` rule, since the subscribed handlers are extension-scoped) and emitting `loom/load/extension-bootstrap-failed` with a `details.capability` value identifying the `pi.on` surface and the subscribed event name, consistent with the sibling bullets.

## Solution constraints

- None.

## Relationships

- T63 "Turn-lifecycle subscription surface and `pi.on` are never pinned" — must-follow (the `pi.on` surface must be pinned before its failure granularity can be specified).
# T22 - `pi.registerFlag`/`pi.getFlag` are pinned to nothing and `getFlag('loom')`'s absent return is unstated

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

`pi.registerFlag` and `pi.getFlag` are named only in prose as factory-time host-binding calls; they are pinned to no declaration file, are not among the seven capabilities enumerated at `#sdk-capability-inventory` (PIC-15), are not in the Step-0(c) probed-member list, and carry no `SDK_SURFACE_INVENTORY` entry. Separately, `getFlag('loom')`'s return type and its absent-flag (unset) return value are unstated, though step 1's discovery walk and every `resources_discover` re-walk split on it via `pi.getFlag('loom')`.

## Solution approach

Clarify `pi.registerFlag`/`pi.getFlag`'s declaration-file pin against a cited SDK declaration and anchor, alongside their status relative to the seven-capability enumeration and the Step-0 capability probe at `#sdk-capability-inventory`. Clarify `getFlag('loom')`'s return type and absent-flag (unset) return value at the `registration-steps.md` step-1 consumption site. Clarify whether the two surfaces take `SDK_SURFACE_INVENTORY` entries or a declared exemption.

## Solution constraints

- None.

## Relationships

- T63 "Turn-lifecycle subscription surface and `pi.on` are never pinned" — same-cluster (SDK surface pinning).
# T23 - Step (d) `details.step` overloads `peer-dep-out-of-range`, making the failing arm undeterminable

**Kind:** implementability, naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The **Self-failure** paragraph of `capability-probe.md` (`#entry-capability-probe`) enumerates `details.step` with the value `"peer-dep-out-of-range"` to name a step-(d) throw, but step (d) covers two kinds — `peer-dep-out-of-range` and `peer-dep-malformed-version`. A `probe-failed` throw during step (d) therefore cannot identify which arm failed, and the same string is overloaded as both a `kind` value and a `details.step` label.

## Solution approach

In the **Self-failure** paragraph's `details.step` enumeration, rename the step-(d) label to a neutral form (e.g. `"peer-dep-version"`), or extend the `details.step` value space with `"peer-dep-malformed-version"` so the failing arm is determinable. Sweep the dependent `details.package` sentence that keys on the old label.

## Solution constraints

- None.

## Relationships

None.
# T24 - `typed-query-unsupported-provider` "listing positions" has no pinned format

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The "Provider compatibility for typed queries" paragraph in `pi-integration-contract/conversation-drive.md` says the `loom/load/typed-query-unsupported-provider` warning emitter names the model "and listing the typed-query expression positions". Neither the diagnostic's row in `diagnostics/code-registry-load.md` nor any envelope pins a format or `details` field for those positions — the row's message template carries only `<provider>` and `<model>`. A test cannot assert on the positions output because no format is specified.

## Solution approach

Either pin a `details` positions payload for `loom/load/typed-query-unsupported-provider` on its `diagnostics/code-registry-load.md` row (following the `details: { kind, ... }` convention sibling `loom/load/*` rows use) and align the "Provider compatibility for typed queries" prose in `conversation-drive.md` to it, or delete the "listing the typed-query expression positions" clause from that prose.

## Solution constraints

- None.

## Relationships

None.
# T25 - `pi.registerTool` post-startup support is cited in prose with no version pin

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The `session-shutdown-semantics.md` step-5 hot-reload registry swap depends on `pi.registerTool` working after startup, asserted in prose as "documented as supported after startup". Unlike PIC's other unpinned host behaviours, the claim is not framed as a presupposition, cites no `#pi-sdk-pin`, and carries no re-validation hook into the version-bump procedure — so a Pi minor that drops post-startup registration support would surface no build-time or editorial signal.

## Solution approach

Rewrite the post-startup-support claim in `session-shutdown-semantics.md` step 5 as an unpinned host presupposition taken on a best-effort basis against `#pi-sdk-pin`, matching the presupposition framing already used in PIC's **Host prerequisites**. Add a forward-link to the *Editorial-review checklist for unpinned host presuppositions* under `#pi-version-bump-procedure` so the claim is re-audited on each Pi minor bump.

## Solution constraints

- Out of scope: the placement/extraction of the step-5 hot-reload content owned by T30; edit the post-startup-support claim's framing in place.

## Relationships

None.
# T26 - `systemPromptOverride` channel status is "not recommended" but never made normative

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Rule 4 of the subagent-spawn block in `provider-error-mapping.md` (and the `#subagent-spawn-satellite-types` pin paragraph) describes the `DefaultResourceLoaderOptions.systemPromptOverride` construction channel as "not the recommended construction" / "not-recommended construction channel" without a normative modal. A reader cannot tell whether the channel is conformant-but-discouraged (MAY) or effectively forbidden (MUST NOT).

## Solution approach

Clarify the normative status of `DefaultResourceLoaderOptions.systemPromptOverride` in rule 4 of the subagent-spawn block — state directly whether it is MAY-but-discouraged or MUST NOT — and reconcile the `#subagent-spawn-satellite-types` paragraph's "not-recommended construction channel" wording with that choice.

## Solution constraints

- If the chosen wording strengthens the site's normative-modal content (e.g. a MUST NOT obligation), the edit must satisfy GOV-22 progressive coinage of a co-located `PIC-N` anchor.

## Relationships

None.
# T27 - Built-in Pi tool name → `ToolDefinition` resolution names no concrete API

**Kind:** clarity, implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

In `provider-error-mapping.md`'s `**Conversation drive — subagent mode.**` section, rule 1 of the four spawn rules describes built-in Pi tool name → `ToolDefinition` resolution only as "resolved by name from the model registry / extension API". It names no concrete SDK surface, is not enumerated in `SDK_SURFACE_INVENTORY`, and the `/` admits two readings (the model registry versus the extension API).

## Solution approach

In that rule, replace the `model registry / extension API` disjunction with the single concrete built-in-tool resolution surface and add its `SDK_SURFACE_INVENTORY` entry. Reconcile the wording with frontmatter's `**Resolution snapshot.**`.

## Solution constraints

- None.

## Relationships

None.
# T28 - `createAgentSession` spawn options elide required fields and use an undeclared `model`

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The "Conversation drive — subagent mode" spawn block in `provider-error-mapping.md` shows the `createAgentSession(...)` call eliding fields behind a `// ...` comment and passing a `model` binding whose source is not stated at the call site. The accompanying "Four rules govern the spawn call" enumeration constrains only three of the populated `CreateAgentSessionOptions` fields (`customTools`, `tools`, `resourceLoader`), leaving `model` and `sessionManager` ungoverned. An implementer cannot determine the complete required field set from the block, nor where the `model` value is resolved.

## Solution approach

Add a forward-link from the spawn block to `subagent.md#subagent-pre-spawn-model-guard` so the `model` binding's source is grounded at the call site. Clarify the spawn block so the full required `CreateAgentSessionOptions` field set is named — either enumerated or stated as defaulted / pass-through — rather than elided behind `// ...`, and so the governing rules account for `model` and `sessionManager`.

## Solution constraints

- Out of scope: re-authoring the `model` resolution rule, which is owned by `subagent.md#subagent-pre-spawn-model-guard`.

## Relationships

None.
# T29 - `invocationId` is a canonical UUID with no injectable id-source seam

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `invocationId` field of `ActiveInvocationRegistry` (#active-invocation-registry) is specified as a per-invocation canonical-UUID minted at registry-insertion time, but the spec names no injectable id-source seam for producing it — unlike wall-clock time (`Clock`), schema validation (`SchemaValidator`), and file watching (`FileWatcher`), each of which sits behind a DI seam. A direct global UUID source therefore conflicts with the no-globals DI rule the same section relies on for the `shutdownReason` channel. Tests asserting on the insertion-ordered `<list>` rendering of `loom/runtime/reload-teardown-timeout`, which embeds these ids, have no deterministic way to control the minted values.

## Solution approach

Either add an injectable id-source seam on `host-interfaces-services.md` modelled on the `Clock` seam (#clock--fakeclock-interface) and route the `invocationId` minting at #active-invocation-registry through it, or narrow the no-globals rule to carve out `invocationId` minting. State the test-determinism path for whichever direction is chosen.

## Solution constraints

- If the chosen direction adds a new defining-obligation site on `host-interfaces-services.md`, it must carry a co-located REQ-ID anchor per GOV-22.

## Relationships

None.
# T30 - `session-shutdown-semantics.md` sub-step 5 expands into the full hot-reload lifecycle

**Kind:** placement, scope
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

In `session-shutdown-semantics.md`, sub-step 5 (the *Factory-ordering pin*) begins as a session-shutdown ordering obligation but then expands — without a heading break — into the complete chokidar hot-reload lifecycle: the 250 ms debounce, build-aside-then-publish swap, `pi.registerTool` re-registration, rollback on a failed staged rebuild, the **Structural changes** note template, the **In-flight invocation rule**, and settings-file routing. None of that is session-shutdown behaviour, so the watcher/hot-reload contract is documented under a heading that does not name it.

## Solution approach

Split the watcher/hot-reload content out of sub-step 5 in `session-shutdown-semantics.md` into a dedicated topic page or into `registration-steps.md`; keep the factory-ordering pin sentence in `session-shutdown-semantics.md` with a forward-link to the relocated content.

## Solution constraints

- None.

## Relationships

None.
# T31 - HTTP-200 provider error envelopes that are not the overflow code map to no `QueryError`

**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

A provider HTTP-200 response carrying a body-envelope error that is not the recognised overflow code (`context_length_exceeded`) matches no row in the overflow table under `id="provider-error-mapping"` and falls outside that section's catch-all, which routes only "every other 4xx/5xx response and every network-level failure" to `TransportError`. The `QueryError` mapping for such a response is therefore undefined. The `id="transport-error-retryable"` population rule — keyed on network / 5xx / 429 / non-429-4xx classes — likewise has no class covering an HTTP-200 envelope error.

## Solution approach

Extend the `id="provider-error-mapping"` catch-all so an HTTP-200 response carrying a non-overflow body-envelope error maps to a defined `QueryError` variant, and add the corresponding class to the `id="transport-error-retryable"` population rule so its `retryable` disposition is pinned for that case.

## Solution constraints

- If extending the catch-all strengthens the normative-modal content of a defining-obligation site carrying no co-located REQ-ID anchor, coin a `PIC-N` anchor in the same commit per GOV-22.

## Relationships

- T74 "tokens_used/tokens_limit extraction is underspecified" — same-cluster (`provider-error-mapping.md`).
# T32 - PIC-9 relies on `dispose()` being safe mid-`abort()` with no ordering guarantee

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

PIC-9 (`id="pic-9"` in `pi-integration-contract/subagent.md`) assumes `AgentSession.dispose()` is safe to call while a prior `AgentSession.abort()` is still unsettled, and that `abort()`'s underlying idle-wait completes through the subsequent `dispose()` within the `SHUTDOWN_AWAIT_CAP_MS` budget. The `AgentSession` type surface guarantees no ordering or lifetime relationship between an unsettled `abort()` and a later `dispose()`, so the consumption assumption is unstated.

## Solution approach

Clarify PIC-9 to state the relied-upon consumption assumption — `dispose()` safe mid-`abort()`, and release observed complete via `disposeBarrier` — or require the listener to await `abort()` before disposal.

## Solution constraints

- None.

## Relationships

- T36 "PIC-9 says the runtime both discards and traps the `abort()` promise" — same-cluster (PIC-9 abort lifecycle).
# T33 - Group B routing self-contradicts, risking double-emission

**Kind:** clarity, implementability
**Importance:** medium
**Score:** 35
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

`runtime-event-channel.md`'s **Runtime event channel** Group B bullet says the four `loom/host/session-shutdown-*` codes route through the `details: { diagnostics: [...] }` shape while, in the same sentence, listing them — plus `loom/runtime/reload-teardown-timeout` — as `console.error`-routed teardown-handler exclusions. The authoritative emission rules (Diagnostics' **Persistent diagnostics (default).** paragraph and Pi Integration Contract's `#diagnostic-emission-isolation`) emit these five codes only via `console.error`, bypassing the `loom-system-note` channel. A conformant implementation reading the contradictory Group B prose could emit the same diagnostic twice — once through `{diagnostics}`, once through `console.error`.

## Solution approach

Rewrite the Group B bullet in `runtime-event-channel.md`'s **Runtime event channel** section so the five `console.error`-routed teardown-handler codes are stated as excluded from the `details: { diagnostics: [...] }` channel rather than routed through it, scoping the `{diagnostics}` shape to `loom/runtime/*` panics. Align the bullet with the authoritative `console.error` routing owned by Diagnostics' **Persistent diagnostics (default).** paragraph and `#diagnostic-emission-isolation`.

## Solution constraints

- The `console.error`-only routing of these five codes is authoritative as stated in Diagnostics' **Persistent diagnostics (default).** paragraph and `#diagnostic-emission-isolation`; resolve the contradiction by editing the Group B bullet, not those owners.

## Relationships

None.
# T34 - PIC-17 active-set swap/snapshot throws have no failure-mode rule

**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

PIC-17 (`id="pic-17"` in `pi-integration-contract/tool-registration-lifetime.md`) step-1 snapshot (`pi.getActiveTools()`) and step-2 swap (`pi.setActiveTools(...)`) throws have no failure-mode rule, though PIC-8 (`id="pic-8"`) authors a full restore-failure protocol for the symmetric step-4 restore call. A throw from either step is undefined behaviour in the current contract.

## Solution approach

Add a failure-mode rule to the PIC-17 / PIC-8 region of `tool-registration-lifetime.md` covering throws from the step-1 `pi.getActiveTools()` snapshot and the step-2 `pi.setActiveTools(...)` swap, paralleling PIC-8's restore-failure protocol. State whether the query proceeds and how each failure surfaces (the `loom/runtime/internal-error` runtime-defect channel is the candidate).

## Solution constraints

- None.

## Relationships

None.
# T35 - Two throwing-`readDrainState` MUSTs have no acceptance criteria

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`pi-integration-contract/drain-state-contract.md`'s *Read-failure fallback* (anchor `read-failure-fallback`) pins two MUSTs on a throwing `readDrainState`: the slash-command call site MUST short-circuit on arm (c) returning the degraded-arm note, and the `session_shutdown` handler-entry step (I) call site MUST treat the read as the steady-state tuple `(drained: false, tag: undefined)` and run the full teardown. Neither MUST has a corresponding fixture in the shard's `## Acceptance criteria` enumeration (`session-only-degraded-state.md`), so the observable outcomes — system note returned, loom not dispatched, which diagnostics fire, post-handler tuple, and the accepted duplicate-emission on re-entry — are untested.

## Solution approach

Add acceptance-criteria fixtures for both throwing-`readDrainState` paths to the shard's `## Acceptance criteria` enumeration in `session-only-degraded-state.md`, asserting the observable outcomes the *Read-failure fallback* (anchor `read-failure-fallback`) already pins — the slash-command site's arm-(c) degraded note with no dispatch, and the handler-entry site's full-teardown traversal with its accepted re-entry duplicate emission.

## Solution constraints

- None.

## Relationships

None.
# T36 - PIC-9 says the runtime both discards and traps the `abort()` promise

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

PIC-9 (`id="pic-9"` in `pi-integration-contract/subagent.md`) says the runtime "discards the returned promise" from `AgentSession.abort()`, yet the same paragraph also says that if "the discarded promise rejects, the runtime traps the error and routes it through `loom/runtime/internal-error`". This contradicts Cancellation's "swallowing-handler attachment on every abandonable Promise" rule, which lists the `AgentSession.abort()` Promise among abandonable Promises whose late rejection is silently absorbed and explicitly forbids promotion to `loom/runtime/internal-error` (it would re-introduce the second-event surface that rule suppresses). The two pages prescribe incompatible dispositions for the same late rejection.

## Solution approach

Rewrite PIC-9's `AgentSession.abort()` paragraph at `id="pic-9"` so the discarded-promise late-rejection disposition agrees with Cancellation's swallowing-handler rule, keeping the uncontested synchronous-throw route to `loom/runtime/internal-error` intact. Add a forward-link from that paragraph to the swallowing-handler rule in `cancellation.md` so the late-rejection disposition is owned in one place.

## Solution constraints

- Out of scope: Cancellation's "swallowing-handler attachment on every abandonable Promise" rule in `cancellation.md` — it owns the discarded-promise late-rejection disposition; reconcile by editing PIC-9 to defer to it.

## Relationships

- T15 "Esc-cancellation correctness assumes the abort flips within a single macrotask" — same-cluster.
- T32 "PIC-9 relies on `dispose()` being safe mid-`abort()`" — same-cluster.
# T37 - `String(event.reason)` coercion-throw is not covered by the `<unreadable>` fallback

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

PIC's **Unknown-reason rule** (`#unknown-reason-rule`) asserts `String(event.reason)` "tolerates symbols, `undefined`, numbers, booleans, and objects without itself throwing" and scopes the `"<unreadable>"` sentinel only to a throwing property access (the `event.reason` read). Coercion of an object whose `toString`/`Symbol.toPrimitive` throws makes `String(...)` itself throw — an unmodelled escape from the handler. The sibling `String(error)` coercion in the same rule's `"throw:<String(error)>"` discriminator is explicitly wrapped in `try`/`catch` with a `"throw:<unreadable>"` fallback, so the coercion-throw case is defended there but not for `event.reason`.

## Solution approach

Clarify the Unknown-reason rule's `String(event.reason)` coercion clause (`#unknown-reason-rule`) to define behaviour when the coercion itself throws, extending the `"<unreadable>"` sentinel to that path on the model of the sibling `String(error)` `try`/`catch` defence in the same rule; or cite the clause that already owns the coercion-throw fallback.

## Solution constraints

- None.

## Relationships

None.
# T38 - `non-canonical-extension` dedup keys on `realpath` but claims same-inode siblings

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `loom/load/non-canonical-extension` dedup rule is described as keying on `realpath` while claiming it suppresses warnings for "same-inode" siblings, but `realpath` canonicalises paths, not inodes. Two hardlinks to one file resolve to distinct paths and would not dedup under `realpath`, so the stated mechanism and the same-inode claim disagree. The mismatch appears in both the `**Non-canonical extension case.**` paragraph of `discovery/discovery-sources.md` and the diagnostic's row in `diagnostics/code-registry-load.md`.

## Solution approach

Rewrite the dedup-key description so the mechanism and the framing agree: state the key the loader actually uses — canonical-path equality via `realpath`, or device+inode via `stat` — and drop the conflicting term. Apply the same correction to the `loom/load/non-canonical-extension` row in `diagnostics/code-registry-load.md`.

## Solution constraints

None.

## Relationships

None.
# T39 - `E/W` severity gloss has two incompatible meanings

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `## Code registry` intro in `code-registry-parse.md` glosses severity `E/W` as "decided per-source by the table in Discovery — Failure modes." But `loom/load/callee-has-errors` decides its `E/W` severity per surface (`tools:` `.loom` entries vs `invoke(...)` literals) per Invocation — Static resolution, not per-source via the Discovery failure-modes table. The single gloss therefore carries two incompatible meanings of `E/W`.

## Solution approach

Rewrite the `E/W` gloss in `code-registry-parse.md`'s `## Code registry` intro so it covers both severity-determination mechanisms — the per-source Discovery-failure-modes case and the per-surface `loom/load/callee-has-errors` case — rather than naming only the Discovery table, deferring the per-code determination to each row's own prose.

## Solution constraints

- None.

## Relationships

None.
# T40 - "exactly six panic sources" references a tag/column that does not exist

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`code-registry-runtime.md`'s `### loom/runtime/*` section opens "loom 1.0.0 has exactly six **panic sources** (the rows below tagged as panics)", but the table has no panic tag or column, and its *Spec rule* column points panic and non-panic rows alike at `errors-and-results.md`. A reader cannot identify which six of the table's rows are the panic sources from the parenthetical alone.

## Solution approach

Clarify the `### loom/runtime/*` intro's `(the rows below tagged as panics)` parenthetical so the six panic-source rows are identifiable — either tag those rows in the table, or rewrite the parenthetical to enumerate the six codes or forward-link error-model.md's `#runtime-panics` closed list.

## Solution constraints

- None.

## Relationships

None.

---
# T41 - Diagnostic registry pointers cite the wrong file and overclaim completeness

**Kind:** consistency, naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The split diagnostic registry has inconsistent cross-references. In `diagnostic-shape.md` the `loom/runtime/*` namespace bullet links its `loom/runtime/* registry section` to `code-registry-load.md#loom-runtime-namespace`, an empty stub anchor, rather than to `code-registry-runtime.md` where the runtime table actually lives and where `error-model.md` correctly points. Separately, `code-registry-parse.md`'s intro claims its table "enumerates every diagnostic the V1 spec defines" while it holds only `loom/parse/*` rows; the registry is split across the parse, load, runtime, and host pages, and inbound links treat `#code-registry` as the whole registry.

## Solution approach

In `diagnostic-shape.md`'s `loom/runtime/*` namespace bullet, re-point the `loom/runtime/* registry section` link to `code-registry-runtime.md`, and reconcile the now-orphaned `#loom-runtime-namespace` stub anchor in `code-registry-load.md`. Correct the `code-registry-parse.md` intro's completeness claim so it describes the registry as spanning the parse, load, runtime, and host pages rather than enumerating every diagnostic.

## Solution constraints

- None.

## Relationships

- T70 "§5 test vector contradicts the rule it illustrates" — same-cluster (diagnostics registry correctness).
# T42 — Placeholder-rendering closure omits live placeholders it is asserted to enforce

**Kind:** implementability
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The placeholder-rendering Closure on `placeholder-rendering-a.md` asserts a build-time-enforced closed surface, but its scope sentence enumerates only the `code-registry-parse.md` rows, and several live placeholders fall outside its eight categories. The `loom/host/session-shutdown-teardown-step-failed` Message template uses `<step>` (1|4|5) and `<call>` (a closed call-site-label set), neither of which appears in any category. Separately, §8 lists `<observed>` but defines its rendering only for `loom/load/host-incompatible`; the `loom/load/frontmatter-value-out-of-range` and `loom/load/settings-value-out-of-range` Messages also carry `<observed>`, where it is a parsed scalar (number/string/boolean/null) rather than a host-supplied error string. The "enforced at build time" claim and the actual placeholder set cannot both hold while these placeholders are unenumerated or unrendered.

## Solution approach

Admit `<step>` and `<call>` into the Closure's category enumeration on `placeholder-rendering-a.md`. Define `<observed>`'s rendering for the parsed-scalar out-of-range codes (`loom/load/frontmatter-value-out-of-range`, `loom/load/settings-value-out-of-range`) across the number/string/boolean/null kinds, distinct from §8's host-derived first-line-truncation rule. Reconcile the Closure's scope sentence so the `loom/host/*` and `loom/load/*` registry rows fall within the closed surface it asserts build-time enforcement over.

## Solution constraints

- None.

## Relationships

- T43 "registration-cache-collision Trigger references a byte placeholder absent from the Message" — same-cluster (placeholder/Message closure).
- T44 "Serialised `content` related-site line format is undefined" — same-cluster.
# T43 - `registration-cache-collision` Trigger references a byte placeholder absent from the Message

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `loom/runtime/registration-cache-collision` row in `diagnostics/code-registry-runtime.md` has a Trigger that says the lowered-schema canonical-form bytes are "truncated for the message", but the row's Message template (`tool-registration cache collision on slug <slug>: <name1> vs <name2>`) carries no byte placeholder. Rule 4 in `diagnostics/diagnostic-shape.md` makes the Message column normative and byte-exact, so the Trigger describes a message field that the normative template does not render.

## Solution approach

Reconcile the Trigger against the Message template for that row: either delete the "truncated for the message" clause from the Trigger, or add a byte placeholder to the Message template and define its rendering rule under the placeholder-rendering taxonomy in `diagnostics/placeholder-rendering-a.md`.

## Solution constraints

- None.

## Relationships

- T42 "Placeholder-rendering closure omits live placeholders" — same-cluster.
# T44 - Serialised `content` related-site line format is undefined

**Kind:** implementability, prescription, testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The `**Serialised content format.**` block in `diagnostics/diagnostic-shape.md` pins the main line (`"<file>:<line>:<col>: <code>: <message>"`) and the optional hint line, but says only that "Related sites are appended as additional indented lines" — leaving the related-site line's indent, field order, and whether a code prefix appears undefined. It also does not state whether the related-site `<line>:<col>` come from `range.start` or `range.end`. The `content` string is observable and asserted in tests, so the unspecified format is implementable only by guessing.

## Solution approach

Extend the `**Serialised content format.**` block in `diagnostics/diagnostic-shape.md` to pin the related-site line template — its indent, field order, and whether a code prefix appears — and to state which `range` endpoint supplies the related-site `<line>:<col>`.

## Solution constraints

- None.

## Relationships

- T42 "Placeholder-rendering closure omits live placeholders" — same-cluster.
# T45 - No behaviour defined when `ctx.ui.notify` (transient-toast surface) itself throws

**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The **Transient toasts (auxiliary)** surface in `diagnostics/diagnostic-shape.md` is the only sink for the failures it enumerates (the chokidar watcher throwing, an uncovered settings I/O exception, an internal extension-invariant violation) and is invoked from watcher callbacks and invariant-check sites. No behaviour is defined for the case where `ctx.ui.notify` itself throws, even though `host-interfaces-core.md` documents `ui.notify` as synchronous and able to throw.

## Solution approach

Clarify the **Transient toasts (auxiliary)** paragraph in `diagnostics/diagnostic-shape.md` to state that a synchronous throw from `ctx.ui.notify` on this surface MUST be swallowed as a last resort, mirroring the `console.error`-throw swallow rule anchored at `#diagnostic-emission-isolation`.

## Solution constraints

- None.

## Relationships

None.
# T46 - A Pi-side rename/drop of `SessionShutdownEvent` is matched against an open, unversioned TS-code family

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Step 1 of `#pi-version-bump-procedure` (in `version-bump-intro.md`) assumes a Pi-side rename/drop of `SessionShutdownEvent` on the package-root re-export surface always surfaces as one of a "module-import-resolution family" of TS codes (`TS2305` / `TS2307` / `TS2614` / `TS2724` "and any other TS code in the same module-import-resolution family"). The family is enumerated open-endedly and is never closed or tied to the pinned TypeScript version, so the routing contract rests on an unbounded set.

## Solution approach

In `#pi-version-bump-procedure` step 1, narrow the open "and any other TS code in the same module-import-resolution family" phrasing to a closed enumeration grounded against the pinned TypeScript version, or clarify that the listed codes are the closed family at the loom 1.0 Pi-SDK pin.

## Solution constraints

None.

## Relationships

- T71 "Brand-string mechanism relies on unverified `tsc` verbatim output" — same-cluster (TS-version-dependent bump gates).
# T47 - Re-validating provider-owned behaviour has no enumerated data source or owner

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The bump-procedure editorial-checklist items (i) (`#bump-checklist-provider-overflow-wording`) and (u) (`#bump-checklist-complete-forced-tool`) both direct the contributor to re-run provider fixtures against each supported provider's "current" error-body / forced-tool behaviour, but neither names what supplies that current provider behaviour — live provider credentials versus a maintained fixture corpus — nor who keeps that source current. Item (i) additionally has no mechanical backstop: it is SHOULD-level only with no CI gate, so a silent provider rewording can downgrade a real overflow to `TransportError` undetected.

## Solution approach

Clarify items (i) (`#bump-checklist-provider-overflow-wording`) and (u) (`#bump-checklist-complete-forced-tool`) on `version-bump-step2.md` to name what supplies the "current" provider behaviour the re-validation runs against, and name the process or owner that keeps that source current.

## Solution constraints

- None.

## Relationships

None.
# T48 - Step 5 inbound-reference-sweep clause is ungrammatical and ambiguous about when the MUST fires

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Step 5's *Inbound-reference sweep for session-only-reason subsets* paragraph in `version-bump-triggers.md` reconciles each grep hit with the clause "a hit that does not corresponds to a new inbound runtime reference whose enumeration MUST be added …". The clause is ungrammatical ("does not corresponds") and structurally ambiguous about whether the MUST fires on a does-not-match condition or unconditionally.

## Solution approach

Rewrite the reconciliation clause in step 5's inbound-reference-sweep paragraph so the does-not-match antecedent and the MUST consequent read unambiguously — e.g. "a hit that does not match the existing inline-triplet site corresponds to a new inbound runtime reference, whose enumeration MUST be added …".

## Solution constraints

None.

## Relationships

- T53 "Step 5 inbound-reference-sweep reconciliation has only two arms" — same-cluster (step 5 sweep).
# T49 - Step 7 attributes `strictCapable` to two different packages

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Step 7 (`**Update the binder strict-capability probe.**` in `version-bump-triggers.md`) keys its rename change-condition on a candidate `@earendil-works/pi-coding-agent` minor introducing the indicator under a different name, but keys its closing no-op condition on whether `@earendil-works/pi-ai` exposes the field under the probed name `strictCapable`. The `Model<Api>.strictCapable` indicator therefore reads as owned by two different packages within one step. The model-registry surface (`#model-registry-pin`) declares `Model` and its `Api` type parameter in `@earendil-works/pi-ai`, so the two sentences disagree on which package the probe actually re-pins against.

## Solution approach

Rewrite Step 7 so both the rename change-condition and the closing no-op condition name the same owning package for `Model<Api>.strictCapable`, consistent with the model-registry surface (`#model-registry-pin`), which declares `Model<Api>` in `@earendil-works/pi-ai`.

## Solution constraints

- None.

## Relationships

None.
# T50 - Editorial-review preamble leaves the MUST-audited cardinality of (a)–(e) undetermined

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The "Editorial-review checklist for unpinned host presuppositions" preamble in `version-bump-step2.md` reads "the contributor MUST audit … items (a)–(e) below whose detection routes to editorial review under this procedure". The restrictive "whose …" relative clause makes the MUST-audited cardinality undetermined: a reader cannot tell whether the MUST applies to all five items (the clause being descriptive of (a)–(e) as a set) or only to the subset of (a)–(e) that route to editorial review (the clause selecting a proper subset).

## Solution approach

Rewrite the preamble's `(a)–(e) … whose detection routes to editorial review` clause to state unambiguously whether all of (a)–(e) are MUST-audited; if so, use a non-restrictive form so the relative clause describes the set rather than selecting a subset.

## Solution constraints

None.

## Relationships

None.
# T51 - Step 3 `engines.node` test describes mutually exclusive right-hand operands

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Step 3 "Re-confirm the `engines.node` floor" in `version-bump-step2b.md` describes its build-time literal-read test as asserting cross-package equality between loom's `package.json#engines.node` literal and `@earendil-works/pi-coding-agent`'s `engines.node` floor — yet the same sentence also says the test sources the upstream value from the in-repo `pi-engines-node` row of `SDK_SURFACE_INVENTORY`. These are mutually exclusive right-hand operands: a live installed-dependency read versus an in-repo maintained literal. If the operand is the in-repo inventory literal, the paragraph's "fails red when the upstream floor moves" / "no contributor-side manual compare is required" guarantee does not hold, because two in-repo literals cannot detect upstream drift on their own.

## Solution approach

Clarify Step 3's `engines.node` literal-read test description in `version-bump-step2b.md` so the cross-package equality names a single unambiguous source for each operand, and reconcile that description with the same paragraph's "fails red when the upstream floor moves" and "no manual compare required" guarantee.

## Solution constraints

- None.

## Relationships

None.
# T52 - "the four spec sentences cited above" does not resolve to four enumerable sentences

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The closing paragraph of `version-bump-triggers.md` lists, among a bump commit's outputs, "the four spec sentences cited above". The page's `spec.md` citations do not resolve to an enumerable set of four sentences — the distinct `spec.md` sentences cited on the page number fewer than four, and the other "above" citations target non-`spec.md` pages. A contributor reconciling the bump commit cannot determine which sentences the count refers to.

## Solution approach

Rewrite the "the four spec sentences cited above" phrase in the closing paragraph of `version-bump-triggers.md` as an explicit enumeration of the specific `spec.md` sentences a bump commit must touch, so the count is derivable from the list rather than asserted as a bare number.

## Solution constraints

- None.

## Relationships

None.

---
# T53 - Step 5 inbound-reference-sweep reconciliation has only two arms, contradicting step 1

**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The step 5 inbound-reference-sweep reconciliation in the Pi version bump procedure enumerates only two arms: a hit at the existing inline-triplet site is a no-op, and any other hit is "a new inbound runtime reference" requiring enumeration. The widened grep deliberately spans `docs/`, so it surfaces the benign `docs/spec.md` SM-2 illustrative-restatement hit that step 1's carve-out classifies as a transiently-stale illustrative restatement (no runtime-correctness impact). The two-arm reconciliation forces that hit into the "new runtime reference" arm, contradicting step 1's classification.

## Solution approach

Add a third reconciliation arm in step 5's inbound-reference sweep that classifies illustrative-restatement hits (such as the `docs/spec.md` SM-2 listing) as no-ops, cross-referencing step 1's `#sm-2-closed-shutdown-reason-set` carve-out.

## Solution constraints

- None.

## Relationships

- T48 "Step 5 inbound-reference-sweep clause is ungrammatical" — same-cluster.
# T54 - §7 GOV-7/GOV-8 co-edit obligation is stated only in step 1, not step 5

**Kind:** scope
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The Pi version-bump procedure's §7 `<reason>`-row GOV-7/GOV-8 co-edit obligation — that a `SessionShutdownEvent['reason']` widening/narrowing MUST update the §7 closed-enum row in the same commit as the snapshot constant — is stated only in step 1 of `#pi-version-bump-procedure`, not in step 5, which is the step that enumerates that commit's co-edits. No cross-reference connects the two. A contributor working from step 5's co-edit list can therefore miss the obligation.

## Solution approach

Move the normative §7 `<reason>`-row GOV-7/GOV-8 co-edit obligation from step 1 into step 5's snapshot-constant co-edit enumeration in `version-bump-triggers.md`. Add a forward-link from step 1 of `#pi-version-bump-procedure` to step 5 so the routing remains discoverable from where the obligation is now stated.

## Solution constraints

- Out of scope: the mechanical-gate / build-time cross-check that enforces the §7 `<reason>`-row update — owned by T55.

## Relationships

- T55 "No mechanical gate fails when the §7 `<reason>` row is not updated" — co-resolve (both concern the §7 snapshot-constant co-edit and its enforcement).
# T55 - No mechanical gate fails when the §7 `<reason>` row is not updated with the snapshot constant

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The §7 placeholder-rendering closed-enum `<reason>` value table restates the closed shutdown-reason set `{quit, reload, new, resume, fork}`, duplicating the `SessionShutdownEvent['reason']` snapshot constant's `literals` field. On a Pi-version bump that widens or narrows the SDK union, the bidirectional type-equality assertion (`loom/typecheck/session-shutdown-reason-snapshot`) and step 2(a)'s literal-array consistency check both gate the snapshot constant's `literals` field, but no mechanical gate fires when the §7 `<reason>` row is left unedited. The §7 row can therefore drift out of sync with the snapshot constant undetected.

## Solution approach

Add a build-time cross-check of the §7 closed-enum `<reason>` value table in `placeholder-rendering-b.md` against the `SessionShutdownEvent['reason']` snapshot constant's `literals` field that version-bump step 5 trigger (ii) already gates, or demote the §7-row co-update to a SHOULD-level convention.

## Solution constraints

- None.

## Relationships

- T54 "§7 GOV-7/GOV-8 co-edit obligation is stated only in step 1" — co-resolve.
# T56 - Provider/library behaviour is asserted as fact without citation or version pin

**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

Several load-bearing constraints assert external provider/library behaviour as present-tense fact with no citation or version pin: the `depth ≤ 5` nesting ceiling in `schema-subset.md` hard-codes OpenAI's current cap; the JSON-Schema subset is asserted as the intersection of OpenAI/Anthropic strict modes (and Draft 2020-12 "required by Anthropic"); and the typed-query forced-respond terminator depends on pi-ai `complete()` forced tool-choice being honoured by every supported provider adapter. Each silently couples the spec to a live external surface that can drift without any anchored basis or version pin.

## Solution approach

Clarify the `depth ≤ 5` ceiling and the OpenAI/Anthropic-intersection and Draft 2020-12 claims in `schema-subset.md` as either provider-cited against a dated snapshot or as a spec-chosen conservative ceiling decoupled from the live provider caps. For the typed-query forced-respond dependency, add a forward-link to the existing `#complete-forced-tool-presupposition` and to the Pi-SDK pin `#pi-sdk-pin` rather than restating provider behaviour bare. Where the assertion remains version-coupled, follow the presupposition-plus-re-validation-gate pattern already used at `provider-error-mapping.md`'s `#provider-overflow-wording-presupposition`.

## Solution constraints

- Any new defining-obligation site added (e.g. a host-prerequisite or re-validation obligation) MUST carry GOV-22 progressive-coinage under the page's registered prefix.

## Relationships

- T19 "Binder relies on three unpinned `complete()` behaviours" — same-cluster (external-behaviour presuppositions).
# T57 - Single-type alias grammar cannot parse the forms `schemas.md` relies on

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

The `UnionRhs ::= Type ("|" Type)+` production in grammar.md's `## schema X by <field>` section requires ≥2 types, so the alias/union `SchemaShape` `=` form cannot parse single-type aliases (`schema X = X`, `schema X = Y`). But schemas.md's `loom/parse/type-alias-cycle` prose relies on exactly those forms — both the direct `schema X = X` and transitive `schema X = Y; schema Y = X` cases. The grammar and the normative cycle-detection prose ship contradictory contracts.

## Solution approach

Either add a single-type alias alternative to grammar.md's `SchemaShape` `=` form (and pin its lowering), or declare single-type aliases illegal and rewrite schemas.md's `loom/parse/type-alias-cycle` examples to a parseable form.

## Solution constraints

- None.

## Relationships

None.
# T58 - `?` operator gate uses an undefined "convertible" relation

**Kind:** clarity
**Importance:** high
**Score:** 100
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

The `?`-operator gate in `errors-and-results/error-model.md` says the enclosing scope's return type must be `Result<_, QueryError>` "(or convertible)", but the type model defines no "convertible" relation — `type-system.md` defines only compatibility (`⊑`). The `loom/parse/question-outside-result-fn` gate therefore rests on an undefined relation that implementers will resolve inconsistently.

## Solution approach

In `errors-and-results/error-model.md`, rewrite the `?`-operator gate's enclosing-return-type requirement to use a defined relation: reference type compatibility (`⊑`) per `type-system.md#type-compatibility`, or state the enclosing scope implicitly returns `Result<T, QueryError>` (the relation the same section's later implicit-return sentence already names). Reconcile the gate text with that implicit-return sentence so a single relation governs the `loom/parse/question-outside-result-fn` diagnostic.

## Solution constraints

- None.

## Relationships

- T18 "`?` applied to a non-`Result` operand has no diagnostic" — same-cluster (`?`-operator semantics).
# T59 - Two normative surfaces disagree on the trailing-continuation operator set

**Kind:** clarity
**Importance:** high
**Score:** 100
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

`lexical.md`'s "Statement terminators." paragraph lists the trailing-continuation trigger as "binary or unary" operator, while the normative `grammar.md` newline-continuation table (and `expressions.md` "Newline continuation") say "binary or ternary". Two normative surfaces disagree on an observable parse behaviour.

## Solution approach

Reconcile `lexical.md`'s "Statement terminators." continuation-trigger list with the `grammar.md#newline-continuation` table by changing its trailing-operator phrase from "binary or unary" to "binary or ternary"; keep `grammar.md` as the single source.

## Solution constraints

- None.

## Relationships

None.
# T60 - Write-back preservation is a Pi-directed, loom-unobservable normative MUST NOT in the wrong place

**Kind:** placement, testability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The write-back preservation presupposition (anchor `id="settings-write-back-preservation-presupposition"` in `discovery/package-and-settings.md`) constrains Pi's serializer and is structurally a host-behaviour presupposition, yet it lives in Discovery rather than alongside the other Pi presuppositions in `host-prerequisites.md`. It is expressed as a normative `MUST NOT` directed at Pi's serializer even though the rule itself acknowledges it is unobservable from the loom-side SDK surface, so no loom-side test can assert it.

## Solution approach

Move the write-back preservation presupposition from `discovery/package-and-settings.md` to `host-prerequisites.md` alongside the `model-registry-population-presupposition` and `degraded-state-host-prerequisites` entries, and demote its `MUST NOT` to the non-normative presupposition framing those sibling entries use. Leave a forward-link at the original Discovery site to the relocated anchor.

## Solution constraints

- The relocated site MUST stay reachable from the inbound cross-reference at `version-bump-step2.md#bump-checklist-settings-write-back-preservation` — preserve the `#settings-write-back-preservation-presupposition` fragment or re-point that consumer.

## Relationships

None.
# T61 - `label` derivation rule and its own example disagree on capitalisation

**Kind:** clarity
**Importance:** high
**Score:** 100
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

In `extension-bootstrap-and-per-loom.md` (Per-loom registration → Field derivations), the `label` derivation rule says the basename is taken "with hyphens preserved and the leading character capitalised", but the accompanying example `code-review.loom → "Code-Review"` capitalises every hyphen-separated segment, not just the leading character. The two specify divergent observable `label` values for any multi-segment basename.

## Solution approach

Reconcile the `label` derivation rule and its examples in `extension-bootstrap-and-per-loom.md` so they yield one observable output — either rewrite the rule text to state per-segment capitalisation, or correct the example to match leading-character-only capitalisation.

## Solution constraints

- None.

## Relationships

None.
# T62 - `ExtensionCommandContext.waitForIdle` cannot be the factory-time `typeof` probe the loop mandates

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Step 0 (c) of `capability-probe.md` mandates a factory-time `typeof <path> === "function"` check over ten named members, and lists `ExtensionCommandContext.waitForIdle` (capability 2) among them. But `waitForIdle` is an interface method with no runtime value at factory time and is deferred to slash-handler invocation, so a factory-time `typeof` probe of it is not well-defined. Its presence in the list contradicts the "ten" member count and the per-capability arithmetic the same paragraph asserts.

## Solution approach

In step 0 (c)'s factory-probable member list (`capability-probe.md`), either remove `ExtensionCommandContext.waitForIdle` from the `typeof`-probed loop and reconcile the member count and per-capability arithmetic, or name the concrete factory-time runtime path that makes the `typeof` check well-defined. Reconcile the resulting count against the surrounding arithmetic prose.

## Solution constraints

- None.

## Relationships

- T63 "Turn-lifecycle subscription surface and `pi.on` are never pinned" — same-cluster (capability-probe / SDK surface).
# T63 - Turn-lifecycle subscription surface and `pi.on` are never pinned

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The subscription surface loom depends on is unpinned in two related ways. The mechanism for subscribing to the five turn-lifecycle events (`tool_call`/`tool_result`/`message_update`/`turn_end`/`agent_end`) in completion mode is never pinned — global `pi.on` is banned for completion and `AgentSession.subscribe` (declared at `dist/core/agent-session.d.ts`) is subagent-only, leaving no named completion-mode surface. Separately, `pi.on`'s signature, its closed event-name union, and its declaration file are never pinned, and `pi.subscribe`'s existence is left conditional ("if the SDK exposes one").

## Solution approach

Clarify the completion-mode subscription surface for the five turn-lifecycle events — method, payload type, per-session scoping, and registration site — in `conversation-drive.md`, given that `pi.on` is banned for completion and `AgentSession.subscribe` is subagent-only. Clarify `pi.on`'s signature, its closed event-name union, and its declaration file. Resolve `pi.subscribe`'s conditional existence to present or absent.

## Solution constraints

- Any new or strengthened defining-obligation site this pinning adds must carry GOV-22 REQ-ID coinage in the same commit.

## Relationships

- T19 "Binder relies on three unpinned `complete()` behaviours" — same-cluster.
- T21 "A throw from a `pi.on(...)` subscription call has no granularity rule" — must-precede (the `pi.on` surface must be pinned before its failure granularity can be specified).
- T22 "`pi.registerFlag`/`pi.getFlag` are pinned to nothing" — same-cluster.
- T62 "`waitForIdle` cannot be the factory-time probe" — same-cluster.
# T64 - `#checkpoint-seam` is a bare stub in the wrong file; inbound links land blank

**Kind:** placement
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`host-interfaces-core.md` ends with a bare `<a id="checkpoint-seam"></a>` stub carrying no content. The PIC-10 `Checkpoint` seam material the anchor names lives in `host-interfaces-services.md` (under `id="pic-10"`). The five inbound links to `host-interfaces-core.md#checkpoint-seam` from `cancellation.md`, `patch-skew-degradation.md`, and `session-shutdown-semantics.md` therefore land on a blank anchor in the wrong file.

## Solution approach

Co-locate the `checkpoint-seam` anchor with the PIC-10 `Checkpoint` seam content in `host-interfaces-services.md`, repointing the inbound links; or move the PIC-10 content to the existing stub in `host-interfaces-core.md`.

## Solution constraints

- None.

## Relationships

None.
# T65 - Normative ValidationIssue/Err shapes live on a protocol page, absent from the errors cluster

**Kind:** placement, scope
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `pic-typed-query-noncompliance` section in `conversation-drive.md` defines normative error shapes: the synthesised `ValidationIssue` literals for the plain-text and wrong-tool branches, the terminal `Err(QueryError { kind: "validation", cause: "schema_validation", ... })` shape, and the `raw_response` null-vs-body disambiguation. These shapes have no representation in the errors cluster (`queryerror-variants.md`), where the `QueryError`/`ValidationError` schema and the `err-14` `ValidationIssue` ordering rule already live. The normative error-shape definitions are therefore split from the cluster that owns error shapes.

## Solution approach

Move the normative `ValidationIssue`/`Err` shape definitions from `conversation-drive.md`'s `pic-typed-query-noncompliance` section into `queryerror-variants.md` alongside the existing `err-14` ValidationError content. Rewrite the PIC site as a behavioural description of the loom 1.0 diagnostic limitation with a forward-link to the relocated shapes.

## Solution constraints

- Relocating the normative shapes adds a defining obligation site to `queryerror-variants.md`; that site must carry a co-located REQ-ID anchor per GOV-22, and the retained PIC behavioural description must reference it by a `#err-n` cross-link per GOV-9.

## Relationships

None.
# T66 - `SessionManager.inMemory(cwd)` transcript-privacy guarantee is unverified

**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Capability item 3 (`#sdk-cap-subagent-isolated-session`) attributes a transcript-privacy guarantee to `SessionManager.inMemory(cwd)` — the spawned subagent session's transcript being private and discarded when the loom returns. Only the factory's signature (`static inMemory(cwd?: string): SessionManager`) is re-validated by the build-time SDK surface-inventory assertion; no behavioural check confirms the in-memory session actually does not persist the transcript.

## Solution approach

At capability item 3 (`#sdk-cap-subagent-isolated-session`), clarify whether the no-persistence behaviour is verified or rests on the documented `SessionManager.inMemory` semantics with only the factory signature re-validated. If a behavioural check is intended, add it to the bump-procedure satellite re-validation step (`#bump-checklist-subagent-spawn-satellite-types`).

## Solution constraints

- None.

## Relationships

None.
# T67 - Per-`event.reason` session lifecycle is asserted as fact with no probe or cited contract

**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The per-`event.reason` teardown-vs-session-swap partition — `{"quit","reload"}` tear down the extension runtime, `{"new","resume","fork"}` swap only the user session — is asserted as fact at `session-only-degraded-state.md`'s `#session-only-reason-degraded-state`, where the prose itself notes the distinction "no single SDK identifier pins." No Pi contract is cited and no verification step backs the partition. The `#partial-append-contract` (error-model.md) and the degraded-state branch both depend on the partition holding.

## Solution approach

Ground the teardown-vs-session-swap partition at `session-only-degraded-state.md`'s `#session-only-reason-degraded-state` — either by citing the Pi contract that defines it, or by routing it through the presupposition-plus-editorial-review model the degraded-state branch already uses at `host-prerequisites.md`'s `#degraded-state-host-prerequisites`, gated by the Pi version bump procedure at `#pi-version-bump-procedure`. Add a forward-link from `error-model.md`'s `#partial-append-contract` to whichever grounding lands so its dependence is traceable.

## Solution constraints

- The partition MUST NOT be pinned by a parallel `SessionShutdownEvent['reason']` snapshot entry — the inline triplet at `#session-only-reason-degraded-state` is the normative source of truth per its "Inline triplet is normative" clause.

## Relationships

None.
# T68 - Two audit-cluster files have H1 headings inverted relative to their content and anchors

**Kind:** naming
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`audit-recognised-shapes.md`'s H1 reads "Audit recognised shapes" but its body is the audit target categories (it carries anchor `audit-target-surface-categories` and the *Target surface categories.* content). `audit-target-categories.md`'s H1 reads "Audit target categories" but its body is the recognised import/access shapes (it carries anchor `audit-recognised-shapes` and the *Recognised import/access shapes.* content). The two files' H1 headings are inverted relative to their anchors and content.

## Solution approach

Rename each file's H1 to match the anchor and subject it actually contains, swapping the two headings.

## Solution constraints

- Out of scope: renaming either file or changing any anchor `id` (GOV-23 anchor stability); only the H1 heading text changes.

## Relationships

- T69 "`provider-error-mapping.md` H1 names only the first third of its content" — same-cluster (audit/PIC heading-vs-content mismatches).
# T69 - `provider-error-mapping.md` H1 names only the first third of its content

**Kind:** naming, placement, scope
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`provider-error-mapping.md`'s H1 "Provider error mapping" names only the error-mapping table (anchor `provider-error-mapping`). The same file also owns the provider seed-field mapping (anchor `provider-seed-field-mapping`) and the full "Conversation drive — subagent mode" spawn protocol — the `createAgentSession` code block, its four governing rules, and the `subagent-spawn-satellite-types` pins. The heading therefore describes roughly the first third of the file's content.

## Solution approach

Move the "Conversation drive — subagent mode" spawn content — the `createAgentSession` code block, its four governing rules, and the `subagent-spawn-satellite-types` pins — from `provider-error-mapping.md` into `subagent.md`. Rename `provider-error-mapping.md`'s H1 to name both the provider error mapping and the provider seed-field mapping content that remains.

## Solution constraints

- None.

## Relationships

- T68 "Two audit-cluster files have H1 headings inverted" — same-cluster.
# T70 - §5 test vector contradicts the rule it illustrates

**Kind:** clarity
**Importance:** high
**Score:** 100
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

In `diagnostics/placeholder-rendering-b.md` §5 "Source-derived placeholders", the `**Test vectors.**` bullet for an unknown frontmatter field renders `unknown field 'wibble'`, dropping the word "frontmatter". The `loom/load/unknown-frontmatter-field` registry Message in `diagnostics/code-registry-load.md` is `unknown frontmatter field '<field>'`, so the illustrative vector contradicts the normative rule it is meant to demonstrate.

## Solution approach

Rewrite the §5 "Source-derived placeholders" unknown-frontmatter-field test-vector bullet so its rendered output reads `unknown frontmatter field 'wibble'`, matching the `loom/load/unknown-frontmatter-field` registry Message in `diagnostics/code-registry-load.md`.

## Solution constraints

- None.

## Relationships

- T41 "Diagnostic registry pointers cite the wrong file and overclaim completeness" — same-cluster.
# T71 - Brand-string mechanism relies on unverified `tsc` verbatim output

**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The build-time `SessionShutdownEvent['reason']` type-equality assertion gated by [Pi version bump procedure step 5](version-bump-triggers.md) relies on `tsc` surfacing the literal brand string `loom/typecheck/session-shutdown-reason-snapshot` verbatim and grep-ably in its type-mismatch diagnostic — the property step 1's brand-string carve-out, the step-5 trigger (ii) discriminator, and the patch-skew degradation gate all key on. No TypeScript version is named or pinned anywhere in the spec corpus, and the verbatim-brand surfacing behaviour is assumed rather than verified against any concrete `tsc` release. If a TypeScript version reshapes literal-type mismatch diagnostics so the brand no longer appears grep-ably, the gate silently fails to fire.

## Solution approach

Add a TypeScript toolchain version floor to the [host-prerequisites Pi SDK pin section](host-prerequisites.md#pi-sdk-pin), naming the `tsc` version against which the verbatim, grep-able brand-string surfacing was confirmed, and record that confirmation. Forward-link the brand-string-surfacing reliance in [version-bump step 5](version-bump-triggers.md) to that pin so the assumption is traceable to a verified `tsc` version.

## Solution constraints

None.

## Relationships

- T46 "`SessionShutdownEvent` rename matched against an open TS-code family" — same-cluster.
# T72 - `version-bump-triggers.md` H1 names only step 5's sub-trigger concept

**Kind:** naming
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`version-bump-triggers.md`'s H1 "Version bump triggers" names only step 5's sub-trigger concept, though the file holds steps 5, 6, and 7. The heading mis-scopes the page's contents.

## Solution approach

Rename the H1 so it names the file's full step span (steps 5, 6, and 7) rather than only step 5's sub-trigger concept — e.g. "Version bump procedure — steps 5, 6, and 7".

## Solution constraints

- None.

## Relationships

None.
# T73 - A normative MUST is buried inside a non-normative parenthetical

**Kind:** placement
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

In step 5 ("Update the capability-probe pinned constants.") of the Pi version bump procedure on `version-bump-triggers.md`, a normative obligation — that any future runtime-side reference shape reading or stamping a `SessionShutdownEvent['reason']` value MUST extend the sweep's second-stage anchor set in the same edit — is authored inside the parenthetical whose leading label declares its contents a `(non-normative recipe: …)`. A reader can take the MUST as advisory because its enclosing parenthetical is explicitly marked non-normative.

## Solution approach

Move the second-stage-anchor-set extension MUST out of the `(non-normative recipe: …)` parenthetical in step 5 into that step's normative body.

## Solution constraints

- None.

## Relationships

None.
# T74 - `tokens_used`/`tokens_limit` extraction from `error.message` is underspecified, diverging across conformant implementations

**Kind:** clarity, prescription, testability
**Importance:** blocker
**Score:** 200
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

In `provider-error-mapping.md`, the `anthropic-messages` and `openai-completions` overflow rows populate `ContextOverflowError.tokens_used`/`tokens_limit` "from `error.message` digits when present" without saying which numeric run maps to which field, and without a rule for the zero-, one-, or three-or-more-number cases. Two conformant implementations can therefore produce observably different values on the same user-facing error payload.

## Solution approach

Rewrite the `anthropic-messages` and `openai-completions` rows of the `#provider-error-mapping` table to pin a single deterministic extraction rule that maps specific numeric runs in `error.message` to `tokens_used` and `tokens_limit` and fixes the fallback to `null` for every count of numeric runs that does not satisfy the rule.

## Solution constraints

- None.

## Relationships

- T31 "HTTP-200 provider error envelopes map to no `QueryError`" — same-cluster (`provider-error-mapping.md` overflow/error mapping).
# T75 - "surface-set closure" is a key claim with no glossary entry

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`surface-set closure` is coined inline and used as a key claim on more than one spec page — `spec.md` Orientation/Prerequisites and the Pi Integration Contract *Inventory-closure audit* — but has no entry in `glossary.md`. The glossary's own intro requires an entry for any term the spec coins and reuses across pages.

## Solution approach

Add a `surface-set closure` entry to `glossary.md`, alphabetised among the existing entries, with a `See:` reference to its canonical owner — the *Inventory-closure audit* (`id="sdk-cap-inventory-closure-audit"`) in `pi-integration-contract/inventory-audit-intro.md`.

## Solution constraints

- None.

## Relationships

None.
# T76 - GOV-14's two SHOULD-NOTs bind reviewer behaviour and admit no mechanical witness

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

GOV-14 (anchor `gov-14` on `req-id-prefix-table-active-b.md`) is built from two SHOULD-NOT clauses that bind reviewer posture — what a review of the corpus SHOULD NOT cite (GOV-8 as a substitute for GOV-15) and SHOULD NOT re-raise (the absent automated equivalence gate). Reviewer PR-comment behaviour is not observable on the corpus or on implementation output, so no corpus-membership test or mechanical witness can produce a pass/fail verdict for the rule.

## Solution approach

Rewrite GOV-14's two SHOULD-NOT clauses as a non-normative editorial note, stripping the RFC-2119 modals so the site no longer asserts a testable obligation.

## Solution constraints

- If the rewrite leaves GOV-14 carrying no normative obligation, apply GOV-8 retirement (retire the anchor, append the registry row) rather than leaving an obligation-less REQ-ID anchor in place.

## Relationships

- T77 "GOV-12 bundles ≥3 independently-testable sub-obligations" — same-cluster (governance REQ-ID hygiene).
# T77 - GOV-12 bundles ≥3 independently-testable sub-obligations under one REQ-ID

**Kind:** scope
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

GOV-12 bundles at least three independently-testable sub-obligations under one REQ-ID anchor (`#gov-12`): the lock-step aggregator MUST, the integer-literal-preservation MUST, and the in-code-constant carve-out exemption. This is the same single-REQ-ID-bundles-many-clauses pattern that drove the GOV-21 retirement, so the per-leaf coverage matrix can cite nothing narrower than the whole of GOV-12.

## Solution approach

Split GOV-12 per GOV-8 *Split* into at least two successor REQ-IDs under the `GOV` prefix, one per independently-testable obligation, and retire the GOV-12 anchor.

## Solution constraints

- None.

## Relationships

- T76 "GOV-14's two SHOULD-NOTs bind reviewer behaviour" — same-cluster.
