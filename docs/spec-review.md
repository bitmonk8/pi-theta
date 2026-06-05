# Triaged Spec Review - spec

_Generated: 2026-06-05T00:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T22) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blockers, 0 high, 14 medium retained; 10 low discarded; 5 low findings merged into 2 medium findings; 12 nit dropped; 0 false dropped._

---

# T01 - Pre-evaluation failure list — stale count-pointer and non-contiguous REQ-ID numbering

**Kind:** clarity, consistency, naming, traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The eight-item pre-evaluation failure list under **Terminal outcomes** in `error-model.md` carries two surface defects in the same paragraph block. First, the closing lock-step co-edit sentence names a backtick literal `the seven below` as the count phrase to keep in sync, but the actual count phrase in the preceding paragraph is "the eight below" — a stale self-reference left over from before `err-16` was added, so the closed-count invariant is no longer mechanically grep-verifiable by a future editor. Second, the list enumerates eight items but assigns non-contiguous anchors `err-1`–`err-7` then `err-16`; `err-8`–`err-15` are live elsewhere (on this page and in `queryerror-variants.md`), and neither the intro ("the eight below") nor the recap ("the eight list items above") explains the discontinuity, so an auditor reading `err-*` anchors as a contiguous range silently misidentifies the pre-evaluation set.

## Solution approach

Rewrite the lock-step co-edit sentence's backtick literal `the seven below` to `the eight below` so it names the count phrase that actually exists in the preceding paragraph. Clarify the intro sentence ("…is the eight below…") and the recap ("Each of the eight list items above…") so the non-contiguous anchor set — `err-1`–`err-7` plus `err-16`, with `err-8`–`err-15` allocated to sibling obligations elsewhere — is auditable from the prose alone.

## Solution constraints

- Do not renumber the existing `err-1`–`err-16` anchors to a contiguous range; they are cited from sibling pages and renumbering would break those cross-references.

## Relationships

- T14 "Un-anchored normative obligations across `cancellation.md`" - same-cluster (REQ-ID anchor coherence; resolves independently).
# T02 - `.pi/project-config.md` live/retired GOV snapshot is stale post-GOV-21 split

**Kind:** doc-alignment-broad
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The *Spec rules* opening paragraph of `.pi/project-config.md` carries a
non-normative snapshot of the governed REQ-ID set reading "currently
GOV-1, GOV-3, GOV-5–GOV-9, GOV-12, GOV-14–GOV-24, with GOV-2/4/10/11/13
retired". That snapshot is stale: the *Retired REQ-IDs* sub-table in
`docs/spec_topics/governance/anchor-scheme-and-retired.md` records GOV-21
retired (split per GOV-8 into GOV-25 … GOV-29), and GOV-25 … GOV-29 are
now live and normative in `docs/spec_topics/governance/release-version-naming.md`.
The snapshot's `GOV-14–GOV-24` range still lists GOV-21 as live and omits
the five replacement IDs entirely. A contributor or fixer agent using
`project-config.md` as the entry point can cite a retired GOV-21 anchor,
miss that GOV-25 … GOV-29 are the dual-anchor-convention citation targets,
or under-allocate the next free GOV number.

## Solution approach

Rewrite the stale parenthetical in the `Spec rules` opening paragraph of
`.pi/project-config.md` so the live set reads GOV-1, GOV-3, GOV-5–GOV-9,
GOV-12, GOV-14–GOV-20, GOV-22–GOV-29 and the retired set reads
GOV-2/4/10/11/13/21, matching the *Retired REQ-IDs* sub-table in
`docs/spec_topics/governance/anchor-scheme-and-retired.md`.

## Solution constraints

- Out of scope: the parallel GOV summary in
  `docs/spec_topics/governance.md` — it is the authoritative side the
  snapshot defers to, and this finding does not touch it.
- Do not edit the *REQ-ID prefix table* enumeration (`CEIL`, `CIO`, `GOV`,
  `PIC`, …) later in the same paragraph — it is prefix-table membership,
  not REQ-ID number-set membership, and is governed separately.

## Relationships

None
# T03 - `InvokeInfraError.cause: "model_unresolved"` collides with the `loom/load/model-unresolved` namespace

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `InvokeInfraError.cause` enum arm `"model_unresolved"` collides at the name level with the unrelated load-time diagnostic `loom/load/model-unresolved` (the `model:`-resolution failure that fires in any mode at load time). The arm is produced only by the subagent pre-spawn model guard, whose diagnostic code carries the disambiguated form `loom/runtime/subagent-model-unresolved`, but the bare cause literal drops the `subagent` qualifier. An author reading a `match` arm on `InvokeInfraError.cause` has no name-level signal distinguishing this from the load-time concept, and the corpus convention (`loom/load/binder-model-unresolved` vs `loom/runtime/subagent-model-unresolved`) is to keep the two namespaces distinct via a qualifier.

## Solution approach

Rename the `cause` enum literal from `"model_unresolved"` to `"subagent_model_unresolved"` on all three surfaces that carry it: the `InvokeInfraError` `cause` enum in `errors-and-results/queryerror-variants.md`, the `Err(InvokeInfraError { ... cause: "model_unresolved", ... })` sentence under `subagent.md`'s `id="subagent-pre-spawn-model-guard"` paragraph, and the `loom/runtime/subagent-model-unresolved` row in `diagnostics/code-registry-runtime.md`. The new literal mirrors the diagnostic code's `subagent-model-unresolved` form folded to snake_case, matching the existing discriminator convention.

## Solution constraints

- Out of scope: the `loom/runtime/subagent-model-unresolved` diagnostic code string itself and its anchor — only the `cause` enum literal value changes, not the registry code.

## Relationships

None
# T04 - Factory-time `FileSystem.cwd() == project root` premise is unpinned

**Kind:** assumptions
**Importance:** medium
**Score:** 15
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The factory-time discovery scan resolves the project-local `.pi/looms/` directory and the project `.pi/settings.json` against the value `FileSystem.cwd()` returns at extension-factory construction. PIC-13 pins the production wiring as `process.cwd()` captured once at construction, and `Settings file reads` resolves project settings against the same seam, but none of the consuming sites pins what Pi guarantees about `process.cwd()` *at factory construction* — the load-bearing claim that the value Pi hands the factory equals the project root. The `resources_discover` path already prefers `event.cwd` so a per-session cwd change is honoured, but the factory-time scan feeding the first `session_start` registration pass has no such correction and no presupposition label. If Pi ever launches the factory with `cwd` set to something other than the project root, project-local looms and project settings resolve against the wrong directory until the first `resources_discover` arrives, with no build-time or load-time signal.

## Solution approach

Add a presupposition to PIC-13's `cwd()` bullet (anchor `pic-13` in `host-interfaces-services.md`), following the existing `<a id="...-presupposition"></a>` pattern used by sibling presupposition paragraphs on the page, naming the factory-time `cwd == project root` premise and citing the Pi-side launch contract loom relies on. Add a new lettered item to the *Editorial-review checklist for unpinned host presuppositions* in `version-bump-step2.md`, cross-linking the new anchor and stating a re-validation recipe against the candidate `@earendil-works/pi-coding-agent` minor.

## Solution constraints

- Both edits — the PIC-13 presupposition paragraph and the `version-bump-step2.md` checklist item — MUST land in the same commit, per the "MUST be added to this checklist in the same edit" rule on `version-bump-step2.md`.

## Relationships

- T05 "Cancellation forwarding — turn-lifecycle event delivery not in SDK capability inventory" - same-cluster (same host-behaviour assumptions section; same fix shape — add a named presupposition with bump-checklist coverage; resolves independently).
- T06 "Per-provider `complete()` forced-tool behaviour has no re-validation gate" - same-cluster (same section; an unpinned behavioural premise on Pi that wants a re-validation obligation added; resolves independently).
# T05 - Cancellation forwarding — turn-lifecycle event delivery not in SDK capability inventory

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The slash-command cancellation-forwarding path wires `loomAbort.abort()` from inside the runtime's `pi.on` handlers for five turn-lifecycle events (`tool_call`, `tool_result`, `message_update`, `turn_end`, `agent_end`). This path presupposes two unpinned Pi behaviours: that Pi delivers each of those five events to a subscribed extension during the active user turn for which `ctx.signal` was minted, and that `ctx.signal.aborted` read from inside each handler reflects the latest abort state. Neither obligation appears in the cancellation-propagation capability inventory entry (`sdk-cap-cancellation-propagation`, which covers only `AbortSignal` supply at the two entry points) nor in the unpinned-host-presupposition checklist in `version-bump-step2.md` — item (j) covers only the terminal `agent_end` turn-liveness presupposition, not the intermediate-event delivery surface this path consumes. If a Pi minor renames, removes, gates, or changes the per-handler `ctx.signal` semantics of any of those events, Esc-during-`@`-query silently becomes a no-op with no build-time SDK-surface assertion or load-time `loom/load/host-incompatible` signal.

## Solution approach

Record a loom-side presupposition naming the five turn-lifecycle events and their two consumption sub-obligations — Pi delivers each event to a subscribed extension during the active user turn, and `ctx.signal.aborted`/`.reason` read inside each handler reflects the latest abort state — at the `id="pi-slash-handler-promise-lifecycle-presupposition"` block in `host-interfaces-core.md`. Add a checklist item (next free letter) to the unpinned-host-presupposition checklist in `version-bump-step2.md`, following the established `<a id="bump-checklist-…">` pattern, cross-linking the new presupposition anchor and carrying a per-bump re-validation recipe.

## Solution constraints

- Out of scope: the Step 0 (c) factory-probable capability list in `capability-probe.md` — do not add a `pi.on` / event-delivery probe entry.
- The new checklist item MUST be added in the same edit as the presupposition it back-references, per the "added to this checklist in the same edit" obligation in `version-bump-step2.md`.

## Relationships

- T06 "Per-provider `complete()` forced-tool behaviour has no re-validation gate" - same-cluster (sibling finding; both ask for a behavioural Pi-host obligation recorded against a re-validation surface; different consuming surfaces; resolved independently).
- T04 "Factory-time `FileSystem.cwd() == project root` premise is unpinned" - same-cluster (sibling finding; same fix shape, different surface).
- T18 "Per-invocation transport-class binder retry — inter-attempt timing unspecified" - same-cluster (both touch the binder's pi-ai call surface and the cancellation/`ctx.signal` interaction; resolve independently).
# T06 - Per-provider `complete()` forced-tool behaviour has no re-validation gate

**Kind:** assumptions
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The typed-query forced respond turn and the binder structured-output call both depend on two behavioural properties of `@earendil-works/pi-ai`'s `complete()` for each loom 1.0-supported provider (`anthropic-messages`, `openai-completions`, `mistral`, `amazon-bedrock`): that calling with `options.toolChoice = { type: "tool", name }` actually forces the named tool, and that it attaches no turn to a concurrently-driven `AgentSession`. Both properties are stated only in prose (`conversation-drive.md`, `binder-inference.md`, `implementation-notes.md`) with no fixture or bump-time gate, unlike the sibling pi-ai-coupled surfaces on the same pages — the seed-field `Api`-coverage assertion, the overflow-signature checklist item (i) (`#bump-checklist-provider-overflow-wording`), and the SDK capability inventory. A pi-ai minor that silently regresses either property breaks every typed query and binder inference against the affected provider, and the runtime surfaces the model-non-compliance diagnostic branch — which the spec says cannot be distinguished from provider-level non-compliance — so authors get no signal that the cause is a pi-ai adapter regression.

## Solution approach

Add a back-referenceable presupposition anchor in `conversation-drive.md` beside the **Provider compatibility for typed queries** paragraph, stating the two behavioural claims (named-tool forcing under `options.toolChoice`, and no turn attached to a concurrently-driven `AgentSession`). Add a SHOULD-level item to the *Editorial-review checklist for unpinned host presuppositions* in `version-bump-step2.md` that back-references that anchor and obliges a per-provider fixture re-run plus an off-session-turn inspection, with the outcome recorded as pass/fail/N/A. Add forward-links to the new anchor from `conversation-drive.md`'s forced respond turn site and `binder-inference.md`'s `options.toolChoice` bullet.

## Solution constraints

- The new checklist item and the presupposition paragraph it back-references MUST land in the same edit, per `version-bump-step2.md`'s "added to this checklist in the same edit" obligation.

## Relationships

- T20 "Binder structured-output tool — `name` and `label` undefined" - must-follow (this gate asserts against a concrete forced-tool target name; the binder tool's `name` must be pinned first for the gate to have something to assert against).
- T19 "Binder `complete()` `context.messages` content undefined" - same-cluster (same `complete()` call shape; resolved independently).
- T05 "Cancellation forwarding — turn-lifecycle event delivery not in SDK capability inventory" - same-cluster (sibling finding; different consuming surface; resolved independently).
# T07 - Initial forced respond turn — instruction wording status undeclared

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`query-tool-loop.md` step 2 ("Forced respond turn") describes the typed-query initial forced respond turn as issuing a user turn whose body is the italic prose *"Return your final answer using the `__loom_respond_<slug>` tool, conforming to this schema: …"* with a trailing ellipsis and no normative status declaration. The respond-*repair* follow-ups, by contrast, are pinned as byte-verbatim templates under "Follow-up turn templates (normative)" in `query-failure-and-repair.md`, governed by a renderer-MUST-emit-verbatim sentence. An implementer cannot tell whether the initial turn must reuse `schema_repeat` verbatim, copy the italic prose as a canonical literal, paraphrase it, or emit free-form text — yet the `max_rounds: 0` boundary-case paragraph already pins a single-U+000A separator "matching the single-LF separator the Follow-up turn templates (normative) section pins", assuming a byte-level structure the wording itself never commits to.

## Solution approach

Pin the initial forced respond turn's instruction wording as a normative template mirroring the `schema_repeat` follow-up, with a body byte-identical to `schema_repeat` minus its leading non-compliance sentence and governed by the same renderer-verbatim-MUST obligation. Add the template block either in `query-tool-loop.md` step 2's section or by extending "Follow-up turn templates (normative)" in `query-failure-and-repair.md`. Rewrite step 2's italic-prose-with-ellipsis description as a forward-link to that template, and update the `max_rounds: 0` boundary-case paragraph to cite it instead of repeating the wording. Point the `<slug>` and `<schema-json>` placeholders at their existing definitions in `query-failure-and-repair.md` rather than redefining them.

## Solution constraints

- The `max_rounds: 0` boundary-case paragraph MUST retain its existing single-U+000A prompt-to-instruction separator and trailing-newline-trim behaviour when updated to cite the template.

## Relationships

- T20 "Binder structured-output tool — `name` and `label` undefined" - same-cluster (symmetric asymmetry — the binder's structured-output tool is similarly under-pinned compared to its respond-tool sibling; both flag silent spots in otherwise meticulously pinned surfaces).
# T08 - Missing owning-declaration pins for bare Pi SDK symbols (`BashExecutionMessage.excludeFromContext`, `DefaultResourceLoader`, `ExtensionRuntime`)

**Kind:** external-entities
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

Three load-bearing Pi SDK symbols are cited bare across the PIC corpus with no owning-declaration pointer, breaking the owning-declaration-pointer convention sibling symbols on the same pages follow; a Pi minor that renames any of them escapes both the build-time SDK surface inventory and the bump-time editorial review. `BashExecutionMessage.excludeFromContext` is named as an analogy referent in the `#custom-message-context-entry-presupposition` paragraph of `runtime-event-channel.md` with no declaration cited. `DefaultResourceLoader` (with the `DefaultResourceLoaderOptions.systemPromptOverride` constructor option) is named twice in `provider-error-mapping.md` rule 4 but is omitted from the `#subagent-spawn-satellite-types` pin paragraph and its re-validation gate, while the sibling `ResourceLoader` interface is pinned there. `ExtensionRuntime` / `ExtensionRuntime.invalidate(...)` is referenced bare at `registration-steps.md` step 4, the `active-invocation-registry.md` "Edge cases" bullet, and `diagnostics/diagnostic-shape.md`, with no pin and no bump-checklist item, while sibling extension types are pinned.

## Solution approach

Pin `BashExecutionMessage.excludeFromContext` to its declaration at `dist/core/messages.d.ts` inline at the `#custom-message-context-entry-presupposition` paragraph, and extend bump-checklist item (r) to cover it. Pin `DefaultResourceLoader` and `DefaultResourceLoaderOptions` (declared at `dist/core/resource-loader.d.ts`) in the `#subagent-spawn-satellite-types` paragraph on the same footing as `ResourceLoader`, fold them into the existing item (o) re-validation obligation, and forward-link rule 4's first `DefaultResourceLoader` occurrence to that pin. Pin `ExtensionRuntime` at `registration-steps.md` step 4 as the canonical owner, citing its declaration at the loom 1.0 Pi-SDK pin, cite-by-location from `active-invocation-registry.md` and `diagnostic-shape.md`, and add a new lettered bump-checklist item covering `ExtensionRuntime.invalidate(...)`.

## Solution constraints

- Out of scope: step 2(a)'s seven-capability literal-read probe — `DefaultResourceLoader` MUST NOT be added to it.
- The pinned `ExtensionRuntime` declaration path MUST be confirmed against the candidate `@earendil-works/pi-coding-agent` package before merge.

## Relationships

None
# T09 - Diagnostic code-registry *Spec rule* cells bypass GOV-9 `#prefix-n` cross-link form

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The *Spec rule* column in the four diagnostic code-registry tables (`code-registry-load.md`, `code-registry-parse.md`, `code-registry-runtime.md`, `code-registry-host.md`) links to owner topic-page roots or section-level heading slugs rather than to `#prefix-n` REQ-ID anchors. The owning pages are non-narrative, so GOV-9 (`#gov-9`) requires each cross-page reference to a normative rule to resolve as a `#prefix-n` fragment to the depended-upon rule's anchor; section-level links are licensed only where the owning page is pure-narrative. The cells therefore stand as GOV-9 defects, and a reviewer cannot trace a diagnostic row to its specific obligation without reading the whole linked section. A minority of rows already conform (e.g. the `loom/load/discovery-slow` row targets `…/package-and-settings.md#disc-6`), so the target form is achievable per-row.

## Solution approach

Rewrite each *Spec rule* cell's link target in the four `code-registry-*.md` tables to the `#prefix-n` REQ-ID anchor of the rule the diagnostic implements, keeping the link text unchanged. Where the depended-upon obligation carries no REQ-ID anchor yet (a GOV-22 standing defect on the owner page, `#gov-22`), leave the section-level link in place and flag it as anchor-pending. Where a row cites several source rules, rewrite each per-source link to its own `#prefix-n` anchor.

## Solution constraints

- Out of scope: coining or editing REQ-ID anchors on the owning topic pages; un-anchored obligations are landed by T12, T13, and T14.
- Edit only the *Spec rule* column of the four `code-registry-*.md` tables; do not modify diagnostic codes, messages, or other columns.

## Relationships

- T14 "Un-anchored normative obligations across `cancellation.md`" - must-follow (the cancellation-routed diagnostic rows cannot be repointed to `#cncl-n` anchors until those anchors exist; T14 must land first).
- T13 "Binder *System-prompt structure (normative)* items 1–8 carry no REQ-ID anchors" - must-follow (binder-routed diagnostic rows depending on those items become repointable once the per-item `BNDR-N` anchors land).
- T12 "Compact-transcript reference renderings A–D — no per-rendering identifiers" - must-follow (any diagnostic citing a specific reference rendering becomes repointable once those anchors are coined).
# T10 - PIC-11 / PIC-12 / PIC-13 / PIC-14 / PIC-16 internal DI interface shapes pinned normative beyond GOV-18 arm (a)

**Kind:** prescription, scope
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

PIC-11 (`SchemaValidator`), PIC-13 (`FileSystem`), PIC-14 (`FileWatcher`), and PIC-16 (`TokenEstimator`) each state "The interface shape is normative" and pin an exact TypeScript `interface` declaration — member names, arities, return types, and the closed member set. PIC-12 (`Clock`) is slightly softer but still binds member names and signatures normatively. All five are internal DI seams consumed only by the runtime and its test wiring; none is exposed through `ExtensionAPI` or observable on `.loom`/`.warp` inputs. GOV-18 arm (a) binds only externally-observable behaviour on `.loom`/`.warp` inputs, so pinning these member lists as normative MUSTs binds internal implementation architecture beyond arm (a)'s reach — a second-source implementer satisfying every behavioural contract through a different decomposition would be formally non-conforming despite byte-identical outputs.

## Solution approach

Demote the TypeScript `interface` shape blocks of PIC-11, PIC-13, PIC-14, and PIC-16 (anchors `pic-11`, `pic-13`, `pic-14`, `pic-16` in `host-interfaces-services.md`) from normative to non-normative reference, keeping each seam's behavioural obligations normative. For PIC-12 (`pic-12`), demote the member-shape listing the same way while keeping its behavioural rules normative. Apply one consistent normative/reference split across all five seams, co-resolving with T11 so the page reads consistently.

## Solution constraints

- The per-seam behavioural obligations (single-pass validation, monotonic `now()`, `ENOENT`-on-missing `readText`, the watcher event-kind filtering, per-message integer estimation, and PIC-12's `Date.now`/`performance.now`/`setTimeout` ban) MUST remain on the normative side of the demotion.

## Relationships

- T11 "PIC-10 `Checkpoint` seam — internal test-only hook pinned as normative behavioural contract" - co-resolve (same page, same GOV-18-arm-(a) conflict pattern; the spec-edit pattern is identical so the page stays internally consistent).
# T11 - PIC-10 `Checkpoint` seam — internal test-only hook pinned as normative behavioural contract

**Kind:** prescription, scope
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

PIC-10 in `host-interfaces-services.md` declares the `Checkpoint` seam with a concrete TypeScript interface — the `CheckpointKind` literal union, the `CheckpointSite` field set, and the `Checkpoint.before(kind, site)` member — and pins these type shapes as normative MUSTs alongside the genuinely-behavioural rules. The same paragraph states the seam is internal: not exposed through `ExtensionAPI`, not visible to loom authors / Pi extensions / tools, and with no observable production effect beyond one resolved promise per checkpoint apart from the `loop-iter` macrotask yield. Under the GOV-18 arm (a) operational test, only externally-observable behaviour on `.loom` / `.warp` inputs is in-scope; the concrete member list, type-literal union, and field shape of an internal test-only DI seam are not observable on those inputs. An alternative runtime that implements every behavioural obligation through a differently-shaped internal seam would violate the interface-shape MUSTs while satisfying every observable conformance property.

## Solution approach

In `host-interfaces-services.md`, demote PIC-10's `Checkpoint` / `CheckpointKind` / `CheckpointSite` TypeScript block to a non-normative reference shape, and rewrite the surrounding rules so the normative obligations name the behaviours rather than the declared type names. Keep PIC-10's REQ-ID anchor `id="pic-10"` and its behavioural obligations normative — the checkpoint kinds the hook fires at, the one-macrotask yield on `loop-iter`, the microtask resolution on the other kinds, the one-instance-per-`loomAbort` rule, the `ExtensionAPI`-invisibility rule, and the test-fake call-once / no-skip rules. Re-anchor the test-fake rules alongside the demoted interface or as constraints on the behavioural conformance test.

## Solution constraints

- Out of scope: the PIC-11 / PIC-12 / PIC-13 / PIC-14 / PIC-16 interface-shape demotions on the same page owned by T10.

## Relationships

- T10 "PIC-11 / PIC-12 / PIC-13 / PIC-14 / PIC-16 internal DI interface shapes pinned normative beyond GOV-18 arm (a)" - co-resolve (same page, same GOV-18-arm-(a) conflict pattern; the spec-edit pattern should be identical so the page stays internally consistent).
# T12 - Compact-transcript reference renderings A–D — no per-rendering identifiers

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The *Compact-transcript format (normative)* sub-section of `binder-model-and-context.md` (anchor `compact-transcript-format-normative`) ends with four reference renderings — labelled **A**, **B**, **C**, **D** in bold-letter prose — that the spec pins as MUST-reproduce-exactly. Each rendering is an independent normative obligation fixing a distinct facet of the rendering contract, yet none carries a per-obligation identifier: no `BNDR-N` REQ-ID anchor and no page-local sub-letter anchor. A coverage-matrix leaf, conformance test, or failure report can cite a single rendering only by prose, and re-lettering on any insertion silently breaks every such citation. GOV-9's `#prefix-n` cross-link contract is unsatisfiable for the individual renderings until they are coined.

## Solution approach

Coin a new umbrella `BNDR` REQ-ID at the sub-section's normative lead-in (next free integer under the `BNDR` prefix per GOV-3, dual-form layout per GOV-1). Assign page-local sub-letter anchors to renderings A through D in order, each in the dual-form layout. Add a preamble before rendering A mirroring the BNDR-6 sub-letter boilerplate on `defaulting-system-note-echo.md`, naming the GOV-23 page-local sub-letter scheme and the umbrella REQ-ID as the load-bearing identifier for unit citations.

## Solution constraints

- The umbrella `BNDR-N` anchor MUST sit on a defining obligation site (the sub-section's normative lead-in), not on the `#### Compact-transcript format (normative)` heading line, per GOV-1.
- The `BNDR` next-free integer MUST be computed from the live + retired union across the entire `binder/` subtree per GOV-3 / GOV-24, not from this page alone.

## Relationships

- T13 "Binder *System-prompt structure (normative)* items 1–8 carry no REQ-ID anchors" - same-cluster (same shape of un-anchored normative items on a sibling page under the same `BNDR` prefix; resolve independently with the parallel sub-letter scheme).
- T14 "Un-anchored normative obligations across `cancellation.md`" - same-cluster (same GOV-22 progressive-coinage defect on a different prefix; independent surface).
- T09 "Diagnostic code-registry *Spec rule* cells bypass GOV-9 `#prefix-n` cross-link form" - must-precede (any diagnostic citing a specific reference rendering becomes repointable once these anchors are coined).
# T13 - Binder *System-prompt structure (normative)* items 1–8 carry no REQ-ID anchors

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The `#### System-prompt structure (normative)` subsection of `binder-bypass-and-envelope.md` is a numbered list of eight defining obligations, each carrying RFC-2119 normative-modal tokens and naming a distinct contractual surface (item 4's `Parameters:` block, item 7's envelope-kinds enumeration, item 8's no-invent-defaults line, and so on). None of items 1–8 carries an `<a id="bndr-N"></a> **BNDR-N.**` dual-form anchor, and the subsection heading carries no umbrella anchor either. Per GOV-22 these are standing un-coined obligation sites, and per GOV-9 every cross-page reference must resolve to a `#prefix-n` fragment — citing "item 4" by prose breaks silently under any reorder or insertion without producing a dangling-anchor signal.

## Solution approach

Coin a dual-form `<a id="bndr-N"></a> **BNDR-N.**` REQ-ID anchor at each of items 1–8 of the `#### System-prompt structure (normative)` subsection, allocating the next free integers under the already-registered `BNDR` prefix (per GOV-3 the prefix counter is global across the `binder/` subtree). Add an umbrella anchor on the subsection heading line so inbound links citing the structure list as a unit have a stable target distinct from the per-item anchors.

## Solution constraints

- Out of scope: the trailing *Type display*, *Default-literal rendering*, and *Parameter-line reference renderings* tables — their per-rendering anchoring is a separate contract surface (same anchor-pattern precedent as T12).

## Relationships

- T12 "Compact-transcript reference renderings A–D — no per-rendering identifiers" - same-cluster (same GOV-22 anchor-coinage gap on the sibling `binder-model-and-context.md` page; resolves independently with the same dual-form + sub-letter pattern).
- T14 "Un-anchored normative obligations across `cancellation.md`" - same-cluster (same GOV-22 progressive-coinage residue on `cancellation.md`; resolves independently with the `CNCL-N` prefix).
- T09 "Diagnostic code-registry *Spec rule* cells bypass GOV-9 `#prefix-n` cross-link form" - must-precede (binder-routed diagnostic rows depending on these items become repointable once the per-item `BNDR-N` anchors land).
# T14 - Un-anchored normative obligations across `cancellation.md`

**Kind:** traceability
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`cancellation.md` coins only three `CNCL-N` anchors (`CNCL-1`, `CNCL-2`, `CNCL-3`), all on the three sub-clauses of the late-settlement discard rule. The remaining sections from **Signal source** through **Surfacing** carry a substantial body of normative MUST / MUST NOT obligations that have never been coined as REQ-IDs and can therefore be cited only by section heading plus quoted prose. GOV-22 mandates progressive coinage of un-anchored obligations so that GOV-9's `#prefix-n` cross-link form is reachable from sibling pages; until these anchors exist, GOV-9 cross-references into the cancellation rules and per-obligation conformance citations are not mechanically possible.

## Solution approach

Coin `CNCL-N` anchors at each defining obligation site on `cancellation.md`, continuing the existing sequence from the next free ID `CNCL-4` in source order down the page. Apply the GOV-1 dual-form layout used for `CNCL-1`…`CNCL-3` (`<a id="cncl-n"></a> **CNCL-N.**`). Where a single sentence carries two distinct obligations (e.g. the `ctx.signal` undefined-tolerance MUST and the MUST-NOT-depend-on-truthiness clause), split into separate anchored IDs; the **Surfacing** section can take an umbrella anchor beside its existing `<a id="surfacing"></a>`.

## Solution constraints

- Do not renumber or re-anchor existing `CNCL-1`…`CNCL-3` (GOV-23 anchor-scheme stability); new IDs start at `CNCL-4`.
- Allocate numeric tails under the already-registered `CNCL` prefix only; do not introduce a new prefix.

## Relationships

- T13 "Binder *System-prompt structure (normative)* items 1–8 carry no REQ-ID anchors" - same-cluster (same GOV-22 progressive-coinage defect on a different page; resolves independently).
- T12 "Compact-transcript reference renderings A–D — no per-rendering identifiers" - same-cluster (same GOV-22 defect on `binder-model-and-context.md`).
- T01 "Pre-evaluation failure list — stale count-pointer and non-contiguous REQ-ID numbering" - same-cluster (same traceability lens, different mechanism — non-contiguous numbering rather than missing anchors).
- T09 "Diagnostic code-registry *Spec rule* cells bypass GOV-9 `#prefix-n` cross-link form" - must-precede (the cited `code-registry-*.md` rows that depend on cancellation rules cannot be repointed to `#cncl-n` anchors until those anchors exist; coining here unblocks the citation-side fix there).
