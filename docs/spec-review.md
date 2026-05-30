# Triaged Spec Review - spec

_Generated: 2026-05-30T19:55:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - among retained findings the last is addressed first; the first (T14) is addressed last._

_Retained after manual filter: 3 high findings only (T14, T16, T18). All 17 medium findings dropped per request (none is an absolute prerequisite of a high finding)._

---

# T14 - `no-invocation-cap` MUST NOT is unobservable

**Kind:** testability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The `#no-invocation-cap` paragraph in `implementation-notes.md` states the runtime "MUST NOT introduce an admission cap, a priority queue, or any scheduler interposed between sibling invocations and the event loop." This is framed as an internal-architecture constraint, not an observable property: a conformant no-cap implementation and one that caps in-flight invocations at a generous finite ceiling produce indistinguishable behaviour for every test that stays under that ceiling. Because SM-7d in `spec.md` and `future-considerations.md` both forward-link this anchor as the single normative landing site for the no-cap commitment, the obligation is unfalsifiable — no conformance test can detect a violation.

## Solution approach

Rewrite the `#no-invocation-cap` MUST NOT clause as an observable conformance obligation anchored to the parallel-tool-call surface at [Tool Calls — Concurrency](./tool-calls.md#concurrency): require that, for a small fixed N (≥ 3) of subagent-mode `.loom` callables emitted as parallel tool calls in one assistant turn, the runtime initiate `createAgentSession` for all N before any of the N invocations returns. State the witness in terms of a fake `AgentSession` whose `sendUserMessage` blocks until released, so the conformance test asserts all N sessions have been created and entered `sendUserMessage` before any block is released.

## Solution constraints

- The rewritten rule MUST remain a normative MUST-level obligation; do not demote it to SHOULD or to informative guidance.
- Out of scope: the surrounding resource-ownership-boundary text (the host/OS/provider resource classes and the major-version widening/narrowing note) — do not edit it.

## Relationships

- T16 "SM-7b and SM-7d normative obligations live on an implementer-hints page" - must-follow (that finding may move the SM-7d-anchored rule to a new `session-model.md` topic page; if it lands first, this edit applies to the new home rather than to `implementation-notes.md`)

# T16 - SM-7b and SM-7d normative obligations live on an implementer-hints page

**Kind:** placement
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

SM-7b and SM-7d in spec.md's Session Model delegate their substantive normative content to `spec_topics/implementation-notes.md` — SM-7b's subagent-mode transcript / tool-table isolation rule lives in the `Per-invocation single-threaded execution` bullet, and SM-7d's no-cap / no-scheduler prohibition lives at the `#no-invocation-cap` anchor. That page self-describes as a home for parser / runtime hints and explicitly non-normative implementation choices, giving a reviewer or implementer no topical signal that it houses MUST / MUST NOT obligations of the same standing as the SM-N sequence. An implementer reading the page per its advertised purpose could treat the concurrency / isolation contract as guidance and introduce, for example, a soft admission cap or a per-extension scheduler.

## Solution approach

Move the SM-7b isolation rule and the SM-7d no-cap / no-scheduler rule out of `implementation-notes.md` into the normative topic page T15 establishes (co-resolving with T15, which proposes `spec_topics/session-model.md` as the same destination), retaining the `no-invocation-cap` anchor at the new location. Retarget the SM-7b and SM-7d forward-links in spec.md to the new page. Reduce the vacated `implementation-notes.md` content to a stub or delete it, leaving the page to host only its non-normative hints.

## Solution constraints

- Preserve the `no-invocation-cap` anchor name at its new location — spec.md (and any future page) cites it as a URL fragment.
- Per GOV-9, retarget every back-reference to the moved rules in the same commit, including prose that names `implementation-notes.md` or the `Per-invocation single-threaded execution` bullet title as the owner.

## Relationships

None

# T18 - Binder-envelope preservation MUSTs use placeholder REQ-ID labels

**Kind:** naming, testability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The three forward-compatibility preservation MUSTs under the binder-refinement-loop seam in `docs/spec_topics/binder.md` are tagged `**BNDR-<i>.**`, `**BNDR-<j>.**`, `**BNDR-<k>.**`. The angle-bracket suffixes are template-metavariable placeholders, not numeric tails, so the labels match neither GOV-3's REQ-ID grammar nor GOV-16's inline-label grammar (`BNDR` is a REQ-ID prefix, so the inline-label arm is unavailable). The three obligations therefore fall outside every governed cross-page-citable identifier class: the GOV-3 extractor skips them, `#bndr-<i>` cannot serve as a URL fragment because the angle brackets are reserved HTML, and the coverage matrix has no key to map them to leaves. A future commit that drops one of the three would not surface as a coverage-matrix regression.

## Solution approach

Rename the three placeholder labels in `docs/spec_topics/binder.md` to sequentially allocated numeric REQ-IDs `BNDR-1`, `BNDR-2`, `BNDR-3` under the already-registered `BNDR` prefix (these are next-available), each rendered in GOV-1 dual-form for body-paragraph context.

## Solution constraints

- None.

## Relationships

None
