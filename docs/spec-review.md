# Triaged Spec Review - spec.md

_Generated: 2026-06-07T00:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T18) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 2 blocker, 15 high, 1 medium retained; 188 low discarded; 0 low findings merged into 0 medium findings; 91 nit dropped; 0 false dropped._

---

# T01 - `node_modules/` walk silently skips pnpm-isolated package entries

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The package-discovery walk's "immediate child directory" enumeration rule (the first **Per-package resolution** bullet in `package-and-settings.md`) classifies `node_modules/` (root #3) entries through the `FileSystem.lstat` seam, which PIC-13 (`host-interfaces-services.md`, anchor `pic-13`) specifies does NOT follow symlinks. Under pnpm's default isolated layout the top-level `node_modules/` entries are symlinks (`lstat` reports `isSymbolicLink()` true and `isDirectory()` false), so under the literal "immediate child directory" rule they are neither candidate packages nor scope directories and contribute zero looms. The spec is silent on this case — it does not direct realpath-classification, scope `node_modules/` to non-pnpm layouts, or register a diagnostic — so one implementer silently drops every pnpm loom while another who follows symlinks finds those packages resolved under `.pnpm/`, with divergent containment (`loom/load/manifest-escapes-package`) and cross-source dedup behaviour, both claiming conformance. The four sibling roots are unaffected because `pi install` populates them with real directories.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Clarify the `node_modules/` root (#3) enumeration in `package-and-settings.md` to pin that entries whose `lstat` reports `isSymbolicLink()` true are filtered out silently — the walk does not follow symlinks, so pnpm's default isolated layout (`node_modules/<pkg>` as a symlink into `node_modules/.pnpm/…`) is out of scope for this root. Name the recourse so the out-of-scope band is actionable: pnpm projects install via `pi install` (root #1 or #4) or use pnpm's hoisted node-linker mode.

## Solution constraints

- Out of scope: the `@`-scope-directory candidate-enumeration rewrite of the same `node_modules/` walk, owned by T02.
- Out of scope: changing PIC-13's `lstat` / `realpath` member contracts in `host-interfaces-services.md`, or introducing realpath-classification of `node_modules/` entries — the clarification rests on the existing `lstat` no-follow semantics.

## Relationships

- T02 "Package-discovery candidate-enumeration rule stated two contradictory ways" — same-cluster (both touch the `node_modules/` root's candidate-enumeration walk; symlink classification vs scoped-package unwrapping; resolve independently)
# T02 - Package-discovery candidate-enumeration rule stated two contradictory ways

**Kind:** clarity
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/discovery/package-and-settings.md` § "Package discovery" defines what counts as a "candidate package" twice, with conflicting answers. The intro sentence under **Roots scanned** treats every immediate child whose `package.json` parses as a candidate — which silently drops `@scope` directories (they carry no `package.json`), making every loom under any `@scope/pkg` invisible. The first bullet under **Per-package resolution** instead unwraps `@`-prefixed children one level as scope directories and reads `@scope/pkg/package.json`. The two rules diverge for npm's standard scoped-package layout, which routinely appears in `node_modules/` and `~/.pi/agent/npm/`; the enumeration rule is also structurally misplaced inside the body of the loop that opens "For each candidate package:".

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Rewrite the intro candidate-enumeration sentence under **Roots scanned** so it states the scope-aware rule (`@`-prefixed children are scope directories whose own immediate children are the candidates) as the single definition of what counts as a candidate package. Delete the contradicting first bullet of **Per-package resolution** (the "For each root in the priority list above…" bullet) so the loop body describes only per-package behaviour, leaving the `disc-5` bullet and the remaining `pi.looms`-resolution bullets intact.

## Solution constraints

- Out of scope: symlink / pnpm-isolated entry classification in the same discovery walk (owned by T01).

## Relationships

- T01 "`node_modules/` walk silently skips pnpm-isolated package entries" — same-cluster (same enumeration walk, but concerns symlink classification rather than `@scope` unwrapping; resolve independently)
# T03 - SNK-j and SLSH-5 give contradictory rendering rules for `invoke_callee`

**Kind:** testability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

In `docs/spec_topics/slash-invocation.md`, the SNK-j row of the SLSH-4 per-`kind` table (`id="snk-j"`) prescribes a literal template keyed on `kind == "invoke_callee"` that renders `<inner.kind>` from the immediate `inner` field. SLSH-5 ("Chain attribution", `id="slsh-5"`) fires for the same `invoke_callee` case and overrides row selection: it computes the descriptive text from the **leaf** `kind` (the innermost non-`invoke_callee` variant) plus a leaf-first chain suffix, so SNK-j's standalone template has no reachable case. Because SLSH-4 permits conformance tests to assert on the exact rendered string, an implementer or test author cannot satisfy both rules for any `invoke_callee` cascade.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Rewrite the SNK-j row's template cell in `docs/spec_topics/slash-invocation.md` so it defers to SLSH-5 as the sole authority for `invoke_callee` rendering rather than carrying a standalone template. Keep `invoke_callee` represented as one of the table's nine variants.

## Solution constraints

- Preserve the `id="snk-j"` anchor and `SNK-j.` label so existing inbound citations (conformance leaves, coverage-matrix entries) still resolve.

## Relationships

None
# T04 - Empty-template warning's `\n`-escape suppression clause is self-contradictory and the "intentionally-blank prompt" path is unreachable

**Kind:** clarity
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The parse-time `loom/parse/empty-template` warning in `query-forms.md` § *Degenerate rendered templates* (`#degenerate-rendered-templates`) fires when a template's static body is whitespace-only per System-note rendering rule 1, then promises authors can suppress it "by writing an explicit literal escape (`\n`)". But rule 1's ASCII whitespace set (in `defaulting-system-note-echo.md`) enumerates U+000A, so a `\n`-only body is still whitespace-only under the warning's own predicate — the suppression promise can never be satisfied. The companion `loom/parse/empty-template` Action text in `code-registry-parse.md` repeats the same advice ("Add literal text or use `\\n` to keep an intentionally-blank prompt"). Independently, the runtime short-circuit (`query-forms.md` runtime-short-circuit bullet; `queryerror-variants.md` `empty_template` arm) refuses any fully-rendered turn that is whitespace-only with `ValidationError { cause: "empty_template" }`, so the "intentionally-blank prompt" use case the escape would unlock is also unreachable downstream.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Rewrite the suppression sentence in the parse-time warning bullet of `#degenerate-rendered-templates` to state that no suppression escape exists — a whitespace-only static body is non-deliverable per the runtime short-circuit, so the warning always flags a programming defect. Rewrite the `loom/parse/empty-template` Action column in `code-registry-parse.md` to direct authors to add literal text and to cross-reference the `empty_template` non-deliverability rather than offer the `\n` escape.

## Solution constraints

- Out of scope: the System-note rendering rule 1 ASCII whitespace set in `defaulting-system-note-echo.md` and the `empty_template` runtime arm in `queryerror-variants.md` — both are correct, and the fix must not alter the warning predicate or the runtime contract to manufacture a suppression path.

## Relationships

None
# T05 - `ContextOverflowError` carries `raw_response` in prose but not in its schema

**Kind:** error-model
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The detection rule in `query-failure-and-repair.md` § *Detection of `ContextOverflowError`* specifies that a streamed response truncated at the output boundary is classified as `context_overflow` "with `raw_response` set to the partial text", and the § *Notes* cross-variant paragraph in `queryerror-variants.md` positively claims both `cancelled` and `context_overflow` admit a (rarely-populated) `raw_response`. But the canonical `ContextOverflowError` schema declares only `kind`, `message`, `tokens_used`, and `tokens_limit` — no `raw_response` — and `CancelledError` declares only `kind` and `message`. A conforming implementation cannot set a field its schema does not declare, and an exhaustive consumer destructuring `ContextOverflowError` would never see the partial-text payload the detection prose promises. Two implementers diverge: one honours the prose and fails the variant's own schema-shape assertion, the other honours the schema and discards the partial stream the detection rule captured.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Reconcile the schema to the detection prose. Add a `raw_response: string | null` field to the `ContextOverflowError` schema in `queryerror-variants.md`, following the `ToolLoopExhaustedError` precedent for the field's shape and null semantics. Rewrite the § *Notes* cross-variant `raw_response` paragraph so it states `context_overflow`'s populated-vs-null condition and drops the `cancelled` claim. The detection-rule clause in `query-failure-and-repair.md` already matches this shape and needs no change.

## Solution constraints

- `CancelledError`'s schema must not gain a `raw_response` field — its firing path holds no partial assistant text the runtime is positioned to surface.

## Relationships

None
# T06 - `SHUTDOWN_AWAIT_CAP_MS` window: captured `deadline` is dead, and the "absolute, not a refreshing slide" guarantee contradicts the relative `Clock.setTimeout` schedule

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Sub-step 3 ("Await subagent disposal") of the `session_shutdown` teardown in `docs/spec_topics/pi-integration-contract/patch-skew-degradation.md` captures `deadline = Clock.now() + SHUTDOWN_AWAIT_CAP_MS` at handler entry but then schedules `Clock.setTimeout(SHUTDOWN_AWAIT_CAP_MS, …)`, which — per PIC-12's relative `setTimeout(fn, ms)` seam — starts a fresh full window from the moment sub-step 3 runs. The captured `deadline` is therefore never read, and a slow sub-step 2 *does* extend the await, contradicting the same sub-step's "absolute, not a refreshing slide" sentence. Two reasonable implementers diverge: an absolute-deadline reader schedules the remaining budget while a literal-schedule reader grants a fresh 2000 ms, producing different teardown timings and different `<ms>` payloads at the `loom/runtime/reload-teardown-timeout` boundary.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Rewrite sub-step 3's bounded-await schedule in `patch-skew-degradation.md` so the `Clock.setTimeout` delay is computed from the captured `deadline` (the time remaining, `deadline - Clock.now()`) rather than the literal `SHUTDOWN_AWAIT_CAP_MS`, making the schedule consistent with the "absolute, not a refreshing slide" guarantee and consuming the otherwise-dead `deadline`. Leave the `<ms>` definition (`Clock.now() - start`) in `code-registry-runtime.md`'s `loom/runtime/reload-teardown-timeout` row unchanged — it already matches the absolute-deadline model.

## Solution constraints

- The computed `Clock.setTimeout` delay MUST be clamped to a non-negative value — PIC-12 leaves negative-`ms` behaviour unpinned.

## Relationships

None
# T07 - Subagent transcript-discard presupposition is stated but not routed to the bump checklist

**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** true
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The subagent-mode privacy guarantee — that the in-memory session's transcript stays private to the loom and is discarded when the loom returns — is a load-bearing presupposition on Pi's `SessionManager.inMemory(cwd)` behaviour, and the loom asserts no independent behavioural check on it. Capability item 3 (`#sdk-cap-subagent-isolated-session` in `capability-inventory-items.md`) records this as an "accepted risk … on the same footing as the others audited under item (o)", but item (o) of the `version-bump-step2.md` editorial-review checklist confirms only the `inMemory` factory signature, not the no-persistence behaviour. Unlike every other unpinned host presupposition, the transcript-non-retention property has no dedicated `(a)`–`(ai)` checklist row, so a Pi minor that preserved the signature while persisting the transcript would go uncaught at bump time. The page's closing meta-rule — any presupposition routing its detection to editorial review MUST be added to the checklist in the same edit — is therefore violated, and the "same footing" claim is not literally true.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Add a new editorial-review checklist item to `version-bump-step2.md` covering the transcript-non-retention behavioural property of `SessionManager.inMemory(cwd)`, alongside item (o)'s `#bump-checklist-subagent-spawn-satellite-types` signature audit, describing a SHOULD-level audit task that reads the in-memory branch's JS body against the `#bump-baseline-acquisition` extract to confirm transcript discard rather than persistence, with the same `pass`/`fail`/`N/A`/`not-performed` recording semantics the other `(f)`–`(ai)` rows use. Add a forward-link from item (o) to the new row and forward-anchor capability item 3 from it. Rewrite capability item 3's trailing accepted-risk sentences in `capability-inventory-items.md` to forward-link the new checklist row instead of recording an unrouted accepted risk. Update the intro paragraph's `items (a)–(e)` and `items (f) through (ai)` range literals to reflect the added item.

## Solution constraints

- The detection routing is editorial review at bump time only — do not add a runtime behavioural probe or any loom-side independent check of in-memory transcript persistence.

## Relationships

None
# T08 - GOV-15 source-language equivalence and DIAG-2/3/4 closed-registry rules do not reconcile whether diagnostic-registry edits are admissible within loom 1.x

**Kind:** completeness
**Importance:** high
**Score:** 100
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

GOV-15 (`#gov-15` on `governance/source-language-stability.md`) pins three observables that loom 1.x releases MUST preserve for every input that loads cleanly under loom 1.0.0 — return values, ordered diagnostic-code sequences (b), and equivalent `loom-system-note` content (c) — and its carve-out list is explicitly closed at loom 1.0.0 with only the ceiling-set carve-out enumerated. DIAG-2/3/4 (`#diag-2`, `#diag-3`, `#diag-4` on `diagnostics/diagnostic-shape.md`) classify code add/remove/namespace-severity-trigger changes, renames, and *Message*-wording edits as "spec changes" / "breaking changes" but never name which spec version absorbs them. Because the diagnostics registry is not named in GOV-15's closed carve-out list, the consistent reading is that any DIAG-2/3/4-class edit is a GOV-15(b)/(c) violation on the inputs it touches — freezing the registry for the lifetime of loom 1.x, which contradicts DIAG-2's own contemplation of future code additions. Conformance reviewers running the GOV-15 release-inspection step have no rule to apply when a diff adds, renames, or rewords a registry entry.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Reconcile the two rule sets so DIAG-2/3/4-class registry edits have a defined GOV-15 disposition. The directional fit mirrors the existing ceiling-set carve-out: add a diagnostic-registry carve-out to GOV-15 on `source-language-stability.md` with its own anchor and an attribution test whose in-scope input set distinguishes per operation (a code addition is in-scope for inputs that did not previously emit the code; a removal is in-scope for inputs that did), and add a back-pointer cross-reference from each of DIAG-2/3/4 naming when the classification resolves to a loom 1.x minor versus loom 2.0. Update GOV-15's closing "closed at loom 1.0.0" sentence to enumerate two carve-outs.

## Solution constraints

- GOV-30 lock-step: growing GOV-15's carve-out list requires updating the `spec/overview-and-orientation.md#source-language-stability` aggregator bullet in the same change.

## Relationships

None
# T09 - `SM-N` orientation tokens trip the GOV-3 / GOV-16 unknown-prefix closure invariant

**Kind:** traceability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The Session Model orientation in `docs/spec/session-model-and-appendix.md` defines obligations spelled `SM-1` … `SM-8` (with sub-letter variants such as `SM-3a`, `SM-7c`). The uppercase prose form matches GOV-3's REQ-ID detector grammar `\b[A-Z]{2,4}-[1-9][0-9]*\b`, yet the `SM` prefix is registered in neither the live nor the retired REQ-ID prefix tables nor the GOV-16 inline-label registry. GOV-23 (`gov-23` on `governance/anchor-scheme-and-retired.md`) carves out only the lowercase page-local anchor slugs (`sm-N-…`) as "not REQ-IDs and not inline labels"; it never names the uppercase prose tokens. Consequently every in-scope `spec_topics` reference to `SM-N` — including occurrences in GOV-23's own body, `future-considerations/model-changes-and-non-goals.md`, and several `pi-integration-contract` pages — violates GOV-3's *Unknown-prefix closure invariant* and GOV-16's widened extension, which admit only the two registered identifier classes.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Extend GOV-23 (`gov-23`) so its carve-out binds the uppercase prose form `SM-N` (and its sub-letter variants) as an orientation-only third class with no anchor contract, lifecycle, or registry entry. Amend the *Unknown-prefix closure invariant* in `req-id-prefix-table-active-a.md` (GOV-3) and the *Inline-label grammar and closure invariant* in `stable-inline-labels.md` (GOV-16) to admit `SM` as a named closed exception. Rewrite the in-scope `spec_topics` references to `SM-N` — including GOV-23's own body — as citations to the owner anchor in `spec.md`'s Session Model section rather than bare prose tokens.

## Solution constraints

- Do not register `SM` as a REQ-ID prefix (no GOV-7 *Add* row in the prefix table) or as a GOV-16 inline-label prefix; the `SM-N` tokens remain an orientation-only label class, not a fourth registered class.

## Relationships

None
# T10 - Array-construction sink set restated in `expressions.md` as an open-ended list, contradicting `grammar.md`'s exhaustive four-member declaration

**Kind:** clarity
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`grammar.md`'s "`array<T>` literal type-sink rule" section declares the type-sink set exhaustive with four members, including the recursive-descent case. `expressions.md`'s "Array construction" section re-states the set twice — the intro paragraph lists three members closed-form, rule 1 lists two members plus an open-ended "etc." — and neither restatement agrees with `grammar.md` or with the other. Both omit the recursive-descent member, and the "etc." invites readers to invent sinks `grammar.md` explicitly excludes (e.g. the `for` iterand). The divergence is parse-time observable: it changes which array literals raise `loom/parse/array-no-common-type`.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Rewrite both restatements in `expressions.md`'s "Array construction" section — the intro paragraph and rule 1 — to defer to `grammar.md`'s closed type-sink set via cross-reference rather than re-enumerate it inline, dropping the parenthetical member lists and the "etc." so `grammar.md` stays the single source of the sink set. If the `grammar.md` heading's auto-slug does not resolve as a stable link target, add an explicit anchor at that heading.

## Solution constraints

- Out of scope: the exhaustive type-sink set list and the `for`-is-not-a-sink exclusion in `grammar.md` — it is the authoritative single source; do not edit the list or migrate it into `expressions.md`.

## Relationships

None
# T11 - "type-like binding" is an undefined catch-all in the PascalCase casing rule

**Kind:** clarity
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The PascalCase entry in lexical.md's `**Identifiers.**` bullet requires an uppercase first letter for `schema` names, `enum` names, `enum` variant names, "and any user identifier introduced as a type-like binding" — but "type-like binding" is undefined: it is not a glossary term, no shard defines it, and the three explicit forms appear to exhaust the surface a reader can derive from the bullet. The one binding surface that genuinely escapes the three forms is import/re-export aliases for type-like symbols (`import { Author as Reviewer } from "./personas.warp"` and the `export { … as … } from` re-export form), which introduce a fresh user identifier that plays the role of a named type but whose casing requirement is unstated. Two implementers can reasonably disagree on whether `import { Author as reviewer }` is a parse error today. The `loom/parse/schema-case-mismatch` row in code-registry-parse.md describes the same surface as "schema / enum / variant / type-alias position", so its trigger set must agree with whatever lexical.md enumerates.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Rewrite the PascalCase bullet in lexical.md's `**Identifiers.**` list to replace "and any user identifier introduced as a type-like binding" with a closed enumeration of the binding sites that require PascalCase, adding the rebinding identifier in `import { … as Ident } from ".warp"` and `export { … as Ident } from ".warp"` whose source symbol resolves to a `schema` or `enum`, alongside the existing schema/enum/variant names. Update the `loom/parse/schema-case-mismatch` trigger description in code-registry-parse.md so it covers the import/export alias positions. Add forward-links from imports.md's `**Re-exports.**` and `**Name collisions.**` paragraphs to the lexical casing rule.

## Solution constraints

- None.

## Relationships

- T12 "`NamedObjectLit` field rules contradict the implicit-discriminator rule and leave explicit-discriminator writes undiagnosed" — same-cluster (different lexical/grammar correctness defect in the same shard; resolves independently)
# T12 - `NamedObjectLit` field rules contradict the implicit-discriminator rule and leave explicit-discriminator writes undiagnosed

**Kind:** testability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The "Field rules" in `docs/spec_topics/grammar.md` § "Object literals" state two rules that cannot both hold for a discriminated-union variant constructor: "every declared field … MUST be present" (omissions are `loom/parse/missing-object-field`) and "discriminator fields … are implicit". For a variant whose declared fields include the discriminator, `Cat { name: "Whiskers" }` is simultaneously well-formed under the implicit rule and ill-formed under the field-presence rule, while `Cat { species: "cat", name: "Whiskers" }` satisfies field-presence but violates the implicit rule with no named diagnostic, message, or severity. The discriminator diagnostics in `docs/spec_topics/schemas.md` § "Discriminated unions" do not cover an author writing the discriminator at a variant construction site, so a conforming parser cannot derive a deterministic oracle for either example.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Clarify the field-presence bullet in `grammar.md` § "Object literals" "Field rules" so the implicit discriminator field is a stated exception to the every-declared-field-MUST-be-present rule. Make the implicit-discriminator bullet normative and add a named `loom/parse/*` diagnostic for writing the discriminator explicitly at a variant constructor, composing with the discriminator-diagnostic vocabulary in `schemas.md` § "Discriminated unions". Resolve whether the diagnostic scope is `NamedObjectLit` only or also `BareObjectLit`, and whether it fires independent of whether the supplied discriminator value matches.

## Solution constraints

- The new normative rule and diagnostic strengthen normative-modal content on a non-narrative page (`grammar.md`); per GOV-22 the same commit MUST coin a `GRAM-N` REQ-ID anchor at the obligation site (the "Field rules" section carries none today).

## Relationships

- T11 "\"type-like binding\" is an undefined catch-all in the PascalCase casing rule" — same-cluster (other lexical/grammar correctness defect in the same shard; resolves independently)
# T13 - Equality classification puts `Severity.Low == "low"` in the wrong branch and contradicts the wire-translation paragraph

**Kind:** clarity
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `#equality` section of `runtime-value-model.md` classifies `Severity.Low == "low"` two contradictory ways. The first paragraph of the **Equality (`==`)** section places this case under "share one static type", routing it to the per-shape rules below — but a `Severity` enum variant and a bare `string` are not one static type, and no per-shape rule pairs an enum variant with an untagged string (the *Enum variants* bullet requires both operands to carry the declaring-enum tag). The *Inbound* bullet of **Wire-name translation** gives the opposite disposition — cross-type branch, evaluates to `false` — and cites "the equality rule above", reading as a citation of the very paragraph that claims not to apply. An implementer cannot tell whether the cross-type branch, a new per-shape rule, or some broader structural-ground notion governs the comparison.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Rewrite the first paragraph of the **Equality (`==`)** section (`#equality`) so `Severity.Low == "low"` is governed by the cross-type branch rather than the per-shape rules. Remove the "share one static type … e.g. `Severity.Low == "low"`" clause, and add the enum-vs-anonymous-union-string case to the cross-type-branch example list (alongside `42 == true`, `Severity.High == 3`, `[1] == 1`, `null == "x"`), stating that an enum variant and an anonymous string-literal-union position are different static types even when their wire forms coincide. Leave the *Inbound* **Wire-name translation** bullet's "remain `false` per the equality rule above" sentence in place, now pointing unambiguously at the cross-type branch.

## Solution constraints

- `Severity.High == OtherEnum.High` (cross-enum, both operands tagged) MUST remain governed by the per-shape *Enum variants* bullet; only enum-vs-bare-string moves to the cross-type branch.

## Relationships

- T15 "`Result` in wire-positions has neither a lowering nor a rejection" — same-cluster (sibling defect in the same `runtime-value-model.md` section; both touch the inbound translation pass but resolve independently)
# T14 - Lowered JSON array element order is unpinned and breaks schema-slug determinism

**Kind:** prescription
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`schema-subset.md` § *Canonical schema hash* step 2 (Canonical form) pins object-key ordering and numeric-literal rendering for the byte sequence the schema slug is hashed from, but says nothing about the element order of arrays inside the lowered fragment. Several subset-admissible keywords carry array values that feed the SHA-256 input directly: the `{"type": [...]}` primitive-union form, `enum`, object `required`, and `anyOf`. Two conforming implementations that emit the same JSON Schema with different array orderings therefore produce different schema slugs — and so different `__inline_<slug>`, `__loom_respond_<slug>`, `__loom_callee_<slug>__…`, and `__loom_bind_<slug>` names and AJV cache keys — silently breaking step 2's contract that fragments which lower identically produce the same slug. The Object emission rule in § *Lowering Algorithm* step 3 pins property order to loom-source declaration order, but no parallel rule covers these array-valued positions.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

In § *Lowering Algorithm* step 3, extend the loom-source-declaration-order rule that currently governs object `properties` to fix the element order of every array-valued emission position the subset admits — the `{"type": [...]}` primitive-union form (with `null` last when the union includes it), `enum`, `required`, and `anyOf`. In § *Canonical schema hash* step 2, add a canonical-form bullet stating that array elements are preserved in the order fixed by the Lowering Algorithm and are not reordered by the canonical-form recipe, mirroring the existing note that key sorting is independent of emitted property order.

## Solution constraints

- None.

## Relationships

- T16 "`Result<T, E>` admissible in lowered-schema positions with no lowering rule and no rejection" — same-cluster (another lowering-algorithm gap in the same canonical-hash input contract; resolves independently)
# T15 - `Result` in wire-positions has neither a lowering nor a rejection

**Kind:** assumptions, implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The grammar's `**Generic-application constructors.**` paragraph admits `Result<T, E>` in every `Type` position as part of the closed `{array, Result}` constructor set, including schema field types, `params:` field types, and `array<T>` element types. Two downstream surfaces fail to dispose of this admissibility: the Lowering Algorithm in `schema-subset.md` (step 3) enumerates an emission rule for every other type form but has no `Result` case, and `code-registry-parse.md` registers no diagnostic rejecting `Result` in a schema-feeding position (unlike `loom/parse/void-in-non-return-position` for `void`). The `Result<T, E>` row of `runtime-value-model.md` asserts that `Result` values "cross the wire only via schema-driven encodings defined by the relevant call site," but no such call-site encoding is defined anywhere in the corpus. An implementer cannot tell whether `schema R { outcome: Result<integer, string> }` is a parse error, a lowering obligation, or silently accepted with implementation-defined wire bytes — and the resulting schema-slug divergence corrupts every content-addressed surface keyed by the canonical schema hash.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Register a new parse diagnostic `loom/parse/result-in-schema-position` in `code-registry-parse.md`, modelled on the `loom/parse/void-in-non-return-position` row, rejecting `Result` in schema field types, `params:` field types, and any type reachable transitively from them (including `array<T>` element types and union arms). Add a position-restriction sentence to grammar.md's `**Generic-application constructors.**` paragraph, parallel to the existing `void` restriction, naming the rejecting diagnostic. Rewrite the `Result<T, E>` row of `runtime-value-model.md` to drop the unbacked "schema-driven encodings defined by the relevant call site" clause and state instead that `Result` values are observed only by loom code and never appear in a lowered schema.

## Solution constraints

- Resolve by parse-time rejection: do not add a `Result` emission case to `schema-subset.md`'s Lowering Algorithm step 3.

## Relationships

- T16 "`Result<T, E>` admissible in lowered-schema positions with no lowering rule and no rejection" — co-resolve (the same gap surfaced from `schema-subset.md`; one edit closes both)
- T13 "Equality classification puts `Severity.Low == \"low\"` in the wrong branch and contradicts the wire-translation paragraph" — same-cluster (also lives in `runtime-value-model.md`'s translation pass; resolves independently)
# T16 - `Result<T, E>` admissible in lowered-schema positions with no lowering rule and no rejection

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

`grammar.md`'s type grammar admits `Result<T, E>` in every `Type` position, including schema field types, `params:` field types, `array<T>` element types, and union arms — positions that feed `schema-subset.md`'s Lowering Algorithm step 3. Step 3 enumerates an emission rule for every other type form but has no case for `Result`, and no parse-time diagnostic rejects `Result` when it appears in a lowered-schema position (e.g. `schema Foo { x: Result<integer, QueryError> }`). An implementer cannot decide whether such a source is a parse error or a lowering bug, and `runtime-value-model.md` already disclaims any direct wire shape for `Result`. The divergence corrupts content-addressed schema-slug identity (it feeds `__inline_<slug>`, `__loom_respond_<slug>`, and the validator cache), not just the immediate validation result.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Extend `grammar.md`'s `void`-exclusion paragraph (alongside the `Generic-application constructors` note pinning the closed `{array, Result}` set) with a parallel rule that rejects `Result` wherever it appears, directly or transitively, in a lowered-schema position — schema field types, `params:` field types, and any type reachable from those, including `array<T>` element types and union arms. Add a sentence to `schema-subset.md`'s Lowering Algorithm step 3 stating that `Result<T, E>` is not a lowerable type form and is rejected before the lowering pass. Register a new `loom/parse/*` diagnostic in `docs/spec_topics/diagnostics/code-registry-parse.md` for the rejected positions.

## Solution constraints

- `Result` MUST remain admissible in its language-surface positions (`fn` parameter and return types, `let` annotations, generic arguments outside lowered-schema positions, `invoke<Type>` / type-ascription contexts, and `@`-query result observation); only lowered-schema positions are rejected.

## Relationships

- T15 "`Result` in wire-positions has neither a lowering nor a rejection" — co-resolve (the same gap surfaced from `runtime-value-model.md`; one edit closes both)
- T14 "Lowered JSON array element order is unpinned and breaks schema-slug determinism" — same-cluster (another lowering-algorithm gap; resolves independently)
- T17 "`<ctor>` placeholder is unenumerated in the closed rendering surface" — same-cluster (both turn on the closed `GenericType` constructor set `{array, Result}`; independent fix)
# T17 - `<ctor>` placeholder is unenumerated in the closed rendering surface

**Kind:** implementability
**Importance:** blocker
**Score:** 200
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

The closed placeholder-rendering surface defined by the **Closure** clause in `docs/spec_topics/diagnostics/placeholder-rendering-a.md` admits only placeholders enumerated in categories 1–7, §8 placeholders, or four explicitly-named carve-outs, and enforces this at build time. The `<ctor>` token in the `loom/parse/generic-arity-mismatch` row of `docs/spec_topics/diagnostics/code-registry-parse.md` is enumerated in none of those categories and is not a carve-out, so the build-time closure check rejects the row. The token also carries no defined rendering rule, leaving the byte-identicality contract over the row undefined and free for two conformant implementations to disagree.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Enumerate `<ctor>` in category 7 (*Identifier-, descriptor-, and closed-enum placeholders*) of `docs/spec_topics/diagnostics/placeholder-rendering-b.md`, adding it to the section's **Placeholders** list and to the **Closed-enum** sub-list with the closed value set `{array, Result}`. Cross-reference grammar.md's *Generic-application constructors* paragraph as the source of truth for that set so its existing GOV-7/GOV-8 closed-enum versioning posture governs future widening.

## Solution constraints

- None.

## Relationships

- T16 "`Result<T, E>` admissible in lowered-schema positions with no lowering rule and no rejection" — same-cluster (both reference the closed `GenericType` constructor set `{array, Result}`; independent fix)
# T18 - Step 0(d) peer-dep version read collides with the audit's non-exemptible CJS-reach prohibition

**Kind:** implementability
**Importance:** blocker
**Score:** 200
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

Step 0(d) of the capability probe (`capability-probe.md`, the *(d) Peer-dep version* check) normatively pins the per-peer version read as `createRequire(import.meta.url).resolve("<pkg>")`, and the probe lives in `src/`, so it is in the audit's scope. The inventory-closure audit's CJS-reach clauses (ii) and (iii) (`audit-target-categories.md`, anchor `audit-recognised-shapes`) plausibly classify that `.resolve` call as a prohibited family-(4) shape under either the clause-(ii) `createRequire`-indirection reading or the clause-(iii) catch-all, and family (4) is non-exemptible with only delete and rewrite-shape resolution arms (`audit-failures.md`, anchor `audit-failure-surface-contract`). The inventory-closure audit's land-green precondition (`inventory-audit-intro.md`, anchor `sdk-cap-inventory-closure-audit`) forbids a first run that is red on `main`. A literal-faithful Step 0(d) implementation therefore makes the first audit run red on four family-(4) records with no permitted resolution arm short of editing the spec.

## Issue introduction

**Verdict:** indeterminate
**Introducing commits:** none identified
**History:** Issue-introduction analysis was not available for this finding.

## Solution approach

Clarify the CJS-reach clauses (ii)/(iii) in `audit-target-categories.md` (anchor `audit-recognised-shapes`) so the prohibition fires on the module-load form (the require function called with an in-scope specifier, returning the module's exports) and explicitly excludes the resolution form `<require>.resolve("<specifier>")`, which returns a filesystem path string and performs no module load. Pin that the exclusion holds regardless of how `createRequire` is imported, on the same footing as the existing aliased/namespace-import enumeration, and tighten clause (iii)'s catch-all verb so it does not silently re-capture `.resolve`. Decide whether to also demote Step 0(d)'s `createRequire(...).resolve(...)` mechanic to the existing non-normative *Recommended recipe* (anchor `step-0-d-recommended-recipe`) so a later swap to `import.meta.resolve` stays open.

## Solution constraints

- The carve-out applies only to the resolution form `<require>.resolve("<specifier>")`; the module-load form `<require>("<specifier>")` reaching one of the four peer packages or `typebox` MUST remain prohibited under family (4).

## Relationships

None
