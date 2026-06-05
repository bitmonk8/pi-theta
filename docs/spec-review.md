# Triaged Spec Review - spec

_Generated: 2026-06-04T21:31:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T34) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 7 high, 7 medium retained; 12 low discarded; 10 low findings merged into 4 medium findings; 3 nit dropped; 0 false dropped._

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
