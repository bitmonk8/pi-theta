# pi-loom — Consolidated Spec Review (Parked)

_Parked findings: 4._

---

## T22 - invocation.md carries no INV-N REQ-IDs

> **PARKED** — 2026-06-03
> **Reason:** Category 2 (fixer too-hard — fast-loop capability gap; the fast single-finding fixer partially resolved the finding but could not complete all inbound-link repointings). The fast `/fix-spec-shape-single-findings` loop returned FindingResolved=partial — INV-1..INV-11 anchors were coined and most inbound links repointed, but the errors-and-results.md ("Invocation — Failures", "Invocation depth bound") and hard-ceilings.md ("Invocation — Failures") inbound links named in the finding were left without `#inv-9` / `#inv-11` fragments. Loop notes: finding not resolved by fast fix — B3 returned FindingResolved=partial; INV-1..INV-11 anchors coined and most inbound links repointed, but the errors-and-results.md ("Invocation — Failures", "Invocation depth bound") and hard-ceilings.md ("Invocation — Failures") inbound links named in the finding were left without #inv-9/#inv-11 fragments. A human (or a re-run once the INV-9 / INV-11 anchors are confirmed on invocation.md) must complete the remaining inbound-link repointings before this finding can be marked resolved.
> **Forensic report:** none (fast loop — no forensic report)

# T22 - invocation.md carries no INV-N REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`invocation.md` is registered with REQ-ID prefix `INV` in the governance.md REQ-ID prefix table, but the page carries zero `INV-N` anchor sites despite being normatively dense — the symlink-resolution hardening seam, the named-argument-invocation `style` discriminator, the per-call-timeout open-struct seam, the invoke-chain depth cap, the cross-mode snapshot/restore protocol, static resolution, typed return, argument arity, cycle detection, and the invoke-cause `QueryError` partition, among others. Because no `INV-N` anchors exist, GOV-9's `#prefix-n` cross-link contract is unsatisfiable for every inbound dependency: spec.md's Session Model aggregator plus cancellation.md, diagnostics.md, errors-and-results.md, frontmatter.md, functions.md, future-considerations.md, hard-ceilings.md, implementation-notes.md, pi-integration-contract.md, and tool-calls.md currently link only to section-heading slugs or bespoke `#static-resolution` / `#typed-return` / `#argument-binding` / `#final-value-propagation` / `#cycle-detection` anchors that are not REQ-ID anchors under GOV-1. This is the residue GOV-22 was written to close.

## Solution approach

Add `INV-N` dual-form anchors to `invocation.md` per GOV-1 and GOV-22, one per independently-violable normative obligation on the page, and repoint each inbound consumer's cross-references to the new `#inv-n` fragments in the same commit. Keep the bespoke `#static-resolution`, `#typed-return`, `#argument-binding`, `#final-value-propagation`, and `#cycle-detection` anchors as co-located aliases. Repoint future-considerations.md's symlink-hardening *Anchored at:* link to the `INV-N` anchor owning the single-named-function MUST.

## Solution constraints

- Out of scope: the `calling loom` → `invoke parent` per-boundary-table naming on hard-ceilings.md and tool-calls.md, owned by T07 — repoint only the cross-link targets in those rows, do not edit the surrounding cell wording.

## Relationships

- T13 "discovery.md carries zero DISC-N REQ-IDs" — same-cluster (same GOV-22 pattern, different page).
- T14 "frontmatter.md carries no FRNT-N REQ-IDs" — same-cluster (`frontmatter.md` has multiple inbound-to-invocation cross-links; repointings are concurrent but the fixes are independent).
- T07 "Per-boundary tables use undefined `calling loom` instead of glossary `invoke parent`" — decision-overlap (the new INV-7 anchor on typed return is the natural cross-link target for those tables once the naming finding lands).

---

## T21 - cancellation.md carries no CNCL-N REQ-IDs

> **PARKED** — 2026-06-03
> **Reason:** Category 2 (fixer too-hard — fast-loop capability gap; the fast single-finding fixer partially resolved the finding but could not complete all inbound-link repointings). The fast `/spec-fix-findings-loop` fast loop returned FindingResolved=partial — CNCL-1..16 anchors were coined and the spec.md SM-7a / SM-7e aggregator cross-links repointed, but the finding's "repoint every inbound cross-reference from depending pages" obligation was left unmet for binder.md, errors-and-results.md, pi-integration-contract.md, slash-invocation.md, hard-ceilings.md, and diagnostics.md. Loop notes: finding not resolved by fast fix — B3 returned FindingResolved=partial; CNCL-1..16 anchors coined and spec.md SM-7a/SM-7e repointed, but the finding's "repoint every inbound cross-reference from depending pages" (binder.md, errors-and-results.md, pi-integration-contract.md, slash-invocation.md, hard-ceilings.md, diagnostics.md) was unmet. A human (or a re-run once the CNCL-N anchors are confirmed on cancellation.md) must complete the remaining inbound-link repointings before this finding can be marked resolved.
> **Forensic report:** none (fast loop — no forensic report)

# T21 - cancellation.md carries no CNCL-N REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`cancellation.md` is registered in the per-page REQ-ID prefix table on `governance.md` with prefix `CNCL`, but the page carries zero `CNCL-N` anchor sites despite being dense with independently-violable normative obligations (signal source-of-truth, the per-mode forwarding paths, abort-reason propagation, the late-settlement discard sub-obligations, the swallowing-handler attachment rule, and the cancellation race rules). Because no obligation is coined, every inbound GOV-9 cross-link from depending pages (`binder.md`, `errors-and-results.md`, `pi-integration-contract.md`, `slash-invocation.md`, `hard-ceilings.md`, `diagnostics.md`, and the `spec.md` SM-7a / SM-7e aggregators) resolves only to a section-heading slug. This is exactly the permanently-unsatisfiable state GOV-22 was written to close.

## Solution approach

Coin `CNCL-N` dual-form anchors per GOV-1 / GOV-22 on `cancellation.md`, one per independently-violable normative obligation. Repoint every inbound cross-reference from the depending pages above from its `#section-slug` target to the new `#cncl-n` fragment.

## Solution constraints

- The `spec.md` SM-7a / SM-7e aggregator paragraphs are informative under GOV-12: repoint their cross-links only, coin no new REQ-IDs there.

## Relationships

- T20 "Tool-call late-settlement discard paragraph needs three CNCL-N sub-anchors" — must-precede (the three sub-anchors land inside this fix as `CNCL-15a` / `CNCL-15b` / `CNCL-15c`; resolve this page-wide coinage first so the sub-obligation finding lands on its baseline).
- T12 "binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs" — same-cluster (identical traceability gap on `binder.md`; inbound links from `cancellation.md` to `binder.md`'s cancelled-binder failure-mode benefit from being repointed in lock-step).
- T31 "Per-cause caller surfaces table — Cancellation row contradicts cancellation.md surfacing" — decision-overlap (that finding's recommended pointer should target a CNCL-N anchor once these exist; today it targets the section heading).

---

## T16 - query.md missing QRY-N REQ-IDs

> **PARKED** — 2026-06-04
> **Reason:** Category 2 (fixer too-hard — fast-loop capability gap; the fast single-finding fixer partially resolved the finding but could not complete all inbound-link repointings named in the Solution approach). The fast `/spec-fix-findings-loop` fast loop returned FindingResolved=partial — 15 QRY-N anchors were coined and 41 inbound links across 11 pages repointed, but the glossary.md (3 links) and spec.md SM-8 aggregator (1 link) inbound links named in the Solution approach were left at section-heading granularity. Loop notes: finding not resolved by fast fix — B3 returned FindingResolved=partial; 15 QRY-N anchors coined and 41 inbound links across 11 pages repointed, but glossary.md (3 links) and spec.md SM-8 aggregator (1 link) named in the Solution approach were left at section-heading granularity. A human (or a re-run once the QRY-N anchors are confirmed on query.md) must complete the remaining glossary.md and spec.md SM-8 inbound-link repointings before this finding can be marked resolved.
> **Forensic report:** none (fast loop — no forensic report)

# T16 - query.md missing QRY-N REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`governance.md`'s REQ-ID prefix table registers the `QRY` prefix to `query.md`, but the page carries zero `QRY-N` anchors — neither the GOV-1 *Canonical form* inline `**QRY-N.**` marker nor the *Dual-form layout* `<a id="qry-n">` token — despite hosting many independently verifiable normative obligations. Because no `#qry-n` fragments exist, every inbound cross-link from sibling pages resolves only at section-heading granularity, violating the GOV-9 cross-link contract that requires a `#prefix-n` fragment when the depended-upon page is non-narrative. The GOV-15 "release blocked on uncoined obligations on a registered prefix" condition is currently tripped, and individual obligations cannot be cited by stable id.

## Solution approach

Add `QRY-N` REQ-ID anchors at each independently verifiable normative obligation on `query.md`, following GOV-1 *Canonical form* and *Dual-form layout* and GOV-22's progressive-coinage procedure, with numeric tails allocated per GOV-3. Add forward-links from the inbound cross-references on the sibling pages that cite `query.md` rules (`errors-and-results.md`, `hard-ceilings.md`, `pi-integration-contract.md`, `frontmatter.md`, `glossary.md`, `tool-calls.md`, `schema-subset.md`, and `spec.md`'s SM-8 aggregator) so each repoints to the specific `#qry-n` fragment it depends on.

## Solution constraints

- Preserve the existing bespoke HTML section anchors on `query.md` (`#tool-call-loop-bound`, `#worked-example-depth-6-forced-respond`, `#typed-queries-are-tool-loop-shaped`, `#forced-respond-turn-non-compliance`, and the pre-flight-token-nullability anchors); add the new dual-form `QRY-N` pairs alongside them, not in place of them, so existing inbound links keep resolving.

## Relationships

- T12 "binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs" — same-cluster (parallel un-coined-prefix gap; resolve independently per page).
- T17 "slash-invocation.md carries no SLSH-N REQ-ID anchors" — same-cluster (parallel gap).
- T18 "`validation-issue-ordering` paragraph carries no ERR-N REQ-ID" — decision-overlap (QRY-21's `<ajv-summary>` placeholder links to `errors-and-results.md#validation-issue-ordering`; once that paragraph gains an `ERR-N`, the QRY-21 cross-link should be updated in the same edit).
- T32 "Top-level `Err` per-`kind` table — `validation` row collapses the two causes" — decision-overlap (the resolution of that finding will likely cite the new QRY-5 *empty-template short-circuit* anchor; co-ordinate the inbound-link update).

---

## T14 - frontmatter.md carries no FRNT-N REQ-IDs

> **PARKED** — 2026-06-04
> **Reason:** Category 2 (fixer too-hard — fast-loop capability gap; the fast single-finding fixer partially resolved the finding but could not complete the same-commit inbound cross-reference repointing on sibling pages). The fast `/spec-fix-findings-loop` fast loop returned FindingResolved=partial — 12 FRNT-N anchors were coined (GOV-22 half resolved) but the Solution approach's same-commit inbound cross-reference repointing on sibling pages (GOV-9 half) was deferred. Loop notes: finding not resolved by fast fix — B3 returned FindingResolved=partial; 12 FRNT-N anchors coined (GOV-22 half resolved) but the Solution approach's same-commit inbound cross-reference repointing on sibling pages (GOV-9 half) was deferred. A human (or a re-run once the FRNT-N anchors are confirmed on frontmatter.md) must complete the remaining inbound-link repointings before this finding can be marked resolved.
> **Forensic report:** none (fast loop — no forensic report)

# T14 - frontmatter.md carries no FRNT-N REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`governance.md`'s REQ-ID prefix table allocates the `FRNT` prefix to `frontmatter.md`, but the page carries zero `**FRNT-N.**` anchors — a corpus-wide grep for `FRNT-[0-9]+` returns no matches. The page nonetheless states a substantial body of independently-violable normative obligations (the Unknown-key policy, each *Field contract* table row, the *Naming convention* rules including the "**No `name` field**" prohibition, the `params`/`tools`/`system:` rules, the *Resolution snapshot* bullets, the `loom/parse/system-interp-*` diagnostics, and the `respond_repair`/`tool_loop` semantics), none of which carries a co-located REQ-ID anchor. As a result GOV-22 fires a fresh violation on every substantive edit to the page, and GOV-9's `#prefix-n` cross-link contract is permanently unsatisfiable for the dozen-plus inbound references from sibling pages that name a specific frontmatter obligation.

## Solution approach

Add dual-form `FRNT-N` anchors at each independently-violable defining obligation site on `frontmatter.md` — one anchor per obligation, not one per paragraph — allocated per GOV-3 and laid out per GOV-1 *Dual-form layout*. In the same commit, rewrite inbound cross-references on the sibling pages that name a specific frontmatter obligation (rather than the whole page) to `#frnt-n` targets per GOV-9.

## Solution constraints

- When adding a co-located `FRNT-N` anchor at a site that already carries a bespoke HTML `id="..."` slug (e.g. `binder-model-root-word-convention`, `loom-1-0-seam-system-expression-sublanguage`, the inline `id="tools"`), preserve the existing slug.
- Repointing inbound cross-references edits only the link targets on sibling pages; coining those pages' own REQ-ID anchors is out of scope (T12, T13, T15, T16, T22 own their respective pages' coinage).

## Relationships

- T12 "binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs" — same-cluster (parallel GOV-22 gap).
- T13 "discovery.md carries zero DISC-N REQ-IDs" — same-cluster (parallel GOV-22 gap).
- T22 "invocation.md carries no INV-N REQ-IDs" — same-cluster (`frontmatter.md` has multiple inbound-to-invocation cross-links; repointings are concurrent but the fixes are independent).

---

## T12 - binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs

> **PARKED** — 2026-06-03
> **Reason:** Category 2 (fixer too-hard — fast-loop capability gap; the `/spec-fix-findings-loop` fast loop is single-shot and could not deliver the Solution approach's per-independently-testable-obligation granularity). The fast fix returned FindingResolved=partial: block-level `BNDR-N` anchors were coined cleanly, but the per-obligation granularity and the reference-rendering byte-pinning / per-invocation-retry-budget `BNDR-N` pair were deferred. Loop notes: finding not resolved by fast fix — B3 returned FindingResolved=partial; BNDR-4..7 block-level anchors coined cleanly, but the Solution approach's per-independently-testable-obligation granularity was narrowed to one block-level ID per section, and the reference-rendering byte-pinning lead-ins / per-invocation-retry-budget BNDR-N pair were deferred.
> **Forensic report:** none (fast loop — no forensic report)

# T12 - binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `BNDR` prefix is registered in `governance.md`, but only `BNDR-1 … BNDR-3` are coined on `binder.md`, all three on the *Binder envelope* sub-section. The page's other dense normative-MUST surfaces — *Compact-transcript format (normative)*, *Session-context truncation (`bind_context: session`)*, *System-prompt structure (normative)*, and *Failure-mode templates (normative)* — carry no `BNDR-N` anchors, even though each rule is independently violable and independently testable. Per `GOV-22`, until these obligations are coined, `GOV-9`'s `#prefix-n` cross-link contract is unsatisfiable for them: inbound references from `spec.md`, `slash-invocation.md`, `frontmatter.md`, and `pi-integration-contract.md` resolve only to section-heading anchors or bespoke per-paragraph anchors, never to a per-obligation stable ID.

## Solution approach

Add dual-form `BNDR-N` anchors at the un-anchored normative obligation sites on `binder.md` — *Session-context truncation*, the *Compact-transcript format* MUST rules, the *System-prompt structure* items, the reference-rendering byte-pinning lead-ins, and the *Failure-mode templates* obligations — allocating numeric tails per `GOV-3` (next free integer starting at `BNDR-4`, no hole-filling) in the `GOV-1` *Dual-form layout*. Coin one ID per independently-testable obligation so each citable MUST resolves to its own `#bndr-n`, rather than a single block-level ID per section. Where a bespoke anchor already exists (e.g. `#per-invocation-retry-budget`), keep it in place and add the `BNDR-N` dual-form pair alongside.

## Solution constraints

- Out of scope: defining the `<provider>` placeholder (owned by T02) and repointing the `<ajv-summary>` cross-link to `#err-n` (owned by T18).

## Relationships

- T13 "cancellation.md carries no CNCL-N REQ-IDs" — same-cluster (same systemic GOV-22 gap on a different topic page; resolved independently).
- T16 "query.md missing QRY-N REQ-IDs" — same-cluster (parallel GOV-22 gap; independent prefix).
- T17 "slash-invocation.md carries no SLSH-N REQ-ID anchors" — same-cluster (parallel GOV-22 gap; independent prefix).
- T18 "`validation-issue-ordering` paragraph carries no ERR-N REQ-ID" — decision-overlap (the `<ajv-summary>` clause on `binder.md` cites the `validation-issue-ordering` paragraph by parent-section anchor; once that paragraph gets its `ERR-N`, the `binder.md` `<ajv-summary>` text should be repointed to `#err-n`).
- T02 "Failure-mode templates use an undefined `<provider>` placeholder" — decision-overlap (the `<provider>` definition will sit under whichever BNDR-N anchor this coinage assigns to the placeholder paragraph).
