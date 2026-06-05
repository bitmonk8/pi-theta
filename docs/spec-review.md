# Triaged Spec Review - spec

_Generated: 2026-06-04T21:31:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T34) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 8 high, 15 medium retained; 12 low discarded; 10 low findings merged into 4 medium findings; 3 nit dropped; 0 false dropped._

---

# T01 - Governance retirement tables ship unresolved commit-SHA placeholders

**Kind:** cruft, traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

Two sibling governance retirement tables carry literal placeholder strings in their `Retired in` columns instead of concrete commit SHAs or release tags, violating each table's stated column-value contract. The Retired REQ-IDs sub-table at `docs/spec_topics/governance/anchor-scheme-and-retired.md` (anchor `id="retired-req-ids"`) lists GOV-2, GOV-4, GOV-10, and GOV-11 with the literal `<retirement commit>` placeholder; only GOV-13 carries a concrete SHA. The Retired prefixes sub-table at `docs/spec_topics/governance/req-id-prefix-table-retired.md` carries the literal `<demotion commit>` in its `PIE` row. The placeholders were meant to be overwritten at retirement/demotion time but shipped unresolved, so the only surviving evidence of retirement is the row's presence, and any tooling validating the `Retired in` columns rejects four of five REQ-ID rows and the lone `PIE` row.

## Solution approach

Backfill each placeholder cell with the abbreviated commit SHA of the historical commit that performed the retirement/demotion, following the GOV-13 row's format; the retiring commits are recoverable via git history on each retirement-row's text. Resolve the `PIE` row in `req-id-prefix-table-retired.md`: backfill its SHA when the demoting commit is in history, otherwise land the demotion first or remove the row until the demotion is performed. When the `PIE` cell is backfilled, also strip the now-dangling `<demotion commit>` parenthetical in that section's column-contract paragraph.

## Solution constraints

- Each backfilled value MUST be the SHA of the historical commit that performed the retirement/demotion, never the SHA of the repair commit that backfills the cell.

## Relationships

None
# T02 - `invocation_id` allocation site described inconsistently for non-slash entry points

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The `loom/runtime/reload-teardown-timeout` row in `code-registry-runtime.md` describes `<invocation-id>` as the UUID the runtime allocates "at handler entry", but the registry source of truth (`active-invocation-registry.md`) allocates it at registry-insertion time inside the Dispatch-site setup wrap across all three insertion sites — the slash-command handler, the `tool.execute(...)` adapter, and the `invoke` spawn-site. "Handler entry" has no referent at the two non-slash arms, so an implementer reading the row in isolation may scope id allocation to the slash arm only and omit it for `tool.execute`-only and `invoke`-only invocations. Separately, the same clause attributes the canonical lowercase 8-4-4-4-12 hex form to "the runtime's `loom-direct:<uuid>` synthesis convention", but `loom-direct:` is the prefix convention for synthesised `toolCallId` values, not `invocationId`; the form's source of truth is §7 of `placeholder-rendering-b.md`.

## Solution approach

Rewrite the `<invocation-id>` clause in the `loom/runtime/reload-teardown-timeout` row of `code-registry-runtime.md` to defer to `active-invocation-registry.md#active-invocation-registry` as source of truth for the allocation site — all three insertion sites, at registry-insertion time inside the Dispatch-site setup wrap — and to cite §7 of `placeholder-rendering-b.md` for the canonical lowercase 8-4-4-4-12 hex form. Delete the `loom-direct:<uuid>` reference.

## Solution constraints

- None.

## Relationships

None
# T03 - Convention references README status table and CHANGELOG/notes files that do not exist

**Kind:** doc-alignment-broad
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The *Doc updates* bullet under "Cross-cutting rules (every leaf)" in
`docs/plan_topics/conventions.md` directs every leaf to update `README.md`'s
status table, append a dated entry to `CHANGELOG.md`, and record non-plan
discoveries in `notes.md`. None of these artifacts exist: `README.md`'s
`## Status` section is prose with no table, and `CHANGELOG.md` and `notes.md`
are absent at the repo root. The bullet grants no permission to create them on
first use and no leaf is scoped to bootstrap them, so the first leaf executed
must either improvise all three artifact shapes or silently skip the obligation.

## Solution approach

Rewrite the *Doc updates* bullet in `docs/plan_topics/conventions.md` so the
obligation self-bootstraps — granting create-if-absent semantics before each
update/append — and pin the artifact schemas inline in the same bullet: the
status-table column set, the changelog-entry line format, and the role of
`notes.md` as a free-form running log.

## Solution constraints

- Out of scope: creating `CHANGELOG.md`, `notes.md`, or a README status table
  as part of this fix — the reworded bullet authorises first-leaf creation on
  first use; do not ship placeholder artifacts ahead of real content.

## Relationships

None
# T04 - Namespace-clearance subsection: missing `--loom` flag clearance and dated/editorial chrome

**Kind:** assumptions, cruft
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The `### File-extension namespace` subsection of `discovery-sources.md` (anchor `#file-extension-namespace`) is loom's home for Pi-namespace clearance decisions, but it treats its three coined tokens inconsistently and carries time-relative/editorial chrome the rest of the spec avoids. loom 1.0 coins the `.loom`/`.warp` extensions, the `pi.looms` manifest key, and the `--loom` CLI flag name; the first two carry explicit clearance notes while `--loom` gets none, and the silent first-load-wins cross-extension collision behaviour of `pi.registerFlag('loom', …)` is unrecorded. The subsection opens with an undated "At the time of writing" qualifier where the rest of the spec anchors such surveys to the loom 1.0 Pi-SDK pin. It also contains a maintainer-facing aside instructing where a hypothetical future collision should be documented, which constrains no loom 1.0 implementation decision.

## Solution approach

Add a third namespace-clearance paragraph to the `### File-extension namespace` subsection covering the `--loom` flag, scoped to the loom 1.0 Pi-SDK pin, recording that `pi.registerFlag('loom', …)` does not throw on name overlap so a later sibling extension registering `'loom'` is silently shadowed with no diagnostic. Forward-link the new paragraph from `registration-steps.md` step 1's `pi.registerFlag('loom', …)` clause. Re-anchor the opening "At the time of writing" claim to the loom 1.0 Pi-SDK pin. Delete the maintainer-facing aside, retaining the following sentence that records the no-REQ-ID / no-test / no-diagnostic status of the check.

## Solution constraints

- Phrase the flag-collision behaviour observationally, not by citing the bundled `loader.js` resolution symbol as load-bearing (per T06's known-fragile-evidence discipline).
- Out of scope: introducing a new diagnostic code, REQ-ID, or per-leaf test obligation — the clearance check records the namespace decision only.

## Relationships

- T05 "Host presuppositions lack version-bump-procedure re-audit hooks" - same-cluster (sibling unpinned-host-assumption hygiene; resolve independently).
- T06 "PIC external-entity citations lack consistent fragility/re-audit framing" - same-cluster (the new flag-collision rule must be phrased observationally rather than by anchoring to the bundled loader symbol, per that finding's discipline).
# T05 - Host presuppositions lack version-bump-procedure re-audit hooks

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

Two load-bearing host presuppositions about Pi behaviour are asserted as fact in the spec but are absent from the `version-bump-step2.md` editorial-review checklist (items (a)–(l)) that exists to catch silent drift of this class on each Pi minor bump. First, `runtime-event-channel.md`'s *Custom-message channel persistence and LLM-context entry* paragraph asserts that Pi's `convertToLlm` transform converts every `CustomMessage` (including `display: false` notes) to a `{ role: "user", content }` provider-context entry on every subsequent call — underpinning the operator-observability claim, the binder compact-transcript rationale in `binder-model-and-context.md`, and the `error-model.md` pre-evaluation-note citation. Second, the *Settings file reads* section of `package-and-settings.md` states only the read-side fact about loom-owned keys and never the write-side requirement that Pi MUST NOT strip unknown `loomPaths` / `looms.*` keys when it serialises `settings.json` back to disk. Both presuppositions are unobservable from the loom-side SDK surface, so each is enforceable only by editorial audit at the Pi minor bump — the mechanism items (a)–(l) provide and these two lack.

## Solution approach

Add two lettered items to the `version-bump-step2.md` editorial-review checklist after items (a)–(l), each carrying its own stable anchor, and update the preamble item-range phrasing to cover them in the same edit. One item directs a re-audit of `convertToLlm`'s `CustomMessage`-to-LLM-context behaviour against the candidate Pi minor, baselined against the loom-pin snapshot per `#pi-sdk-pin`; the other directs a re-audit of settings write-back key preservation for `loomPaths` and `looms.*` across both the project and global settings files. Add a stable anchor to the *Custom-message channel persistence and LLM-context entry* paragraph in `runtime-event-channel.md` with a back-reference to the convertToLlm checklist item. Add a presupposition paragraph carrying a stable anchor to `package-and-settings.md`'s *Settings file reads* section stating the Pi-side write-back preservation requirement, cross-linked to the settings checklist item.

## Solution constraints

- The `version-bump-step2.md` editorial-review checklist is a shared absorption site with T06; assign the new items' letters so they do not collide with the checklist item(s) T06 appends to the same checklist.

## Relationships

- T06 "PIC external-entity citations lack consistent fragility/re-audit framing" - same-cluster (same `dist/*.js`-evidence fragility against the same Pi minor; shares the editorial-review checklist absorption site).
- T04 "Namespace-clearance subsection" - same-cluster (sibling unpinned-host-assumption hygiene).
- T16 "`always-log set` definition is narrower than its actual membership" - same-cluster (same canonical page `runtime-event-channel.md`; independent defect on a different paragraph).
- T32 "`AgentSession` consumed member surface not pinned" - same-cluster (another host-surface assumption not in the pinned-surfaces / re-validation set; resolves independently).
# T06 - PIC external-entity citations lack consistent fragility/re-audit framing

**Kind:** external-entities
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 4
**Shape:** single
**State:** reduced

## Problem

Three adjacent PIC sites cite Pi-owned or bundled-internal surfaces with the typographic weight of stable contract, diverging from the known-fragile-evidence discipline established on `tool-registration-lifetime.md` (declaration file = source of truth; inline shape = loom-touched subset; bundled `dist/*.js` evidence flagged fragile and routed through the `version-bump-step2.md` editorial-review checklist). `registration-steps.md` step 2 narrates pre-bind extension-runtime semantics via four pointers into Pi's bundled private implementation — the `notInitialized`-tagged action-method slots, `dist/core/extensions/loader.js`, the private `Runner.bindCore()`, and the verbatim throw string — as flat fact with no fragility flag and no bump-checklist hook. The *Re-registration within an extension* and *`customType` ownership and collision rule* bullets under `extension-bootstrap-and-per-loom.md`'s `#renderer-registration` narrate the loader `Map` and the runner's `getMessageRenderer` first-hit iteration as load-bearing background without the same framing, and the *Signature.* block labels the externally-owned `MessageRenderer` declarations "reproduced verbatim from `dist/core/extensions/types.d.ts`" — a posture in which a future Pi rename makes the spec wrong rather than stale. The observable loom-normative rules on all three surfaces do not need the internal-symbol details to be load-bearing; they are illustrative evidence at the loom 1.0 pin treated with the weight of stable contract.

## Solution approach

Apply `tool-registration-lifetime.md`'s known-fragile-evidence framing to `registration-steps.md` step 2 and to the renderer-resolution narration under `extension-bootstrap-and-per-loom.md`'s `#renderer-registration`, keeping the observable rules normative and flagging the bundled-symbol pointers as fragile evidence. Rewrite the *Signature.* block's "reproduced verbatim … normative" claim to mirror the loom-load-bearing-subset / re-validation phrasing used on `host-interfaces-core.md`'s `ExtensionContext` / `SessionContext` blocks. Add a checklist item to `version-bump-step2.md` covering the pre-bind throw-closure evidence and the renderer-resolution behaviour, with its own `<a id>` anchor continuing the existing lettered sequence, and forward-link it from the affected sites by anchor rather than ordinal.

## Solution constraints

- The `MessageRenderer` / `MessageRenderOptions` / `registerMessageRenderer` code block under the *Signature.* heading reproduces an externally-owned declaration; its content is out of scope — change only the surrounding framing prose.

## Relationships

- T05 "Host presuppositions lack version-bump-procedure re-audit hooks" - same-cluster (the `convertToLlm` presupposition lands in the same editorial-review checklist; share the checklist's letter assignment).
- T04 "Namespace-clearance subsection" - same-cluster (the new flag-collision rule must be phrased observationally rather than anchoring to the bundled loader symbol, per this finding's discipline).
- T30 "Subagent-spawn satellite types not pinned to a declaration file" - same-cluster (PIC pinning posture for consumed Pi surfaces; resolves independently).
- T32 "`AgentSession` consumed member surface not pinned" - same-cluster (mirror problem — under-pinned vs over-claimed external surface; same declaration-file/loom-load-bearing-subset/re-validation discipline is the resolution template).
# T07 - GOV-21 bundles five independently testable sub-clauses under one REQ-ID

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

GOV-21 on `docs/spec_topics/governance/release-version-naming.md` is a single REQ-ID whose body carries five independently normative sub-clauses — *Canonical arm* (`gov-21-canonical-arm`), *Alias permanence* (`gov-21-alias-permanence`), *Intensional definition* (`gov-21-intensional-definition`), *Retirement discharge* (`gov-21-retirement-discharge`), and *Cross-page canonical-arm uniqueness* (`gov-21-canonical-arm-uniqueness`) — each pinned by its own page-local anchor and each able to pass or fail independently. Because GOV-21 is the only REQ-ID in scope, the per-leaf coverage matrix can cite nothing narrower than the whole, so a test exercising one sub-clause is indistinguishable from one exercising all five. The `gov-21-*` sub-anchors are not formal REQ-IDs under GOV-1's *Canonical form* criterion (they lack the `**PREFIX-N.**` marker), and the spec is silent on their status.

## Solution approach

Split GOV-21 on `release-version-naming.md` into five peer REQ-IDs under the already-registered `GOV` prefix — one per currently-bundled sub-clause — authored in dual-form per GOV-1, and retire GOV-21 per GOV-8. Keep the two nested anchors (`gov-21-incidental-auto-id`, `gov-21-version-segment-position`) as page-local clarifying anchors under their owning new REQ-ID. Rewrite the single inbound `#gov-21-retirement-discharge` citation on `anchor-scheme-and-retired.md` to target the new Retirement-discharge REQ-ID anchor.

## Solution constraints

- Out of scope: the `.pi/project-config.md` Spec-rules GOV snapshot, owned by T15.

## Relationships

- T10 "BNDR-6 packs 19 independently testable rendering pairs under one REQ-ID" - same-cluster (same bundling shape, independent owning page).
- T08 "ERR-5 conflates two distinct pre-evaluation failure surfaces" - same-cluster (same bundling shape).
- T09 "SLSH-4 covers 11 independently normative template rows" - same-cluster (same bundling shape).
- T15 "`.pi/project-config.md` Spec-rules understates the GOV set and omits GOV-22" - same-cluster (if GOV-21 splits into multiple GOV REQ-IDs, the project-config GOV-snapshot must be updated in the same edit; otherwise independent).
# T08 - ERR-5 conflates two distinct pre-evaluation failure surfaces under one anchor

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

ERR-5 in `docs/spec_topics/errors-and-results/error-model.md` names two distinct pre-evaluation failure surfaces under one `#err-5` anchor: (a) binder argument-binding failure at ceiling #3, and (b) the slash-load `params` arm of ceiling #4 cross-routed through ceiling #3's no-retry classification per CIO-1. These sit at different enforcement points and are cited by different sibling pages, yet share one anchor — contradicting the list's own closing paragraph, which asserts each item is an independent normative obligation carrying a separate per-item `ERR-N` anchor. A conformance test for the ceiling-#4 `params` path can cite nothing narrower than ERR-5, and GOV-12 lock-step bookkeeping cannot track the two surfaces independently.

## Solution approach

Split the ceiling-#4 slash-load `params` arm out of ERR-5 into its own top-level list item under a newly-minted next-free `ERR-N`, leaving ERR-5 scoped to the ceiling-#3 binder argument-binding obligation only. Update the preceding paragraph's count assertion ("the seven below") and the closing paragraph's item cardinality to match the new list length, per the GOV-12 lock-step convention that paragraph already names. Audit inbound citations to `#err-5` in `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` and `docs/spec_topics/binder/defaulting-system-note-echo.md`, repointing any reference that meant the cross-routed `params` arm at the new anchor.

## Solution constraints

- The new `ERR-N` must be the next free integer under the registered `ERR` prefix per GOV-3 (`max(live ∪ retired) + 1`); do not reuse a retired or live ID.
- Existing ERR-6 and ERR-7 anchors are stable identifiers, not positional ordinals — do not renumber or repoint them.

## Relationships

- T10 "BNDR-6 packs 19 independently testable rendering pairs under one REQ-ID" - same-cluster (same REQ-ID-granularity defect class; resolves independently).
- T09 "SLSH-4 covers 11 independently normative template rows" - same-cluster (same defect class).
- T07 "GOV-21 bundles five independently testable sub-clauses" - same-cluster (same defect class).
# T09 - SLSH-4 covers 11 independently normative template rows under one REQ-ID

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

SLSH-4 (anchor `slsh-4` on `docs/spec_topics/slash-invocation.md`) states a single umbrella MUST and is immediately followed by a per-`kind` formatting table whose body holds eleven independently normative rendering rows — ten typed-`kind` rows plus the catch-all row — and its prose states that conformance tests MAY assert on each row's exact rendered string. Because every row sits under the single `slsh-4` anchor, a test or coverage-matrix leaf exercising only one row has nothing narrower than SLSH-4 to cite, and per-row pass/fail is indistinguishable in REQ-ID-keyed traceability. The same anti-pattern recurs at BNDR-6 (T10), ERR-5 (T08), and GOV-21 (T07).

## Solution approach

Give each of the eleven template rows (the ten typed rows plus the catch-all) its own stable, cross-citable identifier while keeping SLSH-4 as the parent REQ-ID owning the umbrella MUST. Both of the project's governed mechanisms fit — a sub-ID split of SLSH-4 (per the `CIO-4`→`CIO-4a/4b/4c` precedent in `.pi/project-config.md`) or a new inline-label prefix on `slash-invocation.md` (per GOV-16 and the `HC3-a`…`HC3-e` precedent on `governance/stable-inline-labels.md`); the choice is the implementer's. Register the chosen scheme in the governance prefix registry under `docs/spec_topics/governance/`, and add the new per-row identifiers to the GOV-12 lock-step coverage enumeration on the same terms as `HC3-a`…`HC3-e`.

## Solution constraints

- Out of scope: the BNDR-6 (T10), ERR-5 (T08), and GOV-21 (T07) tables — edit only SLSH-4's per-`kind` table.
- Preserve the existing `slsh-4` anchor and the SLSH-4 parent REQ-ID; do not retire or renumber it (incoming cross-references resolve to it).

## Relationships

- T10 "BNDR-6 packs 19 independently testable rendering pairs under one REQ-ID" - same-cluster (identical shape: one parent REQ-ID over N normative table rows; apply the fix mechanism symmetrically).
- T08 "ERR-5 conflates two distinct pre-evaluation failure surfaces" - same-cluster (same anti-pattern at smaller N).
- T07 "GOV-21 bundles five independently testable sub-clauses" - same-cluster (same anti-pattern on the governance prefix).
# T10 - BNDR-6 packs 19 independently testable rendering pairs under one REQ-ID

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`BNDR-6` on `docs/spec_topics/binder/defaulting-system-note-echo.md` is a single REQ-ID whose body is a multi-row normative table of input/output rendering pairs, each an independently failing obligation spanning disjoint type-switch categories (string-quoting, enum round-trip, array elision, object first-field hint, `integer`/`number`/`-0`/`1e21` numeric pins, boolean, null). Citing `BNDR-6` from a test, a coverage-matrix leaf, or a failure report names the whole table indistinguishably — a regression in any one row surfaces only as "BNDR-6 failed", and a leaf cannot signal which obligations it closes. Adjacent `BNDR-4` and `BNDR-5` already carry one obligation per REQ-ID, making `BNDR-6` the only place in the prefix where ~20 distinct claims share an ID.

## Solution approach

Split `BNDR-6` into one sub-ID per table row (`BNDR-6-1` … one per row, numeric tails) in GOV-1 dual-form layout, following the `CIO-4`→`CIO-4a/4b/4c` sub-ID-split precedent in `.pi/project-config.md`. Retain the existing `id="bndr-6"` anchor on the preamble sentence as the umbrella parent MUST. Assign sub-IDs in the table's current row order.

## Solution constraints

- Do not retire `BNDR-6`; the parent preamble MUST stays load-bearing and its `id="bndr-6"` anchor must remain stable so incoming cross-references continue to resolve.

## Relationships

- T09 "SLSH-4 covers 11 independently normative template rows" - same-cluster (identical shape; apply the fix mechanism symmetrically).
- T08 "ERR-5 conflates two distinct pre-evaluation failure surfaces" - same-cluster (same pattern, smaller cardinality).
- T07 "GOV-21 bundles five independently testable sub-clauses" - same-cluster (same pattern on the governance prefix).
- T22 "Echo rendering of an object whose first field is a composite is unspecified" - same-cluster (adds a BNDR-6 row; order so the renumbering lands after the new rows or the new rows take the next sub-IDs).
- T24 "BNDR-5 scientific-notation prohibition does not cover the sub-1e-7 end" - same-cluster (adds a BNDR-6 row; the added row mints the next sub-ID).
# T11 - Type-compatibility rules are cited by positional ordinal with no per-rule anchor

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `T₁ ⊑ T₂` type-compatibility relation in `type-system.md` is defined as an eight-row table ("Structural cases the parser must recognise") under the section anchor `#type-compatibility`, but the rows carry no per-rule REQ-ID anchors even though `type-system.md` owns the registered `TYPE` prefix. Downstream pages and the table itself cite individual rows by positional ordinal — "rule 2", "rules 5–6", "Reflexivity (rule 1)", "Combined with rule 4" — across `expressions.md`, `query/query-forms.md`, and `type-system.md` itself; every such citation breaks silently if the table is reordered or split. Because `type-system.md` is a non-narrative page, GOV-9's cross-link contract requires these cross-page dependencies to resolve as `#prefix-n` fragments, which is impossible while no `TYPE-N` anchor exists.

## Solution approach

Add per-row REQ-ID anchors `TYPE-1` through `TYPE-8` to the "Structural cases the parser must recognise" table rows in `type-system.md`, in GOV-1 dual-form layout. Re-point each positional-ordinal citation to the corresponding per-row anchor: the `(rule N)` parentheticals in `expressions.md`'s array-LUB rule and `+`/`-`/`*`/`%`/comparison operator paragraphs, the "Type-compatibility rule 2 / Reflexivity (rule 1) / Variant-to-union (rule 4)" citations in `query/query-forms.md`, and the intra-page "Combined with rule 4" back-reference in the `type-system.md` rule-5 row.

## Solution constraints

- The `TYPE` prefix is already registered in `req-id-prefix-table-active-a.md`; do not add or edit a prefix-table row.
- Out of scope: the `void`-does-not-participate-in-`⊑` note (owned by T17).

## Relationships

- T10 "BNDR-6 packs 19 independently testable rendering pairs under one REQ-ID" - same-cluster (multi-row table under one identifier; same fix shape, different page).
- T09 "SLSH-4 covers 11 independently normative template rows" - same-cluster (bundled-obligation traceability defect).
- T08 "ERR-5 conflates two distinct pre-evaluation failure surfaces" - same-cluster.
- T07 "GOV-21 bundles five independently testable sub-clauses" - same-cluster.
- T12 "`tools:` allowlist enforcement cross-reference violates GOV-9 `#prefix-n` form" - same-cluster (GOV-9 `#prefix-n` cross-link contract violation, distinct site; same coin-then-link edit shape).
- T17 "`void` is admitted by the grammar but absent from the Type System enumeration" - same-cluster (both touch `type-system.md`; the new `TYPE-N` anchors are the natural place to anchor the `void`-does-not-participate-in-`⊑` note, but neither depends on the other).
- T19 "`%` operand-typing rule contradicts the `integer ⊑ number` widening pattern" - same-cluster (the `%` clause's "(rule 2)" ordinal is one of the citations this finding tracks).
- T15 "`.pi/project-config.md` Spec-rules understates the GOV set and omits GOV-22" - must-follow (a fixer working only from project-config would not know GOV-22 obliges coinage; landing that fix first reduces the chance the TYPE-N coinage is skipped).
# T12 - `tools:` allowlist enforcement cross-reference violates GOV-9 `#prefix-n` form

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The "No additional access channels" rule on `conversation-drive.md` (`#no-extra-mediation`) cites the per-loom `tools:` allowlist "whose enforcement is specified above" — a positional paraphrase, not a stable anchor link. The depended-upon enforcement contract (the active-set snapshot / `pi.setActiveTools` swap / `finally` restore protocol) lives on a different page, `tool-registration-lifetime.md`, so "above" does not resolve on the rendered page. GOV-9 requires a non-narrative page depending on another page's normative rule to link it by that rule's specific `#prefix-n` REQ-ID anchor; no `PIC-N` currently anchors the enforcement contract (PIC-8 owns only the restore-failure path), so the cross-link contract is unsatisfiable until the obligation is coined per GOV-22.

## Solution approach

Add a new `PIC` REQ-ID anchor at the active-set gating obligation on `tool-registration-lifetime.md` — the enforcement contract introduced by "Around each query … the runtime gates visibility via the active-set:" and its numbered steps 1–4 — naming the contract that confines the model's reachable callable set to the declared `tools:` allowlist, distinct from PIC-8's restore-failure path. Rewrite "whose enforcement is specified above" in `conversation-drive.md`'s `#no-extra-mediation` paragraph as a markdown link to that new `#pic-n` anchor.

## Solution constraints

- The new REQ-ID coinage MUST preserve the existing four-step active-set protocol content unchanged (GOV-8 pure rewording — add the dual-form anchor and bold marker, do not substantively reword the steps).
- Out of scope: PIC-8's restore-failure protocol content — the new REQ-ID names the enforcement contract, not the restore-failure path PIC-8 already owns.

## Relationships

- T11 "Type-compatibility rules cited by positional ordinal with no per-rule anchor" - same-cluster (separate GOV-9 / `#prefix-n` violation resolved by an analogous coin-then-link edit).
- T15 "`.pi/project-config.md` Spec-rules understates the GOV set and omits GOV-22" - must-follow (project-config currently omits GOV-22; a fixer reading only project-config might skip the coinage half of this fix and leave GOV-9 still unsatisfied).
- T34 "Typed-query forced-respond tool choice has no specified delivery channel" - same-cluster (sibling concern on the same conversation-drive surface; resolves independently).
# T13 - NFR aggregator section delivers one of the three bullets it announces

**Kind:** placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The `### Non-functional requirements` aggregator section (`id="non-functional-requirements"`) in `docs/spec/overview-and-orientation.md` announces three cross-cutting loom 1.0 NFR dispositions — the trust/security posture, the source-language-equivalence release goal, and the operator-facing observability contract — but contains only the **Trust boundary** bullet. The other two dispositions live as top-of-file bullets in `docs/spec/language-and-architecture.md`: **Source-language stability** (anchor `id="source-language-stability"`) and **Runtime observability**. The section's intro paragraph further claims the "two no-seam loom 1.0 dispositions recorded here — Trust boundary and Source-language stability — are also indexed under [Future Considerations — loom 1.0 non-goals]", yet Source-language stability is not recorded in the section at all. This is a GOV-12 aggregator-vs-source lock-step violation: the section asserts content it does not contain.

## Solution approach

Move the **Source-language stability** and **Runtime observability** bullets from the top of `docs/spec/language-and-architecture.md` into the `id="non-functional-requirements"` section of `docs/spec/overview-and-orientation.md`. Preserve the `id="source-language-stability"` anchor so the `*Recorded at:*` cross-link from `model-changes-and-non-goals.md` continues to resolve. Rewrite the section's intro paragraph so its enumerated count and its Future-Considerations indexing claim agree with the bullets the section now contains.

## Solution constraints

- None.

## Relationships

- T14 "Runtime observability NFR bullet placed outside the NFR aggregator" - co-resolve (same underlying placement defect; this edit fixes both — that finding moves the Runtime observability bullet from the same top-of-file region into the same target section).
# T14 - Runtime observability NFR bullet placed outside the NFR aggregator

**Kind:** placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `### Non-functional requirements` aggregator section (anchor `id="non-functional-requirements"` in `docs/spec/overview-and-orientation.md`) introduces three cross-cutting dispositions — the trust/security posture, the source-language-equivalence release goal, and the operator-facing observability contract — but its body carries only the **Trust boundary** bullet. The **Runtime observability** bullet instead sits at the top of `docs/spec/language-and-architecture.md`, above that page's `# Language and architecture` H1, as an orphan list item whose `loom-system-note`-channel content has no relationship to language-and-architecture material. A reader consulting the announced NFR section finds one of three promised bullets; a reader landing on `language-and-architecture.md` meets NFR orphans before any language content.

## Solution approach

Move the **Runtime observability** bullet out of the top-of-file region of `docs/spec/language-and-architecture.md` and into the `id="non-functional-requirements"` section of `docs/spec/overview-and-orientation.md`, aligning its position with the trust → source-language-stability → observability disposition order the section's intro paragraph announces. The bullet body is self-contained and carries no `<a id>`, so it relocates without rewording.

## Solution constraints

- None.

## Relationships

- T13 "NFR aggregator section delivers one of the three bullets it announces" - co-resolve (same NFR aggregator section under-delivers; that finding moves the Source-language stability bullet from the same top-of-file region into the same target section; one edit pass resolves both).
# T15 - `.pi/project-config.md` Spec-rules understates the active GOV set and omits GOV-22's coinage MUST

**Kind:** doc-alignment-broad
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`project-config.md`'s `## Spec rules` summarises REQ-IDs as "**REQ-IDs** (GOV-1 .. GOV-15)". The live GOV set on `docs/spec_topics/governance.md` and its sub-pages is GOV-1, GOV-3, GOV-5–GOV-9, GOV-12, GOV-14–GOV-24 (GOV-2/4/10/11/13 retired), so the cited range both understates the active surface and implies a contiguous block that no longer exists. The summary also omits GOV-22's same-commit coinage obligation: a fixer reading `project-config.md` as the REQ-ID entry point learns allocation rules for already-anchored obligations but is never told that adding — or strengthening the normative-modal content of — a defining obligation site without a co-located REQ-ID anchor obliges coining a `PREFIX-N` anchor in the same commit. That gap leaves GOV-9's `#prefix-n` cross-link contract unsatisfiable for the new site.

## Solution approach

Rewrite the REQ-IDs range citation in `## Spec rules` so it names the live GOV set without implying contiguity and defers to `governance.md` as the authoritative source rather than freezing the enumeration. Add a fixer-facing allocation rule covering the GOV-22 case — coining a `PREFIX-N` anchor at a freshly added or strengthened defining obligation site under the page's already-registered prefix — with a forward-link to `governance/req-id-prefix-table-active-b.md#gov-22`.

## Solution constraints

- The live-GOV enumeration is owned by `governance.md`; `project-config.md` MUST NOT present a frozen GOV list as authoritative — cite `governance.md` as the source (a "currently …" snapshot pointing back to it is acceptable).

## Relationships

- T11 "Type-compatibility rules cited by positional ordinal with no per-rule anchor" - must-precede (a fixer working only from project-config would not know GOV-22 obliges coinage; landing this fix first reduces the chance the TYPE-N coinage is skipped on subsequent passes).
- T12 "`tools:` allowlist enforcement cross-reference violates GOV-9 `#prefix-n` form" - must-precede (the PIC-N coinage half of that fix depends on a fixer knowing GOV-22's obligation).
- T07 "GOV-21 bundles five independently testable sub-clauses" - same-cluster (if GOV-21 splits into GOV-25..GOV-29, the "currently GOV-1..GOV-24" snapshot must be updated in the same edit; otherwise independent).
# T16 - `always-log set` definition is narrower than its actual membership

**Kind:** naming
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The glossary entry for *always-log set* (`docs/spec_topics/glossary.md`) and the "Runtime event channel" preamble in `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` both define the set as a subset of `QueryError` `kind` values. That framing contradicts the enumerated membership on the canonical page: group A includes binder failures, which are not `QueryError` variants (per `docs/spec_topics/binder/determinism-cancellation-failure.md`), and group B is `loom/runtime/*` panic codes, also not `QueryError.kind` values. The same narrow framing leaks into `docs/spec_topics/diagnostics/diagnostic-shape.md`'s system-note carrier paragraph. An implementer reading any of these surfaces in isolation would model the set as `QueryError.kind`-only and omit the binder-failure and panic emission obligations; the `RuntimeEvent.kind` field comment on the canonical page already states the correct three-arm union.

## Solution approach

Rewrite the `always-log set` opening clause in `glossary.md` so the definition names the three-arm union — `QueryError.kind` values, binder failure causes, and `loom/runtime/*` panic codes — matching the enumerated group-A/group-B membership. Apply the same broadening to the runtime-event-channel preamble's "subset of `QueryError` failures" framing. Rewrite `diagnostic-shape.md`'s system-note carrier sentence to key the carrier shape off group-A membership of the always-log set rather than off `QueryError` failure membership.

## Solution constraints

- Out of scope: renaming the *always-log set* token itself — only its definition changes; the token is consumed from other pages by name.
- Out of scope: the success-side null-policy paragraph in `runtime-event-channel.md`, which omits binder failures by construction and is correct as written.

## Relationships

- T05 "Host presuppositions lack version-bump-procedure re-audit hooks" - same-cluster (the `convertToLlm` half touches the same canonical page; independent defect on a different paragraph).
# T17 - `void` is admitted by the grammar but absent from the Type System enumeration and undefined outside return position

**Kind:** clarity, completeness
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 4
**Shape:** single
**State:** reduced

## Problem

The `PrimitiveType` production in `docs/spec_topics/grammar.md` admits `void` as a full member of `Type`, so it parses in every type-annotation position (`let x: void`, schema fields, `params:`, `array<void>`, `Result<void, E>`, `invoke<void>`, union arms). The Type System primitive enumeration in `docs/spec_topics/type-system.md` omits `void`, and the spec only ascribes meaning to `void` in return position. Non-return-position occurrences are undefined: there is no Schema Subset lowering for a `void`-typed value, the closed `⊑` compatibility list says nothing about `void`, and no diagnostic names the rejection path. Two implementers diverge — one rejects every non-return `void` with no code to cite, the other admits `let x: void` with undefined runtime semantics.

## Solution approach

Restrict `void` to return position and reject it in every other type-annotation position. In `grammar.md`, split the grammar so `void` is admitted only by the function-/loom-return-type position and the `Type` production that `let`, schema fields, `params:`, generic arguments, and union arms reference excludes it. In `type-system.md`, clarify alongside the Primitive types bullet that `void` is a return-only annotation rather than a value-bearing type, and add a note in the `#type-compatibility` section that `void` does not participate in `⊑`. Add a parse-error row to `docs/spec_topics/diagnostics/code-registry-parse.md` for `void` in a non-return type position.

## Solution constraints

- Out of scope: do not add `void` to the Type Subset enumeration or the Lowering Algorithm in `docs/spec_topics/schema-subset.md`.

## Relationships

- T11 "Type-compatibility rules cited by positional ordinal with no per-rule anchor" - same-cluster (both touch `type-system.md`; the per-row `TYPE-N` anchors are the natural place to anchor the new "`void` does not participate in `⊑`" note, but neither finding's fix depends on the other).
# T18 - Worked-example payload labelled "depth-6" actually counts as depth-7

**Kind:** consistency
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The normative worked example in `query-tool-loop.md` (anchor `worked-example-depth-6-forced-respond`) labels its forced-respond payload `{"deeply":{"nested":{"value":{"a":{"b":{"c":{}}}}}}}` as depth-6, but applying the counting algorithm in `schema-subset.md#depth-enforcement` (empty object = depth 1, non-empty object = 1 + max child depth) yields depth-7. The example is declared normative — the `RuntimeEvent`-shape conformance test and the typed-query test suite both cite it — so the literal payload disagrees with the algorithm it is meant to exemplify. An implementer trusting the "depth-6" label builds a fixture the depth-walk does not reject; one trusting the literal payload builds a depth-7 fixture. Two compliant implementations then diverge on whether the published vector triggers the documented `validation` error.

## Solution approach

Rewrite the payload in step 3 of the *Mock provider transcript* in `query-tool-loop.md` so it counts as genuinely depth-6 under `schema-subset.md#depth-enforcement` — terminate the deepest nesting in a scalar rather than an empty object (e.g. `{"deeply":{"nested":{"value":{"a":{"b":"x"}}}}}`). Leave the "depth-6" labels, the `worked-example-depth-6-forced-respond` anchor, the headings, and the `depth-6-co-fire` filename unchanged, since they become accurate once the payload is depth-6.

## Solution constraints

- Out of scope: the label-only citations of this example in `ceiling-invariants-and-audit.md` and `runtime-event-channel.md`; they require no edit once the payload counts as depth-6.
- Out of scope: the `depth-6-co-fire.loom` *Loom source* response schema; the depth-walk fires before AJV, so the replacement payload requires no schema edit.

## Relationships

None
# T19 - `%` operand-typing rule contradicts the `integer ⊑ number` widening pattern of `-`/`*`

**Kind:** clarity
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

In `docs/spec_topics/expressions.md` § *Other arithmetic*, the `-` and `*` operators pin explicit `integer ⊑ number` widening (both `integer` → `integer`; either `number` → `number`, citing type-compatibility rule 2), but the `%` operator instead says it "requires same-typed operands and, for a non-zero divisor, preserves the type." Read strictly, "same-typed operands" rejects `3 % 2.0`, contradicting the widening pattern of its sibling operators — yet the same sentence later asserts that `integer % 0` widens to `number` "the same `integer ⊑ number` widening," reusing the widening vocabulary for `%`. Two reasonable implementers diverge on whether `3 % 2.0` parses, and the strict reading has no registered diagnostic to name the rejection (`code-registry-parse.md` registers `loom/parse/mixed-plus-operands` and `loom/parse/non-orderable-operands` but no modulo equivalent).

## Solution approach

Rewrite the `%` clause in `docs/spec_topics/expressions.md` § *Other arithmetic* to follow the same `integer ⊑ number` widening rule already stated for `-`/`*`: `integer` operands produce `integer`, any `number` operand widens the result to `number`. Delete the "requires same-typed operands" and "preserves the type" phrasing that sources the contradiction, and keep the existing modulo-by-zero sentence so it reads as a special case of the general widening rather than an exception to a strict rule.

## Solution constraints

- Out of scope: the comparison-operator ordering sentence (owned by T20) and the rule-2 citation anchoring (owned by T11) — both share the `expressions.md` operator-rule block; edit only the `%` clause.
- Out of scope: `code-registry-parse.md` — the widening direction registers no new diagnostic.

## Relationships

- T11 "Type-compatibility rules cited by positional ordinal with no per-rule anchor" - same-cluster (the `%` clause's "(rule 2)" ordinal reference is one of the citations that finding tracks; the wording fix here is independent of how rule 2 is anchored).
- T20 "Numeric comparison rule says 'magnitude' where it means 'signed numeric value'" - same-cluster (both live in `expressions.md` and a single editing pass through the arithmetic + ordering paragraphs would naturally address them together, but they resolve independently).
