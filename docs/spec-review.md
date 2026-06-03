# Triaged Spec Review - spec

_Generated: 2026-06-03T08:30:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T11) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 1 high, 9 medium retained; 8 low discarded; 9 low findings merged into 2 medium findings; 3 nit dropped; 0 false dropped._

---

# T01 - Spec-corpus editorial and governance meta-commentary misplaced in implementer-facing orientation

**Kind:** cruft
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

Three blocks of `docs/spec.md` orientation prose carry spec-corpus editorial and governance meta-commentary aimed at spec maintainers rather than loom-runtime implementers: the `### Scope` opening paragraph's editorial-criterion meta-note, the `#v1-non-goals` section's closing paragraph (re-stating GOV-12-owned lock-step and aggregator conventions), and the `#sm-anchor-scheme-stability` paragraph (anchor-lifecycle rules, orientation-vs-obligation citation guidance, and a one-time historical tracking sentence). None constrains a runtime implementer; each pushes the section's actual content — the five Scope bullets, the eight non-goals, the SM obligations — behind maintainer-facing commentary. The conventions these blocks document are owned canonically by GOV-12 or belong in a GOV rule on `governance.md`, not in spec.md orientation prose.

## Solution approach

Delete the editorial meta-note from spec.md's `### Scope` opening paragraph, keeping the orientation sentence and its existing forward-links. Delete the closing meta-commentary paragraph from the `#v1-non-goals` section, keeping the seam-vs-non-goal navigation sentence and the opening `*Orientation aggregator*` sentence's GOV-12 link. Delete the `#sm-anchor-scheme-stability` paragraph from spec.md and relocate its anchor-lifecycle and orientation-vs-obligation citation rules to a new GOV rule on `governance.md` governing spec.md's `sm-N-…` anchor scheme; drop the historical pre-decomposition tracking sentence with no replacement.

## Solution constraints

- The umbrella `<a id="session-model"></a>` anchor on the Session Model lede MUST survive the deletion — inbound orientation-level links depend on it.
- Coining the new GOV rule on `governance.md` MUST register it per GOV-7 *Add* and GOV-1 dual-form anchoring.

## Relationships

- T10 "Alias-arm hrefs used for dual-anchored cross-references (GOV-21 violation)" - decision-overlap (the V1-non-goals closing-paragraph deletion removes two of the alias-arm hrefs T10 fixes; resolve the remaining-citation scope consistently).
- T07 "Trust-boundary Scope bullet carries the denial-surface rule normatively" - same-cluster (clarifying the Scope "informative orientation" framing strengthens the basis for T07's pointer-only rewrite; land in the same pass).
- T06 "Runtime observability bullet restates normative emission rules inside an informative section" - same-cluster (Scope-section hygiene; land in the same pass).
- T05 "SM-7c orientation framing asserts per-session slash-handler serialisation as a Pi guarantee without the presupposition framing the deeper section actually uses" - same-cluster (both touch the SM orientation surface; the relocated anchor-scheme rule is the right home for SM anchor-naming discipline; resolve independently).
- T03 "Eight loom 1.0 non-goals lack per-item citation anchors" - same-cluster (same V1 non-goals section; independent edit).
# T02 - Orientation aggregators and Session-Model sub-obligations lack per-item citation anchors

**Kind:** traceability, naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 6
**Shape:** single
**State:** reduced

## Problem

Six orientation-aggregator sites and Session-Model sub-obligations in `docs/spec.md` carry independently-citable normative sub-claims with no per-item `<a id>` anchor (or whose only anchor names the wrong sense), forcing every downstream citation to target an umbrella anchor and paraphrase which sub-claim is meant. The affected sites are: the `terminal-outcomes-aggregator` exclusion clauses (a)/(b) (GOV-12 lock-step-bound against `errors-and-results.md`'s **Failure.** bullet); the `file-extension-grammar` paragraph's three distinct claims; the three numbered Host-runtime preconditions (precondition 3 referring back to precondition 2 by ordinal); three of the five Scope bullets (Trust boundary, Runtime observability, Forward-compatibility seams); SM-2's two positional Roman-numeral sub-obligation labels; and SM-4's coined term *session-only reasons*, cited from SM-5/SM-6 via `#sm-4-session-only-degraded-state`, which names the degraded-state rule rather than the term the link text picks out. All six are informative-orientation citation handles under GOV-12, not new normative IDs — the normative contracts remain owned and anchored on the topic pages.

## Solution approach

Add bare `<a id>` sub-anchors before each independently-citable sub-claim at the six sites in `docs/spec.md`. For the exclusion clauses, apply matching anchors at both `terminal-outcomes-aggregator` and `errors-and-results.md`'s **Failure.** bullet. For SM-2, anchor the bolded sub-obligation names directly (linking `#pic-emission-visibility` / `#pic-emission-swallow`) and drop the positional `(i)`/`(ii)` labels; for SM-4, add a sibling anchor at the first use of *session-only reasons* and retarget the three SM-5/SM-6 links from `#sm-4-session-only-degraded-state` to it. Convert precondition 3's ordinal back-reference into a link to the new precondition-2 anchor.

## Solution constraints

- New anchors are bare page-local `<a id>` fragments only — do not introduce `**PREFIX-N.**` markers, new REQ-ID prefixes, or GOV-16 inline labels.
- Do not retire, rename, or move the existing umbrella anchors (`terminal-outcomes-aggregator`, `file-extension-grammar`, `sm-4-session-only-degraded-state`) or the two existing Scope-bullet anchors; existing inbound citations must continue to resolve.
- Do not move or alter the "currently five" literal in the `file-extension-grammar` paragraph (GOV-12 keys on its presence anywhere in the paragraph).
- The exclusion-clause anchors on `spec.md` and `errors-and-results.md` must land in the same commit (GOV-12 lock-step parity).

## Relationships

- T11 "Host-runtime umbrella overclaims that Step 0 owns every precondition surface" - same-cluster (the Host-runtime precondition anchors here let T11's narrowed umbrella link `#host-precondition-sdk-capability-surface` rather than re-paraphrase "precondition 3"; land in the same pass).
- T10 "Alias-arm hrefs used for dual-anchored cross-references (GOV-21 violation)" - same-cluster (both touch the Scope / V1 surface; orthogonal anchor vs href edits).
- T07 "Trust-boundary Scope bullet carries the denial-surface rule normatively" - decision-overlap (if T07 moves the denial rule to PIC, the `scope-trust-boundary` anchor's role narrows to a navigation pointer but is still warranted).
- T06 "Runtime observability bullet restates normative emission rules inside an informative section" - decision-overlap (same dynamic for `scope-runtime-observability`).
- T03 "Eight loom 1.0 non-goals lack per-item citation anchors" - same-cluster (same per-item-anchor pattern in the V1 non-goals aggregator; resolves independently).
# T03 - Eight loom 1.0 non-goals lack per-item citation anchors

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2

## Problem

The eight loom 1.0 non-goals at [`future-considerations.md` — V1 non-goals](../../../docs/spec_topics/future-considerations.md#v1-non-goals) render as a bullet list in which only one bullet (`pi-stdio-capture-facet`) carries an inline anchor; the other seven have no per-item anchor on either the source page or the `spec.md` aggregator paragraph. Both umbrella arms (`#v1-non-goals` / `#loom-1-0-non-goals`) cover all eight items indiscriminately, so there is no stable handle below them for a single disposition. Any downstream citation of a specific non-goal must therefore paraphrase the bullet rather than link to it, creating drift risk against the GOV-12 1:1 referent-mapping convention.

## Solution approach

Add an inline anchor to each of the seven currently-unanchored bullets in `future-considerations.md`'s `## V1 non-goals` list, matching the existing `pi-stdio-capture-facet` anchor pattern and using semantic slugs derived from each disposition. In `spec.md`'s `#loom-1-0-non-goals-aggregator` paragraph, link each `;`-separated item to its corresponding source-page anchor.

## Solution constraints

- Preserve the existing `pi-stdio-capture-facet` anchor verbatim — it has inbound links from `pi-integration-contract.md`.
- Preserve the GOV-12 integer-count invariant: the literal "eight" must survive in the aggregator paragraph.

## Relationships

- T10 "Alias-arm hrefs used for dual-anchored cross-references (GOV-21 violation)" - same-cluster (both edit the V1 non-goals aggregator paragraph; co-edit avoids merge churn).
- T02 "Orientation aggregators and Session-Model sub-obligations lack per-item citation anchors" - same-cluster (identical per-item-anchor pattern in adjacent aggregators).
- T01 "Spec-corpus editorial and governance meta-commentary misplaced in implementer-facing orientation" - same-cluster (same V1 non-goals section; the closing-paragraph deletion is independent).
# T04 - Source-language stability observable-(c) lead clause defines equivalence as "byte-identical" before introducing the normalisation carve-out

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The Source-language stability bullet (`id="source-language-stability"`) defines observable (c) equivalence with a lead clause that calls two content strings "byte-identical" before introducing the placeholder-normalisation carve-out. The headline "byte-identical" lands first and, after two em-dashed asides, reads on first parse as strict whole-string byte-identity; the qualifying "after normalising the placeholder sub-fields" clause arrives too late to prevent the misreading. The intended reading — that only the fixed (non-variable) bytes are byte-identical, once the variable placeholder sub-fields are normalised — is recoverable only by re-reading or by following downstream sentences, which makes the headline clause unsafe to quote or skim in isolation.

## Solution approach

Rewrite the observable (c) equivalence lead clause in the `id="source-language-stability"` bullet so the placeholder-normalisation operation is stated before the byte-identity claim, and scope byte-identity to the fixed (non-variable) bytes that remain after normalisation. Keep the existing cross-references to [Lexical — Encoding](./spec_topics/lexical.md) and [Diagnostics — Placeholder rendering](./spec_topics/diagnostics.md#placeholder-rendering-normative).

## Solution constraints

- Out of scope: the GOV-15-owned ceiling-set carve-out paragraph and the other sentences of the bullet; confine the edit to the observable (c) equivalence lead clause and do not change the equivalence relation's normative meaning.

## Relationships

None
# T05 - SM-7c orientation framing asserts per-session slash-handler serialisation as a Pi guarantee without the presupposition framing the deeper section actually uses

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

SM-7c sub-clause (i) at `sm-7c-slash-handler-serialisation` derives prompt-mode sequential execution from "Pi's per-session slash-handler serialisation" as a bare free-standing premise — no presupposition framing, no link to the precondition section, no acknowledgement that the SDK surface-inventory test cannot detect a weakening. PIC-2 at `pic-2` likewise introduces the property as a "guarantee". The deep normative section at PIC `#snapshot-restore-pi-behavioural-preconditions` treats the same property correctly as an unpinned *behavioural precondition* whose detection routes to editorial review (bump-checklist item (e)) rather than to a build-time assertion. A reader who arrives at the orientation citations without following links can treat the property as a Pi-side guarantee and miss its unpinned status.

## Solution approach

Rewrite SM-7c sub-clause (i) at `sm-7c-slash-handler-serialisation` to follow the SM-1 presupposition pattern at `sm-1-single-active-session-binding`: name the property as a behavioural precondition loom presupposes rather than a guarantee Pi provides, and add forward-links to PIC `#snapshot-restore-pi-behavioural-preconditions` and to the bump-checklist item `#bump-checklist-slash-dispatch-serialisation`. Rewrite PIC-2's introducing sentence at `pic-2` to drop "guarantee" for the same behavioural-precondition framing, keeping its existing link to `#snapshot-restore-pi-behavioural-preconditions`.

## Solution constraints

- Out of scope: `#snapshot-restore-pi-behavioural-preconditions`, bump-checklist item (e) at `#bump-checklist-slash-dispatch-serialisation`, and the recovery-mutex paragraph — the normative substance is already correct there; only the upstream orientation framing changes.
- Preserve the existing anchor IDs `sm-7c-slash-handler-serialisation` and `pic-2`; inbound citations already resolve to them.

## Relationships

- T01 "Spec-corpus editorial and governance meta-commentary misplaced in implementer-facing orientation" - same-cluster (both touch the SM orientation surface; T01 relocates the SM anchor-scheme metadata, this one rewrites SM-7c(i); resolve independently).
# T06 - Runtime observability bullet restates normative emission rules inside an informative section

**Kind:** placement
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The Scope subsection in `docs/spec.md` declares its bullets *informative orientation*: each is supposed to forward-link the topic page that owns the normative contract. The **Runtime observability** bullet violates that framing — it states declaratively the always-log-set emission rule, the success-side `Ok(v)` null-policy, and the shared-channel parse/load/type/runtime-panic diagnostics rule. Each clause is the normative MUST / MUST NOT in force, not a paraphrase, and the canonical owners (`pi-integration-contract.md` **Runtime event channel** paragraph, `#success-side-null-policy`, and `diagnostics.md`) are already named, so the bullet duplicates obligations it should only point at. No GOV-12 lock-step gate covers informative-bullet body text, so the duplicate drifts silently on the next edit to either owner; the in-line success-side clause is also ambiguous (whole-run-silence vs outcome-keyed-silence) where `#success-side-null-policy` states the intended outcome-keyed reading unambiguously.

## Solution approach

Rewrite the **Runtime observability** bullet in `docs/spec.md`'s Scope subsection into a navigation pointer matching the conforming no-seam Scope bullets. Keep a one-line orientation sentence naming the operator-facing `loom-system-note` surface and forward-link the canonical owners: the **Runtime event channel** paragraph and `#success-side-null-policy` in `pi-integration-contract.md`, `diagnostics.md` for the parse/load/type/runtime-panic batches, and the deferred-telemetry link to `future-considerations.md`. Delete the in-line success-side clause rather than rewriting it at `#success-side-null-policy`.

## Solution constraints

- Out of scope: `pi-integration-contract.md` and `diagnostics.md` — they already carry the full normative content; this is a delete-and-redirect on the `spec.md` side only.

## Relationships

- T07 "Trust-boundary Scope bullet carries the denial-surface rule normatively" - same-cluster (identical defect on the adjacent Trust boundary bullet; identical pointer-only remedy; independent edits).
- T02 "Orientation aggregators and Session-Model sub-obligations lack per-item citation anchors" - decision-overlap (the `scope-runtime-observability` anchor T02 adds narrows to a navigation-pointer target if this fix lands, but is still warranted).
- T01 "Spec-corpus editorial and governance meta-commentary misplaced in implementer-facing orientation" - same-cluster (Scope-section hygiene; land in the same pass to leave the section consistent).
# T07 - Trust-boundary Scope bullet carries the denial-surface rule normatively

**Kind:** placement
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The Orientation → Scope subsection's lead paragraph frames its bullets as *informative orientation*: each bullet forward-links the topic page that owns the normative contract. The Trust boundary bullet violates that framing by stating the denial-surface rule in its own voice — "Host-side denials of filesystem, network, or Pi-API access reach loom code **only** through the tool that issued the request, and silent success on denial is forbidden" — without forward-linking the canonical owner at `pi-integration-contract.md#no-extra-mediation`. The bullet's wording also inserts "only", a tightening the canonical PIC sentence omits, producing a divergence GOV-12 lock-step audits cannot catch because the two paragraphs share no anchor or quote-fence.

## Solution approach

In `docs/spec.md`'s Trust boundary bullet, rewrite the in-line denial-rule sentence into a navigation pointer to `pi-integration-contract.md#no-extra-mediation`, dropping the "only" tightening so the orientation copy no longer asserts a constraint the canonical owner does not. Retain the existing forward-links to Tool Calls — Failures and `#tool-execution-from-loom-code` for the observable `execute()` outcome enumeration.

## Solution constraints

- Out of scope: do not add an `<a id>` anchor to the Trust boundary Scope bullet — the missing-anchor concern is owned by T02, and adding one here would collide on the same line range.

## Relationships

- T06 "Runtime observability bullet restates normative emission rules inside an informative section" - same-cluster (identical pattern on the adjacent bullet; identical pointer-only remedy; independent edits).
- T02 "Orientation aggregators and Session-Model sub-obligations lack per-item citation anchors" - decision-overlap (if this rule moves to PIC, the `scope-trust-boundary` anchor's role narrows to a navigation pointer but is still warranted).
- T01 "Spec-corpus editorial and governance meta-commentary misplaced in implementer-facing orientation" - same-cluster (touches the same Scope lead paragraph that establishes the "informative orientation" framing this finding relies on; clarifying that framing strengthens the basis for the pointer-only rewrite).
# T08 - `diagnostics.md` — category-4 numeric MUST for `Infinity`/`NaN` is unreachable and has no test seam

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

In `docs/spec_topics/diagnostics.md` § "4. Numeric placeholders", the
`Rule.` paragraph declares `Infinity`/`NaN` unreachable for the numeric
placeholders "by construction" and, in the same sentence, imposes a MUST
that a renderer encountering one route it through `loom/runtime/internal-error`
rather than emitting it into a panic message. The enumerated placeholders
are all sourced from runtime quantities the spec bounds elsewhere, so no
`.loom` program or end-to-end conformance vector can drive a placeholder
to a non-finite value, and no renderer-level injection seam or unit-test
contract is named in `diagnostics.md` or `errors-and-results.md`. The MUST
is therefore unfalsifiable by any conformance suite limited to spec-defined
inputs, and two implementers can diverge (defensive finite-check vs. omitted
check) while both claiming conformance.

## Solution approach

Make the category-4 routing obligation testable. In `diagnostics.md`
§ "4. Numeric placeholders", rewrite the `Infinity`/`NaN` routing clause to
specify a renderer-internal, debug-build-only injection seam (or a
unit-testable pure-function renderer contract) and require renderer-level
unit-test coverage. Add a normative test vector that exercises the seam and
asserts emission of `loom/runtime/internal-error` carrying a discriminator,
with no `NaN`/`Infinity` reaching the panic message. Add that discriminator
to the `loom/runtime/internal-error` row's *Trigger* description in the
`loom/runtime/*` registry section.

## Solution constraints

- The injection seam MUST NOT be reachable from `.loom` source in production
  builds — it must not become a new ambient capability or a new
  loosely-specified conformance obligation.

## Relationships

- T09 "`tool_loop_exhausted` row's `null` rendering is a normative MUST with no V1-reachable exerciser" - same-cluster (identical pattern: a normative renderer MUST guarded by an "unreachable by construction" precondition with no injection seam; a single shared renderer test-seam / pure-function contract resolves both, but each obligation can stand independently).
# T09 - `tool_loop_exhausted` row's `null` rendering is a normative MUST with no V1-reachable exerciser

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `tool_loop_exhausted` row of the per-`kind` renderer table on `slash-invocation.md` is a normative template — the "normative templates" prose mandates verbatim template emission and permits conformance tests to assert the exact rendered string. The row pins a MUST sub-rule: when `last_tool_name` is `null`, the `<last_tool_name>` placeholder renders as the literal string `respond`. That `null` branch has no loom 1.0-reachable input; `slash-invocation.md`, `errors-and-results.md`'s `last_tool_name` field comment, and `query.md`'s "Forced respond turn non-compliance" all converge on its unreachability via CIO-4 forced-respond routing. The spec names no renderer-level injection seam or unit-test contract, so a 1.0 conformance suite cannot exercise the `(last tool: respond)` output even though it is phrased as a MUST.

## Solution approach

Clarify the renderer prose on `slash-invocation.md` (the "normative templates" paragraph) to state that the per-`kind` renderer is a pure function from `QueryError` plus invocation-chain metadata to a system-note string, and that conformance tests MAY construct `QueryError` values directly — including the `null`-`last_tool_name` branch that loom 1.0 driving cannot reach. Add a conformance vector exercising the `tool_loop_exhausted` row's `null` case so the MUST becomes unit-testable. Update the cross-reference in `errors-and-results.md`'s `last_tool_name` field comment so its "retained for forward compatibility" annotation grounds out in that vector.

## Solution constraints

- Out of scope for `errors-and-results.md`: substantive edits to the `ToolLoopExhaustedError` schema or its field semantics; the only change there is the `last_tool_name` field comment's cross-reference.

## Relationships

- T08 "`diagnostics.md` — category-4 numeric MUST for `Infinity`/`NaN` is unreachable and has no test seam" - same-cluster (identical unreachable-MUST testability pattern; the pure-function-renderer paragraph is the natural shared resolution; resolvable independently).
# T10 - Alias-arm hrefs used for dual-anchored cross-references (GOV-21 violation)

**Kind:** doc-alignment-broad
**Importance:** high
**Score:** 100
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

`docs/spec.md` cites two dual-anchored targets via their `v1-non-goals` alias arms rather than the canonical `loom-1-0-…` arms, violating [GOV-21-1 *Canonical arm*](./spec_topics/governance.md#gov-21-canonical-arm) (new in-corpus cross-references to a dual-anchored target MUST cite the canonical arm). The cross-page target is `future-considerations.md`'s `#loom-1-0-non-goals` arm; the self-reference target is `spec.md`'s own `#loom-1-0-non-goals-aggregator` arm. Leaving the alias-arm citations in place undermines the dual-anchor convention and invites further alias-arm citations from authors copying the pattern.

## Solution approach

In `docs/spec.md`, rewrite the alias-arm hrefs to cite the canonical arm. Cross-page citations to `./spec_topics/future-considerations.md#v1-non-goals` become `./spec_topics/future-considerations.md#loom-1-0-non-goals`; self-referencing `#v1-non-goals` hrefs become `#loom-1-0-non-goals-aggregator`. The two target slugs differ — do not collapse the self-reference slug onto the cross-page slug.

## Solution constraints

- Out of scope: the `#surface-extensions-v1-leaves-a-seam` citations — that target carries no authored `<a id>` arms and is not dual-anchored (a separate GOV-21 *Incidental auto-id prohibition* concern).
- Do not remove or alter the `<a id="v1-non-goals">` alias arms at either target site; they remain present per [GOV-21-2 *Alias permanence*](./spec_topics/governance.md#gov-21-alias-permanence).

## Relationships

- T03 "Eight loom 1.0 non-goals lack per-item citation anchors" - same-cluster (operates on the same V1-non-goals aggregator paragraph; co-edit avoids merge churn).
- T01 "Spec-corpus editorial and governance meta-commentary misplaced in implementer-facing orientation" - decision-overlap (T01's V1-non-goals closing-paragraph deletion removes two of the offending hrefs; resolve the remaining-citation scope consistently — preferably land T01's deletion first so this fix does not canonicalise hrefs that get deleted).
- T02 "Orientation aggregators and Session-Model sub-obligations lack per-item citation anchors" - same-cluster (both touch the Scope / Forward-compatibility-seams surface; orthogonal anchor vs href edits).

