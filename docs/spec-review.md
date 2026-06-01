# Triaged Spec Review - spec.md

_Generated: 2026-06-01T18:10:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T11) is addressed first; the first finding (T08) is addressed last._

_Triage tally: 1 high retained; 7 medium removed by request; 9 low discarded; 13 nit dropped; 0 false dropped._

---

# T09 - Forward-compatibility seams sub-bucket predicate fails for the Pi-owned-subagents blockquote, breaking the 13-seam count

**Kind:** cross-spec-consistency-broad
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The *Surface extensions without a dedicated topic-page seam* sub-bucket on `future-considerations.md` (`#surface-extensions-no-dedicated-seam`) defines its membership by stating its items carry no `> **loom 1.0 seam — <name>.**` blockquote on any topic page. One member — the Pi-owned subagents item — contradicts that predicate: its *Carrier* line cites the `#v1-seam-pi-owned-subagents-collision-source-set` blockquote on `pi-integration-contract.md`. The *Forward-compatibility seams* Scope bullet on `spec.md` (`#scope`) and GOV-12 on `governance.md` (`#gov-12`) both define the source set of the "13 typed/structural seams" as the inventory of these blockquotes, so the blockquote-keyed count and the membership rule that excludes this sub-bucket from the 13 disagree about whether the subagents blockquote belongs to the tally.

## Solution approach

Rewrite the membership predicate of the no-dedicated-seam sub-bucket (`#surface-extensions-no-dedicated-seam`) so it keys on exclusion from the 13-seam tally rather than on the absence of a `> **loom 1.0 seam — <name>.**` blockquote, retaining the `#v1-seam-pi-owned-subagents-collision-source-set` blockquote as a defensive invariant pin. Apply the same predicate rewrite to the mirroring clause in the *Forward-compatibility seams* Scope bullet on `spec.md` (`#scope`). Narrow GOV-12's *13 typed/structural seams* source-set definition (`#gov-12`) so it counts blockquotes pinning items inventoried under *Surface extensions (loom 1.0 leaves a seam)*, excluding blockquotes pinning items in the no-dedicated-seam sub-bucket.

## Solution constraints

- The GOV-12 integer-count invariant binds: the 13-seam aggregator MUST retain a parseable integer literal whose value equals its newly-defined source-set count.

## Relationships

None
