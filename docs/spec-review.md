# Triaged Spec Review - spec

_Generated: 2026-06-04T03:10:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T22) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 8 high, 9 medium retained; 13 low discarded; 16 low findings merged into 6 medium findings (plus one co-resolve merge of two high findings); 4 nit dropped; 0 false dropped._

---

# T01 - Operator-bound MUSTs mis-classified as runtime conformance requirements

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Three normative-modal `MUST` sentences bind *operators* (or operator-tooling authors) rather than the loom runtime, so they cannot anchor any conformance test of the implementation. Two sit in the **Runtime event channel** section of `pi-integration-contract.md`: the `display: false` gating paragraph's *"Operators MUST treat all `loom-system-note` content … as durable session-context input"*, and the *Engine-assumption carve-out* paragraph's *"Operators MUST treat a missing terminal event as one of (a)/(b)/(c)"* — the latter admits in the same sentence that no in-band signal distinguishes (a) from (c), making the obligation unfalsifiable by construction. The third is the closing operator-directed `MUST` of NOCEIL-3 in `hard-ceilings.md`, which sits inside a claim whose purpose is to record a *non-existence* of runtime obligation, conflating the runtime non-claim with operator guidance. Per the project's normative-modal convention every `MUST` must anchor an observable runtime obligation; these do not.

## Solution approach

Demote each of the three operator-directed `MUST` sentences to non-normative operator guidance, preserving their substantive content — the `convertToLlm` durability fact, the (a)/(b)/(c) enumeration with its "no in-band signal" caveat, and NOCEIL-3's host-side-mechanism guidance with its "loom 1.0 makes no claim" clause. Rewrite the two sentences in `pi-integration-contract.md`'s **Runtime event channel** section and the closing sentence of NOCEIL-3 in `hard-ceilings.md`.

## Solution constraints

- Out of scope: the genuinely-normative runtime obligations in the same **Runtime event channel** section (the exactly-once emission rule, the `display: false` / `content: ""` pairing, the dedup tuple, the `RuntimeEvent` payload shape, and the engine-assumption carve-out's runtime guarantee) — only the operator-directed sentences move to non-normative voice.

## Relationships

- T18 "`RuntimeEvent.occurred_at` source clock contradicts the `Clock.now()` monotonic pin" - same-cluster (touches the same **Runtime event channel** section; resolves independently).
- T08 "Broad-catch sites mandated by spec lack a matching exemption in the plan's `no-broad-catch` convention" - same-cluster (sibling testability/handler gap on the same handler surface; not co-resolvable).
# T02 - Pi version-bump gate cannot detect three unstated host/provider behavioural presuppositions

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

`pi-integration-contract.md` relies on three load-bearing host/provider behaviours that the Pi version-bump gate (the SDK surface-inventory test plus the editorial-review checklist) cannot detect, because none is encoded in a type signature or in pi-ai's package version. (1) The *`SessionContext` and the `.messages` element shape* paragraph pins the element type `AgentMessage[]` but never states the array is chronological, while three downstream consumers (binder session-context truncation, the compact-transcript renderer, untyped-query trailing-turn extraction) assume oldest-to-newest. (2) **Provider error mapping** classifies context-overflow from substring/regex matches over provider-owned HTTP error bodies, which a provider can reword with no pi-ai version change, silently downgrading a real overflow to `TransportError` with null token fields. (3) The **Pi-side slash-handler promise lifecycle** paragraph never records that Pi *eventually* delivers a terminal `agent_end` (`willRetry: false`) / settles `ctx.waitForIdle()`, so a future Pi retry-cap or never-terminating path would hang loom invocations until cancellation. The downstream prose is internally correct today; the gap is purely in the regression-detection apparatus.

## Solution approach

Treat each of the three presuppositions in the disclosure-plus-bump-checklist shape the page already uses at `#snapshot-restore-pi-behavioural-preconditions`. Clarify the *`SessionContext` and the `.messages` element shape* paragraph that the field is chronologically ordered (oldest-to-newest) as a Pi behavioural precondition the `AgentMessage[]` type does not encode, add a stable anchor for it, and add a matching audit item to the *Editorial-review checklist for unpinned host presuppositions* (currently ending at item (g)). Clarify **Provider error mapping** that the matched overflow substrings are provider-owned text outside the pi-ai version-bump gate, naming a provider-side fixture re-run cadence, and add the corresponding checklist audit item. Add a further presupposition to the **Pi-side slash-handler promise lifecycle** paragraph (which already pins presuppositions (i)–(iii)) covering the eventual terminal `agent_end` / `ctx.waitForIdle()` guarantee, and add its checklist audit item.

## Solution constraints

- Out of scope: the inter-attempt retry-timing delegation within **Provider error mapping**, owned by T14.

## Relationships

- T22 "Binder inference call — no pi-ai entry point pinned" - same-cluster (the binder call shape may bypass the `agent_end` channel entirely; the liveness presupposition either pins the analogous terminal-signal contract for the chosen entry point or states the binder bypasses the session-event channel).
- T14 "Transport-class binder retry: no inter-attempt timing contract" - same-cluster (both touch the **Provider error mapping** surface; the overflow-wording disclosure and the retry-timing delegation share that paragraph).
- T19 "Subagent spawn has no contract when both `model:` and `ctx.model` are absent" - same-cluster (another conversation-drive presupposition gap; resolves independently).
# T03 - Schema inference rule 2 names a loom return type that loom 1.0 cannot have

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`query.md` § *Schema inference rules*, item 2, lists "the declared return type of the enclosing function or loom" as a schema sink for queries in tail-expression or `return`-argument position. Per `functions.md` § *Loom return type* (`#loom-return-type`), a `.loom` file has no declared return type — it is inferred from the tail expression, with no frontmatter `returns:` field. Naming the loom case is therefore vacuous and circular (the loom's inferred return type derives from the very query whose sink is being sought). The *Schema inference algorithm* paragraph immediately below already qualifies the loom/function tail with "whose return type is declared", so a reader who stops at item 2 reaches a different conclusion than one who continues into the algorithm.

## Solution approach

Rewrite `query.md` § *Schema inference rules* item 2 so the sink is the enclosing function's *declared* return type, dropping the loom from the same clause. Add a clause noting that a `.loom` file's return type is inferred (forward-link to `functions.md#loom-return-type`) and so cannot serve as a sink for a query in its own tail or `return` position. Keep "declared" load-bearing so the function-with-inferred-return case also correctly falls through.

## Solution constraints

- None.

## Relationships

- T13 "Argument shape — Pi-tool code-side argument type-checking timing undefined" - same-cluster (both are about a parse-time type-checking predicate whose domain is under-specified for one callee kind; independent fixes).
# T04 - ERR-14 (`ValidationIssue` ordering) is buried in a `### Notes` section

**Kind:** placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

ERR-14 is a MUST-class normative obligation: it pins the canonical deterministic sort order of `validation_errors` (and the `<ajv-summary>` source consumed by the binder's failure-mode templates) and makes `validation_errors[0]` well-defined for conformance tests. It lives in the trailing `### Notes` subsection of `## QueryError variants` in `docs/spec_topics/errors-and-results.md`, roughly 120 lines below the `ValidationError` / `ValidationIssue` schema in `### Query-time variants`. The other paragraphs in `### Notes` are purely informational; ERR-14 is the lone normative obligation among them. An implementer reading the schema for ordering rules on `validation_errors` will not find ERR-14 there and is unlikely to scan a `### Notes` block for a MUST-class sort contract.

## Solution approach

Move the ERR-14 paragraph — with its `<a id="validation-issue-ordering"></a>` and `<a id="err-14"></a>` anchors — out of `### Notes` and into `### Query-time variants` in `docs/spec_topics/errors-and-results.md`, co-located with the `ValidationError` / `ValidationIssue` schema definitions. Carry both existing HTML anchors verbatim so inbound `#err-14` and `#validation-issue-ordering` cross-references continue to resolve.

## Solution constraints

- Out of scope: the `InvokeInfraError` Notes paragraph owned by T16.
- Preserve the `err-14` ID; treat the relocation as GOV-8 pure rewording — no retire-and-re-add.

## Relationships

- T16 "`InvokeInfraError` wire discriminant `\"invoke_failure\"` is mis-scoped" - decision-overlap (both touch the `### Notes` subsection under `QueryError variants`; the rename deletes one Notes paragraph while this finding relocates another — coordinate the edit so the `### Notes` heading is not left stale if both edits empty the subsection).
- T05 "Seam-blockquote MUSTs on `errors-and-results.md` and `invocation.md` lack co-located REQ-ID anchors" - same-cluster (adjacent ERR-N housekeeping on the same page; relocating ERR-14 does not collapse its number, so ERR-15 remains the next free integer regardless of resolution order).
# T05 - Seam-blockquote MUSTs on `errors-and-results.md` and `invocation.md` lack co-located REQ-ID anchors

**Kind:** traceability
**Importance:** medium
**Score:** 15
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Four `> **loom 1.0 seam — <name>.**` blockquotes across two non-narrative pages are defining obligation sites carrying RFC-2119 MUSTs, yet none carries a co-located `PREFIX-N` REQ-ID anchor in the GOV-1 dual-form. On `errors-and-results.md` the discriminator type-openness seam blockquote holds two MUSTs that restate one type-openness obligation; on `invocation.md` the symlink-resolution-hardening, named-argument-invocation, and per-call-timeout seam blockquotes carry only seam-slug URL anchors, and the page contains zero `INV-N` anchors of any kind. Per GOV-22 each is a standing spec defect to be drained; per GOV-9 an inbound cross-page citation of these obligations cannot target a `#prefix-n` fragment.

## Solution approach

Add a dual-form `ERR-15` REQ-ID anchor co-located with the discriminator type-openness seam blockquote on `errors-and-results.md`, covering the shared type-openness obligation under one ID. Add a dual-form `INV-N` anchor co-located with each surviving MUST on `invocation.md`, allocating the next free `INV` integers in source order. Both `ERR` and `INV` are registered prefixes, so this is next-free-integer allocation under GOV-3.

## Solution constraints

- Preserve the existing `loom-1-0-seam-…` / `v1-seam-…` slug anchors on both blockquote sites so seam-inventory cross-links keep resolving.

## Relationships

- T07 "Several seam/contract blockquotes over-prescribe implementation shape beyond the observable contract" - must-follow (if T07 demotes the symlink "single named function" MUST to a non-normative note, that blockquote no longer needs an `INV-N`; resolve T07 first to know whether one or two `INV-N` integers are needed on `invocation.md`).
- T09 "PIC sections beyond \"Probe-wide invariants\" — missing REQ-ID anchors" - same-cluster (same GOV-22 coinage gap on `pi-integration-contract.md` under the `PIC` prefix; resolves independently).
- T06 "binder.md normative sections lack per-obligation BNDR-N anchors" - same-cluster (same defect class on `binder.md` under the `BNDR` prefix).
- T16 "`InvokeInfraError` wire discriminant `\"invoke_failure\"` is mis-scoped" - same-cluster (both touch the `## QueryError variants` section; the ERR-15 coinage is adjacent to the wire-token rename and resolves independently).
- T17 "`realpath` is required by Resolution but absent from the `FileSystem` seam" - same-cluster (touches the same symlink-resolution-hardening blockquote on `invocation.md`).
# T06 - binder.md normative sections lack per-obligation BNDR-N anchors

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

Four normative sub-sections of `binder.md` — *System-prompt structure (normative)*, *Compact-transcript format (normative)*, *System-note rendering*, and the *Echo policy* "Format rules" list — enumerate independently-testable RFC-2119 obligations, but none carries a `BNDR-N` REQ-ID anchor. Only `BNDR-1`..`BNDR-3` exist on the page (the binder-refinement-loop seam); the entire normative rendering and system-prompt body is un-coined. GOV-22 requires every individual obligation on a non-narrative page to be coined as a `BNDR-N` defining anchor, and GOV-9 requires cross-page citers to target a `#bndr-n` fragment; both contracts are currently unsatisfiable for these obligations. `schema-subset.md` § *Canonical form* item 2 already depends on the echo-policy `integer`/`number` rendering rules but can only cross-reference the bare `#echo-policy` section anchor.

## Solution approach

Coin one `BNDR-N` per independently-testable obligation across the four sub-sections in a single coordinated sweep, allocating the next free integers after `BNDR-3` in source order (the four sub-sections share one `BNDR` numbering space; verify the high-water mark with `grep -i 'bndr-' docs/spec_topics/binder.md` before assigning, since per GOV-3 numbering never collapses to fill holes). Use GOV-1 dual-form `<a id="bndr-n"></a> **BNDR-N.**` anchors. Repoint `schema-subset.md` § *Canonical form* item 2 from `./binder.md#echo-policy` to the specific new `#bndr-n` fragments for the `integer`, `number`, and reference-rendering rules it relies on. Add the new IDs to `coverage-matrix.md` as uncovered.

## Solution constraints

- Coinage is anchor-only: wrap the existing obligation prose with `BNDR-N` anchors without altering the normative content, preserving the inline edge-case parentheticals (e.g. the `±1e21` switch ban, the `NaN`/`±Infinity` exclusion, the "field order is irrelevant" disclaimer) verbatim.

## Relationships

- T21 "System-note rendering — prefix backticks disagree across normative statements" - must-follow (the backtick byte-form must be pinned first so each newly-coined system-note / echo-policy rule anchor cites the corrected prose).
- T09 "PIC sections beyond \"Probe-wide invariants\" — missing REQ-ID anchors" - same-cluster (same GOV-22 pattern on `pi-integration-contract.md` under the `PIC` prefix).
- T05 "Seam-blockquote MUSTs on `errors-and-results.md` and `invocation.md` lack co-located REQ-ID anchors" - same-cluster (same GOV-22 pattern under the `ERR` / `INV` prefixes; resolves independently).
# T07 - Several seam/contract blockquotes over-prescribe implementation shape beyond the observable contract

**Kind:** prescription
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 4
**Shape:** single
**State:** reduced

## Problem

Four seam/contract blockquotes pin implementation shape with normative MUST force even though no caller, operator, or test can observe the difference; the observable contract at each site is already pinned separately, so the shape-prose adds un-testable conformance points and dilutes the genuinely-normative MUSTs beside it. The four sites are: (1) Step 1 of `pi-integration-contract.md` (line 118) pins the exact `pi.registerFlag('loom', …)` object literal including its human-readable `description` string, which only Pi's `--help` renders and keys no loom surface; (2) the `LoomRegistry` *Methods* contract (lines 149–156) pins "exactly four method-call surfaces / no fifth drain-state method / no property writes / no accessor beyond `readDrainState`", constraining the spelling of the implementation rather than behaviour; (3) the `system:` interpolation seam (`frontmatter.md` line 135) MUSTs that the `${…}` parser be the shared expression entry point with a parser-level filter and calls an inline regex "non-conformant"; (4) the symlink-resolution hardening seam (`invocation.md`) MUSTs that the realpath-then-containment check be "a single named function" and forbids inlining. In every case the stated rationale is a maintainability argument about loom's own future-edit cost, not a property of the loom 1.0 observable surface.

## Solution approach

At each site, keep the behavioural pins normative and demote the implementation-shape mandate to a non-normative implementation note. For `--loom`, narrow the normative pins to the flag name `'loom'`, `type: 'string'`, and the presence of *a* `description`, preserving the registration-before-`resources_discover` and split-on-`path.delimiter` pins, and demote the exact `description` wording to a non-normative example. For `LoomRegistry`, keep normative the per-method behavioural contracts, the closed `drainStateTag` value set, the three-arm `readDrainState` dispatch, the closed `details.call` label set, and the rename-sweep cross-reference obligation, and demote the four-method-cardinality / no-fifth-method / no-property-write prose to a non-normative editorial-convention note. For the `system:` seam, rewrite the blockquote MUST to bind only the accepted `Path` production and the four `loom/parse/system-interp-*` diagnostics, demote the shared-entry-point / parser-level-filter prescription to a non-normative note, and preserve anchors `loom-1-0-seam-system-expression-sublanguage` / `v1-seam-system-expression-sublanguage`. For the symlink seam, rewrite the MUST to bind identical realpath-then-containment semantics and the two-channel escape diagnostics (`loom/load/invoke-path-escape` on the drain; `Err(InvokeInfraError { … })` to the parent), demote the single-named-function prescription to a non-normative note, preserve anchors `loom-1-0-seam-symlink-resolution-hardening` / `v1-seam-symlink-resolution-hardening`, and soften the `future-considerations.md` *Surface extensions* entry's claim that the replacement relies on exactly one body to replace.

## Solution constraints

- The four seam blockquotes MUST remain present and inventoried in `spec.md`'s Scope seam tally — only prescriptive prose is demoted, not the seams removed.

## Relationships

- T05 "Seam-blockquote MUSTs on `errors-and-results.md` and `invocation.md` lack co-located REQ-ID anchors" - must-precede (the symlink rewrite here determines whether that blockquote still hosts a normative MUST needing an `INV-N`; resolve this finding first).
- T17 "`realpath` is required by Resolution but absent from the `FileSystem` seam" - decision-overlap (the body of the symlink "single named function" is precisely where `FileSystem.realpath` would be called; the wording chosen here must survive whichever resolution that finding takes).
- T09 "PIC sections beyond \"Probe-wide invariants\" — missing REQ-ID anchors" - decision-overlap (the `LoomRegistry` paragraph is also targeted for a `PIC-N` anchor; adding the anchor and demoting the cardinality prose are orthogonal edits to the same surface).
# T08 - Broad-catch sites mandated by spec lack a matching exemption in the plan's `no-broad-catch` convention

**Kind:** doc-alignment-broad
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `Specific exception types only` bullet in `docs/plan_topics/conventions.md` forbids `catch (e)`, `catch (e: unknown)`, `catch (e: any)`, and `catch (e: Error)` across `src/**` (enforced by `no-broad-catch`), with a single exemption for a `catch (e: unknown)` "at a Pi SDK boundary site" — a phrase the bullet uses but never defines. The spec normatively mandates broad catches at sites that are not direct Pi SDK member calls: PIC's *Self-failure* probe traps, the *Unknown-reason rule* `event.reason` property read, the *Per-step isolation* sub-step wraps (including loom-internal calls), and the *Diagnostic-emission isolation* `console.error` wraps. Under a literal reading of "Pi SDK boundary site" none of these qualify for the exemption, so `no-broad-catch` rejects them; under a generous reading the convention gives a scaffold-leaf reviewer no defensible criterion. Either way the spec MUSTs are not cleanly implementable against the current lint contract.

## Solution approach

Rewrite the exemption clause of the `Specific exception types only` bullet in `docs/plan_topics/conventions.md` so the exemption admits the spec-mandated broad-catch sites — PIC's *Self-failure* probe traps, the *Unknown-reason rule* property read, the *Per-step isolation* sub-step wraps, and the *Diagnostic-emission isolation* `console.error` wraps — and hostile-import defensive reads, alongside the existing Pi SDK boundary case. Keep the `// allow-broad-catch: <REQ-ID> — <spec-page>` same-line comment and lint-allow-list-entry requirement for every exempt site, and clarify what `Pi SDK boundary site` denotes so a scaffold-leaf reviewer has a defensible criterion.

## Solution constraints

- Edit only `docs/plan_topics/conventions.md`; coining the PIC REQ-ID anchors that the spec-mandated exemption sites cite is out of scope (owned by T09).

## Relationships

- T09 "PIC sections beyond \"Probe-wide invariants\" — missing REQ-ID anchors" - must-follow (the spec-mandated exemption sites cite REQ-IDs; today most spec-mandated broad-catch sites lack a PIC-N anchor to cite, so this convention edit relies on that finding's resolution or an interim section-anchor-fragment fallback).
- T18 "`RuntimeEvent.occurred_at` source clock contradicts the `Clock.now()` monotonic pin" - same-cluster (touches the same PIC surface; resolves independently).
- T01 "Operator-bound MUSTs mis-classified as runtime conformance requirements" - same-cluster (sibling testability/handler gap on the same handler; not co-resolvable).
# T09 - PIC sections beyond "Probe-wide invariants" — missing REQ-ID anchors

**Kind:** traceability
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`pi-integration-contract.md` (`PIC` prefix) carries only six REQ-ID anchors — `PIC-1` … `PIC-6` — all inside the **Probe-wide invariants** block under Step 0. The page's remaining normative obligation clusters (e.g. the session-binding contract, restore-failure protocol, subagent session lifecycle, the DI-seam interface blocks, and the SDK capability inventory) carry no co-located `PIC-N` anchor. `GOV-9` requires cross-page citations of a depended-upon PIC rule to target its `#prefix-n` anchor and `GOV-22` treats un-anchored defining obligation sites as progressively-draining spec defects, so neither leaf-side citations nor coverage-matrix REQ-ID-to-leaf rows can pin those clusters.

## Solution approach

Walk `pi-integration-contract.md` top-to-bottom and add `<a id="pic-N"></a> **PIC-N.**` dual-form anchor pairs per GOV-1, one per independent obligation cluster, allocating `PIC-7` onward in source order. Split fused multi-obligation sub-steps into one anchor per obligation rather than one per paragraph. Where coining re-targets a section anchor that `spec.md`'s Session Model aggregator cites by name, re-point that citation in the same commit per GOV-12.

## Solution constraints

- Out of scope: `governance.md` is not edited — the `PIC` REQ-ID prefix row already exists and GOV-3's next-free-integer rule allocates the `PIC-N` tails.
- Scope is anchor insertion plus the minimal sub-step splitting needed for citation granularity; do not semantically reword or re-flow the existing obligation prose.

## Relationships

- T10 "DI-seam vs reference-implementation placement boundary between PIC and implementation-notes" - must-follow (the `SchemaValidator` MUSTs moved into PIC by that finding inherit the PIC-N anchoring obligation; the migrated block should be anchored in this sweep rather than re-touched twice, so the move lands first).
- T08 "Broad-catch sites mandated by spec lack a matching exemption" - must-precede (that finding's category (2)/(3) allow-list entries cite the PIC-N anchors this sweep coins).
- T07 "Several seam/contract blockquotes over-prescribe implementation shape beyond the observable contract" - decision-overlap (the `LoomRegistry` paragraph is targeted by both; adding the PIC-N anchor and demoting the cardinality prose are orthogonal edits to the same surface).
- T05 "Seam-blockquote MUSTs on `errors-and-results.md` and `invocation.md` lack co-located REQ-ID anchors" - same-cluster (same GOV-22 residue, different page/prefix).
- T06 "binder.md normative sections lack per-obligation BNDR-N anchors" - same-cluster (same GOV-22 residue, different page/prefix).
# T10 - DI-seam vs reference-implementation placement boundary between PIC and implementation-notes

**Kind:** placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`pi-integration-contract.md` (PIC) is the spec's designated owner of Pi-side DI-seam contracts. Two placement defects straddle the PIC ↔ `implementation-notes.md` boundary in opposite directions. First, the `SchemaValidator` normative interface block sits in `implementation-notes.md` (anchor `#schemavalidator-interface`) while its peer DI seams — `Clock`, `FileSystem`, `FileWatcher`, `Checkpoint` — all live in PIC as bolded normative-shape blocks, so an implementer consulting PIC for DI-seam contracts never discovers it and may conclude it is not a normative seam. Second, the **Loom-package implementation dependencies (loom 1.0)** paragraph naming loom's own npm packages (`semver`, `chokidar`) sits in PIC, interrupting PIC's Pi-supplied-surface argument, while `implementation-notes.md` already hosts the analogous AJV non-normative hint.

## Solution approach

Move the `SchemaValidator` normative interface block from `implementation-notes.md` into PIC adjacent to the other DI-seam blocks near `#clock--fakeclock-interface`, leaving a forward-link stub at the old `implementation-notes.md` location and rewriting PIC's existing parenthetical `SchemaValidator` mention into a reference to the new block. Move the **Loom-package implementation dependencies (loom 1.0)** paragraph out of PIC into `implementation-notes.md`'s `## Runtime` section alongside the AJV hint, leaving a forward-link stub on PIC.

## Solution constraints

- Preserve the `#schemavalidator-interface` anchor and both `#loom-package-implementation-dependencies-loom-1-0` and `#loom-package-implementation-dependencies-v1` anchors at their new sites, so cross-links from `binder.md`, `schema-subset.md`, and `implementation-notes.md` continue to resolve.

## Relationships

- T09 "PIC sections beyond \"Probe-wide invariants\" — missing REQ-ID anchors" - must-precede (the migrated `SchemaValidator` MUSTs land in PIC and inherit the PIC-N anchoring obligation; do the move first so the anchoring sweep covers the block in one pass rather than re-touching it twice).
# T11 - `array<T>.concat(other)` — admissibility and result element type not routed through `⊑`

**Kind:** completeness
**Importance:** high
**Score:** 100
**Must-fix:** true
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The `concat(other)` row in [Expressions — Built-in methods](./expressions.md) gives the signature `(other: array<T>): array<T>` with the semantics gloss "element type must match", which does not cite the named `T₁ ⊑ T₂` relation in [Type System — Type compatibility](./type-system.md#type-compatibility). Every other type-position site in the topic — the array-literal LUB rules, the `+` operator — routes admissibility through `⊑`, so `concat` is the lone exception. The gloss admits three incompatible readings of `array<integer>.concat(array<number>)`: strict-identity rejection, `⊑`-widening to `array<number>`, and a literal-signature-preserving reading that types the result `array<integer>` while it holds `number` values (a soundness hole). The same gap recurs in any future array-producing method.

## Solution approach

Rewrite the `concat(other)` row's semantics cell in expressions.md's Built-in methods table to route admissibility and result element type through `⊑` in [Type System — Type compatibility](./type-system.md#type-compatibility), mirroring the `+` row's existing citation. State that the result element type is the least upper bound under `⊑` — the same LUB the array-literal rule computes in [array construction](./expressions.md#object-construction-array-construction-and-operator-rules) — so the `integer`/`number` boundary widens in both call directions. Route the no-`⊑`-compatible-pair rejection through the existing `loom/parse/array-element-type-mismatch` code rather than a concat-specific diagnostic. Reconcile the static signature line so the LUB result type is reflected.

## Solution constraints

- None.

## Relationships

- T12 "`string.replace(from, to)` — literal-substitution and empty-`from` behaviour unspecified" - same-cluster (sibling built-in-method semantics gap in the same table; resolves independently).
# T12 - `string.replace(from, to)` — literal-substitution and empty-`from` behaviour unspecified

**Kind:** completeness
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The `replace(from, to)` row in the `Built-in methods and properties` table of `expressions.md` reads "Replaces all occurrences. Literal-only (no regex)." Two behaviours are left unspecified. First, "Literal-only" scopes only the search argument `from`; it says nothing about whether `$`-sequences (`$$`, `$&`, `` $` ``, `$'`, `$n`) in the replacement argument `to` are inserted byte-for-byte or interpreted as JS replacement patterns (as `String.prototype.replaceAll` would). Second, the row does not pin empty-`from` behaviour, unlike the sibling `split(sep)` row which pins its empty-separator case; readings range from JS boundary-insertion to no-op to error, and a naive find-next loop over an empty needle infinite-loops.

## Solution approach

Rewrite the `replace(from, to)` Semantics cell to pin both unspecified behaviours: state that `$`-sequences in `to` are inserted literally rather than interpreted as replacement patterns, and that an empty `from` returns the receiver unchanged. Mirror the sibling `split(sep)` row's convention of pinning the empty-argument case within the same Semantics cell.

## Solution constraints

- None.

## Relationships

- T11 "`array<T>.concat(other)` — admissibility and result element type not routed through `⊑`" - same-cluster (sibling built-in-method completeness gap in the same table; resolves independently).
# T13 - Argument shape — Pi-tool code-side argument type-checking timing undefined

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `**Argument shape.**` section of `tool-calls.md` says a `<name>(args)` argument-type mismatch "surfaces as `loom/parse/tool-arg-type-mismatch` when the callee is statically resolvable" per `invocation.md#static-resolution`, but that predicate is defined exclusively over `.loom` callees ("a callee referenced by a literal `invoke(...)` or by a `.loom` entry in `tools:`"). A Pi tool is not a `.loom` file, so "statically resolvable" has no defined truth value for the Pi-tool callee kind, and the `loom/parse/tool-arg-type-mismatch` row in `diagnostics.md` inherits the same ambiguity through its "(when statically resolvable)" parenthetical. The two readings produce different observable surfaces for the same defect: under one, a Pi-tool argument type mismatch is a load-time parse error; under the other it passes parse and surfaces at runtime as `Err(CodeToolError { cause: "validation", ... })`. The spec must pick one so implementers, diagnostic golden files, and author-facing error guidance do not diverge.

## Solution approach

Clarify in `tool-calls.md`'s `**Argument shape.**` section that "statically resolvable" applies only to `.loom` callees, and that Pi-tool argument type mismatches against the tool's input schema are always the runtime AJV check, surfacing as `Err(CodeToolError { cause: "validation", ... })`. Narrow the `loom/parse/tool-arg-type-mismatch` row in `diagnostics.md` so it attributes the diagnostic to the `.loom`-callable arm only. State the Pi-tool/`.loom` asymmetry once in `tool-calls.md` so it is discoverable rather than inferred.

## Solution constraints

- Out of scope: the Static resolution predicate at `invocation.md#static-resolution` stays `.loom`-file-only — do not extend it to Pi-tool callees.
- The `loom/parse/tool-arg-not-literal` and `loom/parse/tool-arg-arity` parse checks must remain live for Pi-tool calls; only the type-mismatch check is narrowed.

## Relationships

- T03 "Schema inference rule 2 names a loom return type that loom 1.0 cannot have" - same-cluster (both are about a parse-time type-checking predicate whose domain is under-specified for one callee kind; independent fixes).
# T14 - Transport-class binder retry: no inter-attempt timing contract

**Original heading:** Failure-class taxonomy / per-invocation retry budget — transport retry has no backoff contract
**Original section:** docs/spec_topics/binder.md
**Kind:** error-model
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

The binder failure-class taxonomy (`Failure-class taxonomy (normative)`) and the per-invocation retry budget below it grant the transport class "exactly one retry" and route HTTP 429 / rate-limit, all 5xx, network/TCP/TLS failures, provider-SDK timeouts, and `ContextOverflowError` (treated as transport for retry purposes) through that single retry slot. Neither paragraph says anything about the timing of that retry: whether the runtime re-issues the binder call immediately, applies a fixed delay, applies exponential backoff, or honours a `Retry-After` header.

For 429 specifically the omission is observable. An immediate re-issue is the canonical retry-without-backoff anti-pattern — it consumes the budget on a request the provider has explicitly told the client to defer, so the retry deterministically fails for any 429 whose rate-limit window is longer than the binder's own latency, and the loom surfaces "argument binder unavailable" on a failure the spec implies is recoverable. Two reasonable implementers (one tight-loop, one with backoff) will produce different observable behaviour against the same rate-limited provider, and conformance tests cannot pin the retry interval.

The companion `TransportError` envelope in `errors-and-results.md` carries no `retry_after` field and the runtime does not expose backoff knobs in frontmatter, so the contract has to be stated normatively somewhere or explicitly delegated to a layer that already owns it.

## Spec Documents

- `docs/spec_topics/binder.md` — Failure-class taxonomy (normative) / per-invocation retry budget paragraph (edited)
- `docs/spec_topics/pi-integration-contract.md` — Provider error mapping (option-dependent — receives the delegation clause under Option A; edited under Option B if a runtime delay is pinned)
- `docs/spec_topics/errors-and-results.md` — `TransportError` envelope (read-only — checked for an existing `retry_after`-style field; none exists)
- `docs/spec_topics/query.md` — typed/untyped query transport-failure handling (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan has no authored leaves yet; `plan_topics/` contains only template/conventions/coverage-matrix scaffolding.)

## Consequence

**Severity:** correctness

Two conforming implementations will differ observably on rate-limited 429 paths: a tight-loop retry consumes the transport budget on the first wire round-trip and surfaces "argument binder unavailable," while a backoff-aware retry recovers. A binder pointed at a provider with strict per-second 429 caps becomes effectively non-retrying under the tight-loop reading despite the spec advertising one transport retry. Conformance tests cannot assert the wire-timing observable.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Delegate transport backoff to pi-ai

**Approach.** Add one sentence to the *Transport-class* bullet (or to the per-invocation retry budget paragraph) stating that the binder issues the retry immediately and that inter-attempt timing — including any `Retry-After` honouring, exponential backoff, jitter, or rate-limit-window awareness — is owned by `@earendil-works/pi-ai`. The loom-side retry budget counts *attempts after pi-ai's own delay completes*. If pi-ai itself returns after exhausting its internal retry, that single returned result consumes the binder's transport budget.

**Spec edits.** Single clause in `binder.md` under *Failure-class taxonomy → Transport-class* (or in the per-invocation budget paragraph immediately below). Cross-reference `pi-integration-contract.md`'s [Provider error mapping](./pi-integration-contract.md#provider-error-mapping) as the layer that owns the timing contract.

**Pros.** Smallest spec surface. Consistent with the existing pattern of delegating provider-specific behaviour (overflow detection, seed-field mapping, named-tool forcing) to pi-ai. No new loom-side knob.

**Cons.** Correctness depends on a behaviour pi-ai is not contractually pinned to provide. If pi-ai retries internally with backoff, the binder's "exactly one retry" budget effectively means "one pi-ai-internal retry chain after the first failure surface."

**Risks.** Requires confirming the actual pi-ai behaviour (whether it backs off, whether it honours `Retry-After`) and citing the pi-ai version in the same edit, adding the timing-contract assumption to the bump-procedure re-validation list (the Provider error mapping paragraph is already "version-coupled to `@earendil-works/pi-ai`").

### Option B — Pin a defined runtime delay

**Approach.** State that the runtime waits a defined interval before re-issuing the binder call: either a fixed value (e.g. 500 ms via the injected `Clock` seam) for all transport-class failures, or a class-split policy (429-with-`Retry-After` → sleep capped at N seconds; all other transport failures → immediate). The wait is interruptible by `loomAbort.signal` per the existing abort-during-retry rule.

**Spec edits.** New short paragraph in `binder.md` after the per-invocation budget paragraph, naming the `Clock` seam (already defined in `pi-integration-contract.md`) so the delay is FakeClock-testable. If the policy reads `Retry-After`, add a field to `TransportError` in `errors-and-results.md` so the value is observable (or pin that the binder reads the raw provider response inline).

**Pros.** Loom-owned timing is testable through the existing `Clock` / `FakeClock` seam without depending on pi-ai's undocumented internals. Pins the 429 wire behaviour explicitly.

**Cons.** Adds a new normative obligation and likely a new constant (`BINDER_TRANSPORT_RETRY_DELAY_MS`). Duplicates work pi-ai may already do (total wait becomes loom-delay + pi-ai-delay). Requires deciding whether to honour `Retry-After`.

**Risks.** Cap selection is policy: too short defeats the purpose for 429; too long blows the binder's latency budget.

### Recommendation

Choose **Option A** if an audit of `@earendil-works/pi-ai`'s pinned minor (the lock-step pin at `pi-integration-contract.md#pi-sdk-pin`) shows it already owns transport backoff (`Retry-After` handling and a retry/backoff layer); the same paragraph adds a line to the bump procedure's re-validation list so a pi-ai minor that drops backoff is caught. If that audit shows pi-ai does **not** back off, fall back to **Option B** with a fixed 500 ms delay (no `Retry-After` parsing, no class split) — the minimum useful interval that does not require a new wire-format field — wiring the wait through the injected `Clock` seam so cancellation and FakeClock coverage already cover the path, with the cancellation rule ("an abort observed during any retry suppresses that retry") explicitly covering the in-delay window. Either way, the same paragraph should clarify the rule applies symmetrically to typed and untyped query transport-failure retries in `query.md`, or state explicitly that the binder is the only retrying transport site in loom 1.0.

## Relationships

- T22 "Binder inference call — no pi-ai entry point pinned" - must-follow (whether transport backoff is owned by pi-ai depends on which entry point that finding pins; if the chosen helper already owns backoff, Option A's delegation falls out, otherwise the binder spec must pin the timing itself — resolve the call-shape finding first).
- T15 "`TransportError.retryable` lacks a population rule outside the unsupported-provider case" - same-cluster (both expose gaps in the transport-error contract; a coherent edit would touch both in the same pass).
- T02 "Pi version-bump gate cannot detect three unstated host/provider behavioural presuppositions" - same-cluster (Option A delegates to the **Provider error mapping** surface that finding also touches).

---

# T15 - `TransportError.retryable` lacks a population rule outside the unsupported-provider case

**Kind:** error-model
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`TransportError` (in `docs/spec_topics/errors-and-results.md`, schema declaration under *QueryError variants → Query-time variants*) declares a caller-visible `retryable: boolean` field, but no normative clause defines how the value is populated for the general transport-error population. The only site that pins a value is the `loom/load/typed-query-unsupported-provider` row in `docs/spec_topics/diagnostics.md` (`retryable: false`). Every other path that produces a `TransportError` — non-overflow 4xx including HTTP 429, 5xx, network / TCP / TLS failures, provider-SDK timeouts, end-of-stream truncation, all routed via the *Provider error mapping* paragraph in `docs/spec_topics/pi-integration-contract.md` — leaves `retryable` undefined. Implementers diverge on the value for the same provider response and the conformance suite cannot pin the field beyond the one unsupported-provider case.

## Solution approach

Add a normative, ERR-anchored clause to the *Provider error mapping* section of `docs/spec_topics/pi-integration-contract.md` (anchor `id="provider-error-mapping"`) defining how `TransportError.retryable` is populated by transport-error class: `true` for network-level failures (no HTTP response, TCP/TLS errors, provider-SDK timeouts, end-of-stream truncation), HTTP 5xx, and HTTP 429; `false` for non-429 4xx. Rewrite the `TransportError` field comment in `errors-and-results.md` as a forward-link to the new rule.

## Solution constraints

- The existing `loom/load/typed-query-unsupported-provider` `retryable: false` value in `docs/spec_topics/diagnostics.md` is fixed; do not modify it.

## Relationships

- T14 "Transport-class binder retry: no inter-attempt timing contract" - same-cluster (both touch the transport-retry surface; that finding is about binder-internal retry timing while this one is about the user-facing `retryable` field; they resolve independently but a coherent edit would touch both).
- T16 "`InvokeInfraError` wire discriminant `\"invoke_failure\"` is mis-scoped" - same-cluster (same `### QueryError variants` section; resolves independently).
# T16 - `InvokeInfraError` wire discriminant `"invoke_failure"` is mis-scoped

**Kind:** naming
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`InvokeInfraError` — the variant covering everything *around* the callee body (load failure, parse failure, return-validation failure, callee panic, unanticipated interpreter exception) — carries wire `kind: "invoke_failure"`, while its sibling `InvokeCalleeError` (which wraps an `Err` returned by the callee itself) carries the specific `kind: "invoke_callee_error"`. The umbrella-sounding token `"invoke_failure"` in fact denotes only the infra-side half, so a `match` arm reading it as "every invoke failure" silently misses callee-returned errors. The spec compensates for the mismatch rather than fixing it: the glossary `InvokeInfraError` entry carries a `**Scope warning.**` paragraph, and the closing paragraph under `## Notes` in `errors-and-results.md` asserts the wire `kind` is stable contract that is not renamed. This is the only V1 `QueryError` variant whose schema name and wire `kind` diverge through the infra/callee split.

## Solution approach

Rename the wire discriminant `"invoke_failure"` to `"invoke_infra_error"` at every occurrence under `docs/` — the `schema InvokeInfraError` block in `errors-and-results.md`, the `ERR-13` example and **Runtime panics** `invoke` parent bullet, the glossary `InvokeInfraError` entry, the `invocation.md` Failures naming, and the citing rows in `diagnostics.md`, `pi-integration-contract.md`, `query.md`, and `slash-invocation.md`. Delete the compensatory glossary `**Scope warning.**` paragraph and the closing `## Notes` wire-divergence paragraph in `errors-and-results.md`, which exist only to explain the mismatch, along with the anchoring divergence-precedent sentences in the glossary entry and the `query-terminating` parenthetical.

## Solution constraints

- Out of scope: the ERR-14 ordering paragraph in the `### Notes` subsection of `QueryError variants` (owned by T04).

## Relationships

- T04 "ERR-14 (`ValidationIssue` ordering) is buried in a `### Notes` section" - decision-overlap (both touch the `## Notes` subsection under `QueryError variants`; the rename deletes one Notes paragraph while ERR-14 relocates another — coordinate the edit so the `### Notes` heading is not left stale if both edits empty the subsection).
- T05 "Seam-blockquote MUSTs on `errors-and-results.md` and `invocation.md` lack co-located REQ-ID anchors" - same-cluster (both touch the `QueryError variants` section; resolve independently — one is a wire-token rename, the other adds an ERR-N anchor to an adjacent blockquote).
- T15 "`TransportError.retryable` lacks a population rule outside the unsupported-provider case" - same-cluster (same `### QueryError variants` section; resolves independently).
