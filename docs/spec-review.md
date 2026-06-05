# Triaged Spec Review - spec.md

_Generated: 2026-06-05T11:52:38Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T83) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 1 blocker, 15 high, 56 medium retained; ~139 low discarded; ~0 low merged into medium; ~122 nit dropped; 0 false dropped. Source: 344 deduplicated findings across 9 shards + global lenses; 71 retained after triage. Foundational governance/traceability findings (T75–T83) and the standalone blocker (T74) sit at the bottom for first addressing._

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
