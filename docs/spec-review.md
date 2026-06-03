# Triaged Spec Review - spec

_Generated: 2026-06-03T08:30:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T11) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 3 high retained; 8 low discarded; 9 low findings merged into 2 medium findings; 3 nit dropped; 0 false dropped._

---

# T01 - Spec-corpus editorial and governance meta-commentary misplaced in implementer-facing orientation

**Kind:** cruft
**Importance:** high
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

- T07 "Trust-boundary Scope bullet carries the denial-surface rule normatively" - same-cluster (clarifying the Scope "informative orientation" framing strengthens the basis for T07's pointer-only rewrite; land in the same pass).
- T06 "Runtime observability bullet restates normative emission rules inside an informative section" - same-cluster (Scope-section hygiene; land in the same pass).
