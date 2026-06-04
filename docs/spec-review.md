# Triaged Spec Review - spec

_Generated: 2026-06-04T03:10:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T22) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 4 high, 6 medium retained; 13 low discarded; 16 low findings merged into 6 medium findings (plus one co-resolve merge of two high findings); 4 nit dropped; 0 false dropped._

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
