# Triaged Spec Review - spec

_Generated: 2026-06-01T20:15:30Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T22) is addressed first; the first finding (T16) is addressed last._

_Triage tally: 4 high retained; 16 medium removed by request; 10 low discarded; 2 low merged into 1 (removed); 9 nit dropped; 0 false dropped._

---

---

# T16 - `loom/load/unreadable-source` registry row carries two message formats but only one is in the Message column

**Kind:** testability
**Importance:** high
**Score:** 100
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

The `loom/load/unreadable-source` row in diagnostics.md's [Code registry](#code-registry) carries a single Message template, but its Trigger admits a second, structurally-distinct rendered form for the package-read-timeout sub-trigger (`package '<name>' package.json read exceeded <deadline>ms during package discovery`). That second template is not present in the Message column and is not derivable from the first by interpolation of `<descriptor>`. Code registry rule 4 pins the Message column as the byte-exact source of truth for conformance tests, so a test against the package-read-timeout sub-trigger cannot both comply with rule 4 and assert the correct rendered string — the two obligations are mutually unsatisfiable for that sub-trigger. The placeholder-rendering Closure clause compounds the gap: `<name>` and `<deadline>` appear only in Trigger prose, so they are not audited under rendering categories 1–8.

## Solution approach

Give the package-read-timeout sub-trigger its own row in diagnostics.md's [Code registry](#code-registry) with a normative Message column carrying its rendered template `package '<name>' package.json read exceeded <deadline>ms during package discovery`, and remove that sub-trigger — including its `details.kind = "package-read-timeout"` — from the `loom/load/unreadable-source` row's Trigger. Update discovery.md's package-discovery prose and Failure-modes table to cite the new code. Confirm §7 placeholder rendering already covers `<name>` and `<deadline>`.

## Solution constraints

- None.

## Relationships

- T20 "`Diagnostic.details` field unspecified despite per-row uses" — same-cluster (same row origin; the split obviates `details.kind` for this code, but the broad `Diagnostic.details` gap persists for the other rows; resolves independently).

---

# T18 - Orientation aggregator under-states what verifies SDK capability 5 (cancellation propagation)

**Kind:** consistency
**Importance:** high
**Score:** 100
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

`spec.md`'s **Host runtime** precondition 3 orientation paragraph states that item 5 (cancellation propagation) "is covered by precondition 2 above" — the `AbortSignal` / `AbortController` shape probe alone. The canonical owner, Pi Integration Contract (Step 0 (c) and the SDK capability inventory), states item 5 is covered **jointly** by the precondition-2 shape probe (the two Pi-side entry-point signals) and the `AgentSession.prototype.abort` member check (the subagent-mode primitive). The orientation clause omits the subagent-mode half, so a reader of `spec.md` alone concludes no separate probe is required for the subagent cancellation primitive and that `AgentSession.prototype.abort` is unenumerated factory-probable surface.

## Solution approach

Rewrite the item-5 clause in `spec.md`'s **Host runtime** precondition 3 to mirror PIC's joint-coverage framing, naming both precondition 2's `AbortSignal` / `AbortController` shape probe and the factory probe's `AgentSession.prototype.abort` member check, and forward-linking to PIC [SDK capability inventory](./spec_topics/pi-integration-contract.md#sdk-capability-inventory) / [Step 0 (c)](./spec_topics/pi-integration-contract.md#entry-capability-probe).

## Solution constraints

- Keep the clause orientation-only (informative, forward-linking to PIC); do not author a normative restatement of item-5 coverage — PIC remains the canonical owner per GOV-12.
- Out of scope: PIC's Step 0 (c) and SDK capability inventory paragraphs — they are the canonical source this finding realigns `spec.md` to, not edited here (PIC count corrections are owned by T19).

## Relationships

- T19 "Step 0 (c) — capability/function-member count and breakdown disagree with the enumerated list" — same-cluster (touches the same PIC Step 0 (c) paragraph; that finding fixes PIC's internal count miscount, orthogonal to which step verifies item 5).
