# Triaged Spec Review - spec

_Generated: 2026-06-04T17:12:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T22) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker + 15 high, 8 medium retained; 19 low discarded; 13 low findings merged into 3 medium findings; 3 nit dropped; 0 false dropped._

---

# T01 - Misplaced sections within the pi-integration-contract pages

**Kind:** placement
**Importance:** medium
**Score:** 15
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

Three blocks of normative prose in the `pi-integration-contract/` topic set live on the wrong page. `binder-inference.md` carries the **System notes**, **Delivery surface**, and **Runtime event channel** contract (including the `<a id="success-side-null-policy">` paragraph) whose subject matter is independent of binder inference and whose named owner is `runtime-event-channel.md`; five external cross-references already cite `runtime-event-channel.md` as the owner. `binder-inference.md` also carries the **Renderer registration (`pi.registerMessageRenderer`)** subsection, which pins extension-initialisation behaviour and is split from the cognate renderer-failure path that `extension-bootstrap-and-per-loom.md` already owns. `runtime-event-channel.md` carries the `estimateTokens` and `buildSessionContext` named-export contracts, which are SDK host-interface paragraphs whose `host-interfaces-core.md` "above" back-references resolve to text on a different file.

## Solution approach

Move the **System notes**, **Delivery surface**, and **Runtime event channel** blocks (including the `<a id="success-side-null-policy">` paragraph) out of `binder-inference.md` to `runtime-event-channel.md` ahead of its existing `RuntimeEvent` shape block, which realigns the five inbound owner-citations that already name that page. Repoint the `#success-side-null-policy` fragment links in `language-and-architecture.md`'s Runtime-observability bullet and the two `slash-invocation.md` bullets to `runtime-event-channel.md#success-side-null-policy`. Move the **Renderer registration (`pi.registerMessageRenderer`)** subsection to `extension-bootstrap-and-per-loom.md` beside the existing renderer-failure path, and replace the System-notes mention of it with a forward-link to its new home. Move the `estimateTokens` and `buildSessionContext` named-export paragraphs to `host-interfaces-core.md` so the existing "above" back-references resolve, and re-resolve above/below back-references inside all moved blocks.

## Solution constraints

- Preserve every moved anchor's `id` value verbatim (e.g. `success-side-null-policy`); only the hosting file changes, so inbound fragment links resolve after repoint.
- Out of scope: `glossary.md`'s `always-log set` entry already cites `runtime-event-channel.md` as owner — verify it resolves, do not edit it.

## Relationships

None
# T02 - GOV body-paragraph REQ-IDs (GOV-1, GOV-3, GOV-4..GOV-9) lack the dual-form HTML anchors GOV-1 mandates

**Kind:** traceability
**Importance:** medium
**Score:** 15
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

GOV-1 *Required HTML-anchor contexts* names body-paragraph context as one of the four contexts where the `<a id="prefix-n"></a>` HTML form MUST accompany the inline `**PREFIX-N.**` marker, because the bold-with-period marker does not by itself produce a stable URL fragment in common Markdown renderers. Eight live body-paragraph REQ-IDs carry only the bare inline marker: GOV-1 and GOV-3 on `req-id-prefix-table-active-a.md`, and GOV-4, GOV-5, GOV-6, GOV-7, GOV-8, GOV-9 on `req-id-prefix-table-active-b.md`. The omission is self-referential and locally inconsistent: GOV-9 itself mandates that every REQ-ID anchor on a non-narrative page resolve as a `#prefix-n` fragment, yet its own site does not, while GOV-12, GOV-14, and GOV-22 on the same pages already carry the dual form. Any citer reaching for `#gov-1`..`#gov-9` produces a broken deep link.

## Solution approach

Add the dual-form HTML anchor — `<a id="prefix-n"></a>` immediately preceding the existing inline `**PREFIX-N.**` marker, with a lowercase `id`, in the order GOV-1 *Dual-form layout* pins — to each of the eight defining sites that lack it: `gov-1` and `gov-3` on `req-id-prefix-table-active-a.md`, and `gov-4`, `gov-5`, `gov-6`, `gov-7`, `gov-8`, `gov-9` on `req-id-prefix-table-active-b.md`. Match the dual form already in place at GOV-12 / GOV-14 / GOV-22 on the same pages.

## Solution constraints

- Do not mutate the inline `**GOV-N.**` marker bytes; GOV-1's witness regex pins the bold-with-period form.
- Out of scope: GOV-3's extraction-glob wording (owned by T03) and the prefix-table row bindings (owned by T04); edit only the anchor tokens.

## Relationships

- T03 "GOV-3 extraction scope and GOV-6 closure invariant exclude subdirectory REQ-IDs" — same-cluster (touches the same GOV-3 / GOV-6 paragraphs; resolves independently — extraction-scope wording vs anchor coinage)
- T04 "Prefix table binds prefixes to hub files that carry no REQ-ID anchors" — same-cluster (another GOV-1 enforcement gap on the same prefix-table pages; table-schema question vs per-paragraph anchor coinage)
# T03 - GOV-3 extraction scope and GOV-6 closure invariant exclude subdirectory REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

GOV-3 (`governance/req-id-prefix-table-active-a.md`) scopes REQ-ID extraction to rows in `spec_topics/*.md`, and GOV-6 (`governance/req-id-prefix-table-active-b.md`) states its table-completeness closure invariant over prefixes appearing in REQ-IDs across `spec_topics/*.md`. Under POSIX single-segment glob semantics, both predicates scan only the first-level files directly inside `docs/spec_topics/`. But the live `**PREFIX-N.**` anchor sites live in subdirectory files (e.g. `BNDR-1..3` in `binder/binder-bypass-and-envelope.md`, `GOV-1/3` in `governance/req-id-prefix-table-active-a.md`), none of which match `spec_topics/*.md`. A conformant extractor returns almost no REQ-IDs and GOV-6's closure invariant holds vacuously, so a typo such as `BNRD-1` in a subdirectory file escapes the corpus-wide traceability backstop.

## Solution approach

Rewrite the `spec_topics/*.md` glob to the recursive `spec_topics/**/*.md` form at both sites: GOV-3's "all other rows in `spec_topics/*.md` are in scope" sentence and GOV-6's table-completeness invariant sentence. The `**/*.md` spelling is the corpus-internal idiom GOV-17's non-normative `grep -nE` aid already uses.

## Solution constraints

- Out of scope: the prefix table's `Page`-column binding rewrite (owned by T04).
- Out of scope: other `spec_topics/*.md` occurrences elsewhere in governance (GOV-17, GOV-14, GOV-21, the retired-alias scope paragraph) — leave them unchanged here.

## Relationships

- T04 "Prefix table binds prefixes to hub files that carry no REQ-ID anchors" — co-resolve (T04's table rewrite redefines the scan set and forces a recursive or per-row glob; same diff)
- T02 "GOV body-paragraph REQ-IDs lack dual-form HTML anchors" — same-cluster (touches the same GOV-3 paragraph; resolves independently)
# T04 - Prefix table binds prefixes to hub files that carry no REQ-ID anchors

**Kind:** traceability
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The REQ-ID prefix table on `req-id-prefix-table-active-a.md` and its continuation in `-b.md` binds each prefix to a *hub* file (`BNDR`→`binder.md`, `DIAG`→`diagnostics.md`, `CEIL`/`CIO`→`hard-ceilings.md`, `GOV`→`governance.md`, and the rest), but each hub file is a table-of-contents stub carrying zero `**PREFIX-N.**` markers — the live anchors sit in subdirectory files. This violates GOV-1's requirement that each non-narrative table page carry a `PREFIX-N` anchor at every live REQ-ID's defining site, and it makes every GOV-9 cross-link of the form `<hub>.md#prefix-n` non-resolving, since the fragment names a hub page that holds no such anchor. The defect compounds with T03: the closure invariant passes vacuously by never scanning where the anchors actually live, so tooling witnesses no violation.

## Solution approach

Rewrite the prefix-table rows in `req-id-prefix-table-active-a.md` and `-b.md` so each prefix binds to the anchor-bearing subdirectory file(s) rather than the hub stub. Amend GOV-4 to admit a one-prefix-to-many-pages binding reciprocal to its existing many-prefixes-to-one-page clause, and add the matching GOV-7 mutation step. Repoint the existing GOV-9 cross-references that currently target hub-file fragments, and co-resolve the GOV-3 / GOV-6 scan-set redefinition with T03 in the same diff.

## Solution constraints

- The GOV-4 binding-cardinality change is substantive per GOV-8: retire GOV-4 and add a fresh GOV-N rather than editing the binding rule in place.

## Relationships

- T03 "GOV-3 extraction scope and GOV-6 closure invariant exclude subdirectory REQ-IDs" — co-resolve (the table rewrite redefines the scan set and forces a recursive or per-row glob; same diff)
- T02 "GOV body-paragraph REQ-IDs lack dual-form HTML anchors" — same-cluster (also a GOV-1 anchor-hygiene gap, table-cell context vs body-paragraph context; resolves independently)
# T05 - Demote over-prescriptive and non-testable MUSTs on unobservable implementation structure

**Kind:** testability, prescription
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

Eight normative `MUST`s across the spec bind on implementation structure or verification mechanism that no loom 1.0 author input can exercise; in each case the observable contract is already pinned by surrounding prose, so the `MUST` is unfalsifiable by any black-box conformance test and reduces to code inspection. They mis-frame maintainability conventions and forward-compatibility hooks as conformance obligations, and they contradict INV-1's own `loom-1-0-seam-symlink-resolution-hardening` blockquote, which explicitly treats the same single-named-function factoring as "a maintainability convention, not an observable conformance point". The eight sites are: INV-2's `style` discriminator + exhaustive-switch mandate (`invocation.md`, anchor `inv-2`); the per-call-timeout "consumers MUST tolerate unknown fields" trio (INV-3 anchor `inv-3` in `invocation.md`, the `<name>(args)` seam in `tool-calls.md`, the Options-surface seam in `query/query-failure-and-repair.md`); the `Resolver` routing mandates (the `**Resolver interface.**` paragraph and the `loom-1-0-seam-resolver-interface` blockquote in `imports.md`); the typed-query "single named runtime constant" mandate (`pi-integration-contract/conversation-drive.md`, anchor `loom-1-0-seam-typed-query-supported-provider-set`); the `defineTool(...)` construction mandate (the **Per-loom registration** bullet in `pi-integration-contract/extension-bootstrap-and-per-loom.md`); and PIC-12's build-time-grep-test enforcement clause (`pi-integration-contract/host-interfaces-services.md`, anchor `pic-12`, restated in the **Clock.** bullet of `implementation-notes.md`).

## Solution approach

Demote each prescriptive `MUST` to non-normative guidance — `SHOULD` or an explicitly non-normative note — while keeping the observable contract at each site normative and mirroring INV-1's non-normative-implementation-note treatment. For INV-2, keep loom 1.0's positional-only invocation surface normative, add a parse-time rejection carrier for named-argument syntax in `diagnostics/code-registry-parse.md`, and re-point the INV-2 *Anchored at* line in `future-considerations/surface-extensions.md` at that parse-time carrier. Re-cast the two `defineTool` mentions in `pi-integration-contract/provider-error-mapping.md` as references to the demoted **Per-loom registration** construction recommendation, and keep PIC-12's `Date.now` / `performance.now` / `Date.prototype.getTime` / global `setTimeout` / `clearTimeout` ban (with the `WallClock` carve-out) normative at both `host-interfaces-services.md` and `implementation-notes.md`.

## Solution constraints

- If any demotion removes a `> **loom 1.0 seam — <name>.**` blockquote from the 12-seam inventory at `future-considerations/surface-extensions.md#surface-extensions-v1-leaves-a-seam`, decrement the integer literal in the GOV-12 *Forward-compatibility seams* integer-count aggregator (the Scope bullet under `spec.md`) in the same commit.
- Preserve every cross-page-cited anchor ID at the demoted sites (`inv-2`, `inv-3`, `loom-1-0-seam-resolver-interface` / `v1-seam-resolver-interface`, `loom-1-0-seam-typed-query-supported-provider-set` / `v1-seam-typed-query-supported-provider-set`, `pic-12`); demotion must not delete them.

## Relationships

- T09 "Invoke variants violate the wire-`kind` naming pattern" — decision-overlap (demoting the INV-2 AST-shape MUST means the wire-`kind` resolution no longer needs to reserve a named-argument variant; pick a consistent answer)
# T06 - `while` condition wording contradicts itself

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `while` bullet in `docs/spec_topics/control-flow.md` glosses the loop
condition as "repeats while the condition is `true` (truthiness rule applies
— only `true`/`false` accepted)". The parenthetical contradicts itself:
"truthiness rule applies" reads as a promise of JS-style coercion, while
"only `true`/`false` accepted" forbids exactly that. This miscites the
`## Truthiness` section in `expressions.md`, which defines loom's no-coercion
stance — a non-boolean condition is `loom/parse/non-boolean-condition`. The
`if` and ternary glosses on the same page do not use this shorthand, so the
contradiction is local to `while`.

## Solution approach

Rewrite the `while` bullet's parenthetical in `control-flow.md` to state the
no-coercion rule directly: the condition must be `boolean`, loom performs no
truthiness coercion, and a non-boolean condition is
`loom/parse/non-boolean-condition`. Delete the phrase "truthiness rule
applies", and add a forward-link to the `## Truthiness` section in
`expressions.md`.

## Solution constraints

- None.

## Relationships

- T20 "Logical and ternary operators leave short-circuit semantics and operand evaluation order unspecified" — same-cluster (also concerns boolean-position operands in expressions.md; resolves independently)
# T07 - Built-in methods — `string.replace` row missing conformance vectors

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `replace(from, to)` row in the "Built-in methods and properties" `string` table of `docs/spec_topics/expressions.md` declares a deliberate divergence from JS `String.prototype.replace`: `$`-sequences in `to` (`$&`, `$$`, `$n`) are inserted literally, not interpreted as JS replacement patterns. This is the only spec site where loom contradicts the host language's well-known behaviour for a method, yet the row carries no test vectors. Every other normative divergence from host semantics is paired with byte-exact examples (e.g. the `BNDR-6` reference-rendering table), so a conformance suite author must here re-derive expected outputs from prose alone — and an implementation that inherits JS replacement-pattern interpretation can pass any test extrapolated from the rule.

## Solution approach

Add a normative test-vector block attached to the `replace(from, to)` row in the `string` table, marked normative consistent with the `BNDR-6` reference-rendering precedent. Cover the three documented `$`-sequence classes (`$&`, `$$`, `$n`) and exercise the row's existing "Replaces all occurrences" and "Empty `from` returns the receiver unchanged" clauses, including a multiple-occurrence `$&` vector that distinguishes literal insertion from host `replaceAll` pattern expansion.

## Solution constraints

- None.

## Relationships

- T16 "Indexed access on `string` receiver is unspecified" — same-cluster (touches the same `string` stdlib table; independent fix)
# T08 - Subagent-mode `agent_end` payload chronological-ordering presupposition unstated

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The subagent-mode untyped-query extractor in `subagent.md` reads its `Ok(string)` value from the event-delivered `messages: AgentMessage[]` array on the terminal `agent_end` variant of `AgentSessionEvent` (not from the `AgentSession.messages` getter), identifying the final turn by trailing position and concatenating the final turn's `assistant` text "in chronological order". Both steps presuppose the event-delivered array is ordered oldest-to-newest, and `AgentMessage[]` does not encode ordering. The chronological-ordering presupposition at `host-interfaces-core.md#messages-chronological-order-presupposition` is scoped to `SessionContext.messages` (returned by `buildSessionContext`) and names only three consumers; the subagent-mode extractor reads a distinct surface — the event payload — and is not among them, and bump-checklist item (h) at `version-bump-step2.md#bump-checklist-messages-chronological-order` inherits the same scoping. A Pi minor that reordered the `agent_end` payload would silently corrupt every subagent-mode untyped-query result with no type, SDK-inventory, or bump-checklist signal.

## Solution approach

Rewrite the presupposition at `host-interfaces-core.md#messages-chronological-order-presupposition` so it governs loom-consumed `AgentMessage[]` ordering across both delivering surfaces — `SessionContext.messages` via `buildSessionContext`, and the `agent_end` variant's `messages` field on `AgentSessionEvent` — and add the subagent-mode extractor in `subagent.md`'s "Conversation drive — subagent mode" section as a named consumer. Rewrite bump-checklist item (h) at `version-bump-step2.md#bump-checklist-messages-chronological-order` to confirm oldest-to-newest ordering on both surfaces.

## Solution constraints

- None.

## Relationships

- T12 "`pi.getCommands()` completeness at first `session_start` is an unstated presupposition" — same-cluster (same "is this Pi-side surface ready/ordered at a load-time boundary?" presupposition family; same remedy shape — documented presupposition plus per-bump editorial-review item)
# T09 - Invoke variants violate the wire-`kind` naming pattern

**Kind:** naming
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The `kind` discriminator for `QueryError` is wire contract — snake_case, stable across minor revisions per the ERR-15 type-openness seam. Seven of the nine loom 1.0 variants form their wire value by snake-casing the schema identifier and dropping the trailing `Error` suffix (e.g. `ValidationError` → `"validation"`), but the two invoke variants in the "### Invoke variants" section of `queryerror-variants.md` retain the suffix: `InvokeInfraError` → `"invoke_infra_error"` and `InvokeCalleeError` → `"invoke_callee_error"`. A reader inferring the wire form from the majority pattern predicts `"invoke_infra"` / `"invoke_callee"` and writes mismatching matchers, cross-language decoders, and fixtures, and the page's own "snake_case noun" rule statement is false for two of nine variants. Because the wire surface has not shipped, whatever values ship in loom 1.0 are locked until a major-version bump.

## Solution approach

Rename the two invoke variants' wire `kind` values in the `InvokeInfraError` and `InvokeCalleeError` schema blocks of `queryerror-variants.md` to `"invoke_infra"` and `"invoke_callee"` so all nine variants drop the `Error` suffix uniformly. Clarify the opening discriminator paragraph's "(snake_case noun)" rule so it states the wire form as the snake_case schema identifier with the trailing `Error` dropped, uniform across all nine variants. Propagate the two renamed literals across the consuming pages: `invocation.md`, `pi-integration-contract/binder-inference.md`, `pi-integration-contract/conversation-drive.md`, `pi-integration-contract/subagent.md`, `pi-integration-contract/active-invocation-registry.md`, `pi-integration-contract/capability-probe.md`, `query/query-failure-and-repair.md`, and `slash-invocation.md`.

## Solution constraints

- Out of scope: the `loom/runtime/invoke-depth-exceeded` and `loom/runtime/invoke-path-escape` diagnostic codes — the rename applies to `QueryError.kind`, not the `loom/runtime/*` diagnostic namespace.

## Relationships

- T05 "Demote over-prescriptive and non-testable MUSTs on unobservable implementation structure" — decision-overlap (demoting the INV-2 AST-shape MUST means this resolution no longer needs to reserve a named-argument wire-`kind` variant; pick a consistent answer)
# T10 - `loom/runtime/internal-error` — `tool-return-shape` discriminator field is unpinned

**Kind:** testability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The `loom/runtime/internal-error` row in `code-registry-runtime.md` describes its `tool-return-shape` arm as carrying three `details` elements. The first two are pinned by exact field name (`details.kind = "tool-return-shape"`, `details.tool_name`); the third is introduced only as "a discriminator describing the offending shape (e.g. `typeof resolved`, `Array.isArray(content)`)" — naming neither a field nor a value space. `diagnostic-shape.md`'s `details?` pinning convention makes each row's *Trigger* prose the normative source for that row's `details` payload shape, so this slot abdicates the contract every other row honours. Two conforming runtimes can emit different field names and value spaces for the discriminator, and operator tooling and conformance tests cannot key on it.

## Solution approach

In the `tool-return-shape` clause of the `loom/runtime/internal-error` row in `code-registry-runtime.md`, replace the illustrative discriminator phrase with a named `details` field whose value space is a closed token vocabulary, one token per envelope-rule check the same row already enumerates (resolved-not-object, content-not-iterable, entry-missing-`type` / -`text`, etc.). Specify which token the diagnostic emits when one envelope violates more than one rule (e.g. first-failing by check order).

## Solution constraints

- None.

## Relationships

- T11 "`pi.registerTool` failure during watcher-driven registry swap is undefined" — same-cluster (both touch the runtime-defect surface around tool registration / dispatch; resolve independently)
# T11 - `pi.registerTool` failure during watcher-driven registry swap is undefined

**Kind:** error-model
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The watcher hot-reload swap (Extension entry point step 5) is a build-aside-then-publish sequence: stage the rebuilt registry and AJV validator cache, then install both into `LoomRegistry` in one atomic publish. The same paragraph then re-registers tools synthesised from prompt-mode `.loom` callables through `pi.registerTool` when the swap produces a new schema slug, sequenced *after* the publish — and `pi.registerTool` can throw. No diagnostic covers that throw: `loom/runtime/registry-swap-failed`'s trigger is scoped to a throw mid-rebuild before publication, and `loom/runtime/internal-error`'s routing is scoped to the slash-command system-note and `invoke`-parent `Err` surfaces, neither of which exists in a chokidar debounced watcher callback. The resulting state is unnamed — the new registry and validators are live but the model-callable tool for the new slug failed to register, with no compensation primitive (Pi exposes no `pi.unregisterTool`) — and the publish-vs-re-registration ordering is itself unpinned.

## Solution approach

Pin the watcher swap's ordering so the build-aside-then-publish all-or-nothing property also covers `pi.registerTool` re-registration: fold the re-registration into the staged rebuild ahead of the atomic publish. Extend the `loom/runtime/registry-swap-failed` trigger in `code-registry-runtime.md` to cover a `pi.registerTool` throw for a newly-distinct schema slug before publish. State on the failure path that the prior `LoomRegistry` snapshot, AJV validator cache, and prompt-mode registration cache all remain live.

## Solution constraints

- MUST NOT assume a `pi.unregisterTool` compensation primitive — Pi exposes none; failure-path rollback is limited to loom-side state (the staged `LoomRegistry` snapshot and the prompt-mode registration cache).

## Relationships

- T10 "`loom/runtime/internal-error` — `tool-return-shape` details discriminator is unpinned" — same-cluster (both touch the runtime-defect surface around tool registration / dispatch; resolve independently)
# T12 - `pi.getCommands()` completeness at first `session_start` is an unstated presupposition

**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`registration-steps.md` step 3 performs a single forward pass over `pi.getCommands()` at `session_start` and registers every pending loom whose slash name does not collide. This relies on an unstated precondition: that loom's `session_start` snapshot already enumerates every command Pi will register from prompt templates and skills, and every command sibling extensions will register. Because Pi emits `session_start` in non-deterministic load order (the seam already pinned in `binder-inference.md`), a sibling loaded after loom that registers a colliding command inside its own `session_start` handler is absent from loom's snapshot; the collision check silently passes and Pi disambiguates with `name:1` / `name:2` suffixes instead of the `loom/load/cross-format-collision` outcome DISC-4 prescribes. Neither DISC-4 nor step 3 names this ordering precondition or the first-check miss window, so two conforming implementations diverge on the first-startup case.

## Solution approach

Add a named presupposition paragraph to `registration-steps.md` step 3, anchored with a stable HTML anchor and mirroring the pattern of `host-interfaces-core.md#messages-chronological-order-presupposition`, stating that the first `session_start` collision pass relies on Pi having populated `pi.getCommands()`'s prompt-template and skill arms before emitting `session_start`, and on sibling commands being either factory-time-registered or load-ordered before loom — with a forward-cross-reference to DISC-4 for the next-cycle re-evaluation of later-loaded siblings, and noting that Pi's numeric-suffix disambiguation is the observable surface when a first-pass check misses. Add a matching item to the editorial-review checklist in `version-bump-step2.md` so each Pi minor bump re-validates the `session_start` emit order and the load-order-iterating `emit` against the precondition.

## Solution constraints

- Recovery / de-registration semantics (post-bind activations, `ctx.reload()` re-runs) are owned by DISC-4; cross-reference DISC-4 rather than restate them.

## Relationships

- T13 "Registration step 1 — factory-time working-directory source unstated" — same-cluster (same `registration-steps.md`, same factory-vs-`session_start` boundary; resolves independently)
- T08 "Subagent-mode `agent_end` payload chronological-ordering presupposition unstated" — same-cluster (same "is this Pi-side surface ready/ordered at a load-time boundary?" remedy pattern — documented presupposition plus per-bump editorial-review item)
# T13 - Registration step 1 — factory-time working-directory source unstated

**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Step 1 of `registration-steps.md` runs the discovery walk "at factory time and again on every `resources_discover` event", preferring the event payload's `event.cwd` over "any factory-captured `cwd`" so a per-session cwd change is honoured on reload. This presupposes a factory-time `cwd` value exists from which the project-local discovery root (`.pi/looms/`) and project `.pi/settings.json` ("resolved relative to the working directory" in `package-and-settings.md`) resolve before the first `resources_discover` event fires, but no spec surface supplies it: the factory receives only `pi`, `cwd` lives on `ExtensionContext` / `ExtensionCommandContext` (not passed to the factory), and the PIC-13 `FileSystem` seam exposes `homedir()` but no `cwd()` while banning direct `process.env` reads. Two conforming implementations therefore diverge on the initial factory-time scan — one reading `process.cwd()` directly, another emitting nothing project-local until `event.cwd` arrives — registering different initial loom sets and different `loomPaths` contributions on first startup.

## Solution approach

Add a `cwd(): string` member to the PIC-13 `FileSystem` interface block alongside `homedir()`, and clarify in the explanatory bullet list under it that `cwd()` is the source of truth for the factory-time project-local discovery root and project `.pi/settings.json` resolution. Rewrite step 1's "factory-captured `cwd`" reference and `package-and-settings.md`'s "resolved relative to the working directory" clause to point at the seam member. Pin the production `PiFileSystem.cwd()` value as captured once at construction.

## Solution constraints

- The runtime MUST still prefer `event.cwd` on every `resources_discover` event; the seam `cwd()` value governs only the factory-time project-local read, not the reload path.

## Relationships

- T12 "`pi.getCommands()` completeness at first `session_start` is an unstated presupposition" — same-cluster (sibling factory-time-vs-`session_start` presupposition on the same page; resolves independently)
- T14 "Binder model / `model:` resolution — registry-population timing" — same-cluster (parallel hidden-assumption pattern about host-side state being ready at a load-time boundary)

---
# T14 - Binder model / `model:` resolution — registry-population timing

**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The `loom/load/binder-model-unresolved` and `loom/load/model-unresolved` load-time refusals fire from a single load pass that calls `ctx.modelRegistry.getAvailable()` once and treats the returned set as authoritative, but the spec never states the temporal guarantee this depends on — that at the moment per-loom load resolution runs, `getAvailable()` returns the fully-populated model set the host will expose for this session rather than a partial or still-warming view. The Step 0 capability probe in `capability-probe.md` only `typeof`-checks `modelRegistry` / `getAvailable` presence, and the *Post-probe SDK-shape drift* paragraph covers shape drift, not late population. A Pi build that registers `ModelRegistry` synchronously but populates providers asynchronously would surface an empty or partial set to a `session_start`-time load pass, spuriously failing a loom whose `bind_model:` references a model that arrives a few ticks later; the hot-reload path is calibrated against operator intervention, so the loom stays unregistered until the next `/reload`. Comparable unpinned host-behaviour assumptions in this corpus carry an explicit presupposition note plus a corresponding line in the Pi version-bump editorial-review checklist, but this assumption is silent on both surfaces.

## Solution approach

Add a presupposition clause to `host-prerequisites.md`'s `degraded-state-host-prerequisites` enumeration pinning that the `getAvailable()` set returned to the per-loom load pass (for `bind_model:`, `looms.binderModel`, and `model:` resolution) is the fully-populated set the host will expose for the session, that resolution is one-shot with no retry on miss, and that a model arriving after the load pass leaves the affected loom load-failed until the next `/reload`. Add a forward-link from the `getAvailable()` mention near the `binder-model-parse-rule` anchor in `binder-model-and-context.md` to the new clause. Add the corresponding editorial-review item to the `version-bump-step2.md` checklist (currently items (a)–(j)) requiring the candidate Pi minor's `ModelRegistry` population sequence to be re-confirmed to populate before the first `session_start`-time load pass calls `getAvailable()`.

## Solution constraints

- Out of scope: the post-probe `getAvailable()` re-resolution for per-call binder-model handle reconstruction, governed by *Post-probe SDK-shape drift* coverage.

## Relationships

- T13 "Registration step 1 — factory-time working-directory source unstated" — same-cluster (parallel hidden-assumption pattern about host-side state being ready at a load-time boundary; resolves independently)
# T15 - Schema inference precedence — explicit ascription listed as last-checked but elsewhere defined as overriding

**Kind:** clarity
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The "Schema inference rules" subsection in `docs/spec_topics/query/query-forms.md` lists the four type contexts as a numbered list "checked in order", with the explicit `@<Schema>` ascription as item #4 (last). A first-match-wins reading of that ordering makes the binding annotation (item #1) win when both it and an explicit ascription are present. Two other passages contradict this: the "Schema inference algorithm" subsection ends with "An explicit `@<Schema>` ascription wins regardless of where it appears", and the "Explicit form" subsection states the explicit form wins over inference. The two readings select different response schemas for the same query — observable as the structured-output contract sent to the provider, the AJV-validated response type, and whether `loom/parse/explicit-schema-mismatch` fires — and the page's own normative test vectors presuppose the "ascription wins" reading.

## Solution approach

Restructure the "Schema inference rules" ordered list so it enumerates only the inference sinks and states the explicit `@<Schema>` ascription as an override above the list rather than as item #4. Rewrite the "Explicit form" subsection's "wins over inference" wording and the "Schema inference algorithm" subsection's trailing override sentence to cross-reference the single top-of-section override rule rather than independently re-asserting it.

## Solution constraints

- Out of scope: the `loom/parse/explicit-schema-mismatch` warning, its one-directional check, and the four normative test vectors in the "Explicit form" subsection — these remain unchanged.

## Relationships

None
# T16 - Indexed access on `string` receiver is unspecified

**Kind:** completeness
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/expressions.md` *Supported forms* lists indexed access (`a["b"]`, `a[0]`, `a[i]`) without restricting the receiver type, but receiver-specific behaviour is pinned only for `array<T>`, object, and `null` receivers (the `loom/runtime/index-out-of-bounds`, `loom/runtime/missing-object-key`, and `loom/runtime/null-index-access` codes). Nothing addresses `s[i]` on a `string` receiver: whether it parses, whether the result is a one-UTF-16-code-unit or a code-point `string`, and what out-of-bounds does are all undefined, and the `string` stdlib row exposes no indexed-access or `charAt`/`codePointAt` entry. Two conforming implementations can therefore diverge on the same source — one rejecting `s[i]`, others returning differently-defined values — violating *Source-language stability*.

## Solution approach

Narrow the indexed-access bullet in *Supported forms* to restrict the receiver to `array<T>` or an object schema. Add a parse-time diagnostic row to `docs/spec_topics/diagnostics/code-registry-parse.md` rejecting indexed access on receivers that are neither `array<T>` nor an object, modelled on the existing `loom/parse/non-array-iterand` row (whose hint already points authors to `s.split(...)` for strings). Add a forward-reference from the `string` stdlib row in `## Built-in methods and properties` to the new diagnostic.

## Solution constraints

- None.

## Relationships

- T18 "Ordering operators leave operand domain, string semantics, NaN, and the rejection diagnostic unspecified" — same-cluster (also asks the `string`-type surface to pin a missing semantic — orderability — but resolves independently of indexing)
- T17 "`-` and `*` lack a result-type rule" — same-cluster (sibling completeness gap in the same *Supported forms* list; independent fix)
- T20 "Logical and ternary operators leave short-circuit semantics and operand evaluation order unspecified" — same-cluster (sibling completeness gap in the same list; independent fix)
- T07 "Built-in methods — `string.replace` row missing conformance vectors" — same-cluster (touches the same `string` stdlib table; independent fix)
# T17 - `-` and `*` lack a result-type rule

**Kind:** completeness
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `## Other arithmetic` section in `docs/spec_topics/expressions.md` pins result types for `/` (always `number`) and `%` (preserves operand type), and the `+` operator paragraph above defines `+` as widening to `number` when either operand is `number`. Subtraction and multiplication get neither rule — their entry says only that they "accept only numeric operands." Whether `integer - integer` and `integer * integer` yield `integer` or `number` is therefore unstated, and the choice is observable: it affects admissibility into `integer`-typed sinks, array-literal LUB inference, and which diagnostic fires when the result flows into an `integer` binding. Two implementers reading the section pick different defaults (by analogy with `+`, `/`, or `%`) and produce divergent parse outcomes on the same source.

## Solution approach

Rewrite the `## Other arithmetic` paragraph in `docs/spec_topics/expressions.md` to state the result-type rule for `-` and `*` by direct analogy with the `+` paragraph above: the result is `integer` when both operands are `integer` and widens to `number` when either operand is `number`, via the `integer ⊑ number` widening in [Type System — Type compatibility](./type-system.md#type-compatibility) (rule 2). State that unary `-` applies the same rule to its single operand.

## Solution constraints

- None.

## Relationships

- T18 "Ordering operators leave operand domain, string semantics, NaN, and the rejection diagnostic unspecified" — same-cluster (same expressions page, same completeness gap pattern; the diagnostic-registry addition there is a precedent the `-`/`*` fix can mirror but the two fixes do not overlap textually)
# T18 - Ordering operators leave operand domain, string semantics, NaN, and the rejection diagnostic unspecified

**Kind:** completeness
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 4
**Shape:** single
**State:** reduced

## Problem

The Supported-forms entry for `<`, `<=`, `>`, `>=` in `expressions.md` introduces the ordering operators and the precedence table pins them at level 5 non-associative, but nothing else constrains them. Four cells are left open: which operand types are orderable (numeric, `string`, `boolean`, `null`, enums, unions, objects, arrays); whether and how `string` operands are ordered (code point vs UTF-16 code unit vs locale); what diagnostic rejects non-orderable or mixed pairs such as `1 < "a"` or `null < null` (the `loom/parse/*` registry has no comparison-operand code); and how ordering against `NaN` behaves, given the equality rule fixes `NaN == NaN` as `true`. Two conformant implementations diverge observably on whether `"abc" < "abd"` is accepted, under what substrate it runs, whether `1 < "a"` is a parse error, and whether `NaN < 1` is `false` or panics.

## Solution approach

Add a normative ordering-operators rule to `expressions.md` near the `Other arithmetic` section that pins the accepted operand domain (grounding orderability against the `integer ⊑ number` widening `+` already uses and the type-compatibility relation in `type-system.md`), the string-ordering substrate (grounding the choice against the existing UTF-16 commitment in `lexical.md`), and the NaN-ordering outcome (cross-referencing the equality rule in `runtime-value-model.md` to settle the equality/ordering asymmetry). Add a parse-diagnostic row for non-orderable and mixed-type operand pairs to the `loom/parse/*` table in `code-registry-parse.md`, modelled on `loom/parse/mixed-plus-operands`.

## Solution constraints

- Out of scope: the equality rule's `NaN == NaN` / signed-zero outcome in `runtime-value-model.md` is owned by T19 — cross-reference it, do not redefine it.

## Relationships

- T19 "Equality rule contradicts its own signed-zero example" — must-follow (the NaN-ordering rule cross-references the equality rule's `NaN == NaN` outcome; settle the equality rule first, then state this finding's "asymmetric with equality" framing against the resolved rule)
- T17 "`-` and `*` lack a result-type rule" — same-cluster (same expressions page, same completeness gap pattern; the diagnostic-registry addition here is a precedent the `-`/`*` fix can mirror but the two fixes do not overlap textually)
- T20 "Logical and ternary operators leave short-circuit semantics and operand evaluation order unspecified" — same-cluster (same Supported-forms list and completeness lens; resolves separately)
- T16 "Indexed access on `string` receiver is unspecified" — same-cluster (also pins an undefined `string`-receiver behaviour against the same UTF-16 substrate; resolves independently)
# T19 - Equality rule contradicts its own signed-zero example

**Kind:** clarity
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The Equality (`==`) primitive-comparison bullet in `runtime-value-model.md` defines structural deep equality via "`Object.is` semantics (so `NaN == NaN` is `true` and `+0 != -0` is `false`)", but the parenthetical contradicts the rule it illustrates: `Object.is(+0, -0)` is `false`, so under genuine `Object.is` semantics `+0 != -0` is `true`, the opposite of the stated example. The `JavaScript engine assumptions` section (`id="javascript-engine-assumptions"`) and `binder-inference.md`'s engine-assumption carve-out both lean on the same "`Object.is` semantics for primitive equality" phrase, so the contradiction is load-bearing rather than local. Two conforming implementations comparing values that can produce `-0` (e.g. `-1 * 0`, `1 / Infinity`) will take different `match` arms and emit divergent transcripts depending on which reading they follow.

## Solution approach

Rewrite the Equality (`==`) primitive-comparison bullet so the rule and its worked example agree: state the relation directly instead of via the `Object.is` shorthand, resolving `+0 == -0` as `true` to match the `-0`→`0` normalisation the rest of the page and the rendering pipeline already apply. Update the `JavaScript engine assumptions` section's `Object.is`-equality clause and `binder-inference.md`'s engine-assumption carve-out so the cited invariant matches the revised relation.

## Solution constraints

- None.

## Relationships

- T18 "Ordering operators leave operand domain, string semantics, NaN, and the rejection diagnostic unspecified" — must-precede (the ordering finding's NaN-asymmetry framing cross-references this equality outcome; resolve this rule first so the ordering rule can be stated against the settled relation)
# T20 - Logical and ternary operators leave short-circuit semantics and operand evaluation order unspecified

**Kind:** completeness
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/expressions.md` lists `&&`, `||`, and `cond ? a : b` as supported forms and pins their precedence, associativity, and boolean operand positions (`## Truthiness`), but never states whether the right operand of `&&` / `||` or the not-taken branch of `?:` is evaluated, nor the order in which operands are evaluated. This is observable behaviour: operands may be `@`-queries, tool calls, or `invoke` children that produce transcript entries, consume tokens, and perform irreversible writes that are never rolled back (per ERR-13 in `errors-and-results/error-model.md`). `cancellation.md`'s `**Granularity.**` rule already presumes a defined operand order (its `let x = f() + g()` example cancels `g` between `f()`'s return and `g()`'s pre-call checkpoint). Two conforming implementations — short-circuiting left-to-right versus evaluating both sides — would produce divergent transcripts, token spend, and cancellation behaviour for the same source.

## Solution approach

Add a normative rule to `docs/spec_topics/expressions.md` following the `## Truthiness` section that fixes operand evaluation as left-to-right and pins short-circuit semantics: `&&` and `||` evaluate the left operand first and skip the right when the result is already determined, and `cond ? a : b` evaluates `cond` first and then evaluates only the taken branch. State that `&&` / `||` always produce `boolean` (no JS last-truthy-operand widening), consistent with `## Truthiness`. Add a forward cross-reference to `cancellation.md`'s `**Granularity.**` rule so the operand-order dependency is discoverable.

## Solution constraints

- None.

## Relationships

- T18 "Ordering operators leave operand domain, string semantics, NaN, and the rejection diagnostic unspecified" — same-cluster (sibling gap in the same Supported forms list; resolved by independent edits)
- T16 "Indexed access on `string` receiver is unspecified" — same-cluster (another Supported forms omission; independent fix)
- T17 "`-` and `*` lack a result-type rule" — same-cluster (adjacent expressions.md omission; independent fix)
- T06 "`while` condition wording contradicts itself" — same-cluster (also concerns boolean-position operands; resolves independently)

---
# T21 - Enum declarations — duplicate variant names

**Kind:** completeness
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The "Enum declarations" section of `docs/spec_topics/schemas.md` and the parse diagnostic registry only address duplicate *explicit values* — `loom/parse/duplicate-enum-value` fires when two variants share an explicit string value. Duplicate variant *identifiers* with no explicit RHS (`enum X { Low, Low }`) are unaddressed: under the default "the variant name is the string value" rule both lower to `"Low"`, but the existing check is gated on explicit values and does not fire. Downstream behaviour is then undefined — whether the parser accepts or rejects, what the lowered JSON Schema looks like, and how `Enum.Variant` resolution behaves against same-named variants (`loom/parse/unknown-variant` covers absent names, not ambiguous ones). The same gap exists for duplicate names carrying distinct explicit values (`enum X { Low = "a", Low = "b" }`).

## Solution approach

Add a new parse-time diagnostic code `loom/parse/duplicate-enum-variant-name` that fires whenever two variants in the same `enum` share an identifier, regardless of explicit-value assignment. Insert its defining prose in schemas.md "Enum declarations" and its row in `docs/spec_topics/diagnostics/code-registry-parse.md` (severity `E`, phase `parse`, ref Schemas — Enum declarations). Specify that the name-duplication check runs before the value-duplication check, so both `enum X { Low, Low }` and `enum X { Low = "a", Low = "b" }` fail on the name collision rather than on an implicit-value collision.

## Solution constraints

- Do not change or remove `loom/parse/duplicate-enum-value`; it remains the diagnostic for the orthogonal case of distinct names colliding on an explicit value.

## Relationships

- T24 "Type grammar admits no generic application beyond `array<T>`" — same-cluster (touches Type/schema-grammar completeness in the same file area; resolved independently)
- T22 "BNDR-6 reference table cell uses `Pet::Cat { ... }` notation that the spec does not define" — same-cluster (also concerns variant-name handling but addresses discriminated-union object variants, not enums; no shared edit)
# T22 - BNDR-6 reference table cell uses `Pet::Cat { ... }` notation that the spec does not define

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The BNDR-6 reference-rendering table (`id="bndr-6"` in `docs/spec_topics/binder/defaulting-system-note-echo.md`) is normative byte-exact: conforming implementations MUST reproduce its renderings exactly. Its discriminated-union row spells the input value as `Pet::Cat { kind: "cat", name: "Whiskers" }`, but `::` is not part of the loom value sublanguage and no grammar production admits a `Type::Member` form. `grammar.md`'s `NamedObjectLit` discriminated-union note and its implicit-discriminator-field rule make even `Cat { kind: "cat", ... }` positively ill-formed, because the variant schema supplies the `kind` field implicitly. An implementer building this conformance fixture cannot construct the cited value as written.

## Solution approach

Rewrite the `Pet::Cat` row of the BNDR-6 table to a grammar-admitted `NamedObjectLit` constructor — the value is `Cat { name: "Whiskers" }` with the `kind` discriminator omitted, since the variant schema supplies it implicitly. In the same cell, declare the discriminated-union schema whose variant declares `kind` before `name`, so the normative `{cat, …}` render output stays reproducible.

## Solution constraints

- Out of scope: the inline-object-type row of the BNDR-6 table (the row whose value is an inline `{ ... }` object), owned by T23.

## Relationships

- T23 "Type grammar omits inline anonymous object types" — same-cluster (the row immediately below uses an inline-object value whose type production is itself ungrammatical per that finding; both touch BNDR-6's table but resolve independently)
- T21 "Enum declarations — duplicate variant names" — same-cluster (also concerns variant-name handling but addresses enums, not discriminated-union object variants; no shared edit)
