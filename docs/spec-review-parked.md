# pi-loom — Consolidated Spec Review (Parked)

_Parked findings: 1._

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
