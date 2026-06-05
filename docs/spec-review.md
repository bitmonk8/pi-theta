# Triaged Spec Review - spec

_Generated: 2026-06-05T00:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T22) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blockers, 0 high, 1 medium retained, 3 medium parked; 10 low discarded; 5 low findings merged into 2 medium findings; 12 nit dropped; 0 false dropped._

---

# T01 - Pre-evaluation failure list — stale count-pointer and non-contiguous REQ-ID numbering

**Kind:** clarity, consistency, naming, traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The eight-item pre-evaluation failure list under **Terminal outcomes** in `error-model.md` carries two surface defects in the same paragraph block. First, the closing lock-step co-edit sentence names a backtick literal `the seven below` as the count phrase to keep in sync, but the actual count phrase in the preceding paragraph is "the eight below" — a stale self-reference left over from before `err-16` was added, so the closed-count invariant is no longer mechanically grep-verifiable by a future editor. Second, the list enumerates eight items but assigns non-contiguous anchors `err-1`–`err-7` then `err-16`; `err-8`–`err-15` are live elsewhere (on this page and in `queryerror-variants.md`), and neither the intro ("the eight below") nor the recap ("the eight list items above") explains the discontinuity, so an auditor reading `err-*` anchors as a contiguous range silently misidentifies the pre-evaluation set.

## Solution approach

Rewrite the lock-step co-edit sentence's backtick literal `the seven below` to `the eight below` so it names the count phrase that actually exists in the preceding paragraph. Clarify the intro sentence ("…is the eight below…") and the recap ("Each of the eight list items above…") so the non-contiguous anchor set — `err-1`–`err-7` plus `err-16`, with `err-8`–`err-15` allocated to sibling obligations elsewhere — is auditable from the prose alone.

## Solution constraints

- Do not renumber the existing `err-1`–`err-16` anchors to a contiguous range; they are cited from sibling pages and renumbering would break those cross-references.

## Relationships

- T14 "Un-anchored normative obligations across `cancellation.md`" - same-cluster (REQ-ID anchor coherence; resolves independently).
