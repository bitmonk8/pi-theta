# Triaged Spec Review - spec

_Generated: 2026-06-01T20:15:30Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T22) is addressed first; the first finding (T16) is addressed last._

_Triage tally: 5 high retained; 16 medium removed by request; 10 low discarded; 2 low merged into 1 (removed); 9 nit dropped; 0 false dropped._

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

---

# T19 - Step 0 (c) — capability/function-member count and breakdown disagree with the enumerated list

**Kind:** consistency
**Importance:** high
**Score:** 100
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

The Step 0 (c) probe intro (anchor `entry-capability-probe`) in `pi-integration-contract.md` claims it checks "eight named function members" of the factory-probable subset and parenthesises "capabilities 3, 4, and 6 each contribute two function members." Both figures disagree with the enumerated bullet list immediately below, which is the source of truth the probe iterates over: it lists ten function members across five capabilities — capability 1 contributes one, capabilities 2, 3, and 6 each contribute two, and capability 4 contributes three. The same wrong count and distribution propagate to the SDK capability inventory section (anchor `sdk-capability-inventory`) and the *Target surface categories* paragraph (anchor `audit-target-surface-categories`), where "eight function members" / "five capabilities, eight function members" recur, so the error is not localised and a build-time count-equality assertion written against either side would silently contradict the other.

## Solution approach

Rewrite the Step 0 (c) intro at anchor `entry-capability-probe` so the headline count reads ten and the per-capability breakdown states capability 1 contributes one, capabilities 2, 3, and 6 each contribute two, and capability 4 contributes three — matching the enumerated bullet list. In lock-step, correct every downstream "eight function members" / "five capabilities, eight function members" restatement at anchors `sdk-capability-inventory` and `audit-target-surface-categories` to the ten-member count and the same distribution.

## Solution constraints

- MUST NOT remove or merge any of the ten enumerated function-member bullets to make "eight" true — each is independently probed at factory time and is load-bearing for the `loom/load/host-incompatible` refusal contract.

## Relationships

- T18 "Orientation aggregator under-states what verifies SDK capability 5 (cancellation propagation)" — same-cluster (also concerns the Step 0 (c) probe's capability attribution; that finding fixes item-5 attribution in `spec.md`, this one fixes the count/breakdown inside PIC).

---

# T20 - `Diagnostic.details` field unspecified despite per-row uses

**Kind:** testability
**Importance:** high
**Score:** 100
**Must-fix:** true
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The internal `Diagnostic` shape in `diagnostics.md` (the typed block before the `session-shutdown-details-conventions` paragraph) declares `severity`, `code`, `file`, `range`, `message`, `hint?`, `related?`, and `masked?` — it has no `details` field. Yet many code-registry rows write `details.{...}` as part of their normative wire contract (`loom/load/unreadable-source`'s `details.kind`, `loom/load/host-incompatible`'s `details: { kind, observed, required }`, the session-shutdown rows' `details.event.{...}`, `details.observed`, `details.failure`, and `details.step`/`.call`/`.error`). Because neither the shape block nor the `session-shutdown-details-conventions` paragraph declares a Diagnostic-level `details` field or disambiguates it from the outer `CustomMessage.details` (closed to `{ diagnostics: Diagnostic[] }`), two implementers can place a payload such as `details.kind` either on the Diagnostic object inside `diagnostics[i]` or hoist it onto the outer `CustomMessage.details`. A rule-4-compliant test asserting on a row's payload cannot determine which object to inspect.

## Solution approach

Add an optional `details?` field to the `Diagnostic` shape block in `diagnostics.md`, typed openly so each row's Trigger prose pins the actual per-row shape. Clarify that the per-row `details.{...}` shape is normatively pinned by each row's Trigger prose and that the `session-shutdown-details-conventions` paragraph governs only the session_shutdown event-payload subset. Clarify that all row-documented `details.{...}` payloads live on the `Diagnostic` object (inside `CustomMessage.details.diagnostics[i].details`), not on the outer `CustomMessage.details`, which stays closed to `{ diagnostics: Diagnostic[] }` plus the existing runtime-event-channel carve-out.

## Solution constraints

- Out of scope: code-registry row Trigger prose, including the `loom/load/unreadable-source` two-format split owned by T16 — this finding edits only the Diagnostic shape block and the `details`-conventions prose.
- Do not assign a DIAG-N REQ-ID to the shape block; that allocation is owned by T17.

## Relationships

- T16 "`loom/load/unreadable-source` registry row carries two message formats but only one is in the Message column" — same-cluster (same row origin; that finding's split obviates `details.kind` for the one row, but this broad `Diagnostic.details` gap persists for the other rows; neither blocks the other).

