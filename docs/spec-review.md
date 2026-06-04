# Triaged Spec Review - spec

_Generated: 2026-06-04T03:10:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T22) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 4 high, 9 medium retained; 13 low discarded; 16 low findings merged into 6 medium findings (plus one co-resolve merge of two high findings); 4 nit dropped; 0 false dropped._

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
