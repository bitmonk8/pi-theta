# Triaged Spec Review - spec.md

_Generated: 2026-06-07T00:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T18) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 1 blocker, 0 high, 8 medium, 0 low retained; 197 low discarded; 0 low findings merged into 0 medium findings; 91 nit dropped; 0 false dropped._

---

# T01 - `node_modules/` walk silently skips pnpm-isolated package entries

**Kind:** assumptions
**Importance:** medium
**Score:** 15
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
**Importance:** medium
**Score:** 15
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
# T05 - `ContextOverflowError` carries `raw_response` in prose but not in its schema

**Kind:** error-model
**Importance:** medium
**Score:** 25
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
# T07 - Subagent transcript-discard presupposition is stated but not routed to the bump checklist

**Kind:** assumptions
**Importance:** medium
**Score:** 35
**Must-fix:** false
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
**Importance:** medium
**Score:** 25
**Must-fix:** false
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
# T14 - Lowered JSON array element order is unpinned and breaks schema-slug determinism

**Kind:** prescription
**Importance:** medium
**Score:** 25
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
**Importance:** medium
**Score:** 25
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
# T16 - `Result<T, E>` admissible in lowered-schema positions with no lowering rule and no rejection

**Kind:** implementability
**Importance:** medium
**Score:** 25
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
