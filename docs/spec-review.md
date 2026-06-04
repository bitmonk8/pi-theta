# Triaged Spec Review - spec

_Generated: 2026-06-04T17:12:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T22) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker + 9 high, 8 medium retained; 19 low discarded; 13 low findings merged into 3 medium findings; 3 nit dropped; 0 false dropped._

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
