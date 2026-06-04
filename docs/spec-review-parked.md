# pi-loom — Consolidated Spec Review (Parked)

_Parked findings: 2._

---

## T14 - Transport-class binder retry: no inter-attempt timing contract

> **PARKED** — 2026-06-04
> **Reason:** Category 1 (malformed finding — Solution Space binding surface; the ### Recommendation cannot be collapsed to a single mechanically-selectable option). The `/spec-fix-findings-loop` fast loop could not resolve this Shape: multiple finding: the recommendation defers the Option A vs Option B choice to an unperformed audit of `@earendil-works/pi-ai` transport backoff and is gated on the T22 must-follow dependency, so no single option can be selected mechanically. The spec-review-recommendation-applier returned requires-human; the finding cannot be collapsed to Shape: single. Loop notes: Shape: multiple; recommendation defers the A-vs-B choice to an unperformed audit of @earendil-works/pi-ai transport backoff and is gated on the T22 must-follow dependency, so no single option can be selected mechanically. Recommendation-applier returned requires-human; cannot collapse to Shape: single. A human must reshape this finding — perform the pi-ai backoff audit and select the surviving option (A or B), OR resolve the T22 entry-point finding first and re-introduce this finding once its must-follow prerequisite lands — before re-introducing it.
> **Forensic report:** none (fast loop — no forensic report)

# T14 - Transport-class binder retry: no inter-attempt timing contract

**Original heading:** Failure-class taxonomy / per-invocation retry budget — transport retry has no backoff contract
**Original section:** docs/spec_topics/binder.md
**Kind:** error-model
**Importance:** high
**Score:** 100
**Must-fix:** false

## Finding

The binder failure-class taxonomy (`Failure-class taxonomy (normative)`) and the per-invocation retry budget below it grant the transport class "exactly one retry" and route HTTP 429 / rate-limit, all 5xx, network/TCP/TLS failures, provider-SDK timeouts, and `ContextOverflowError` (treated as transport for retry purposes) through that single retry slot. Neither paragraph says anything about the timing of that retry: whether the runtime re-issues the binder call immediately, applies a fixed delay, applies exponential backoff, or honours a `Retry-After` header.

For 429 specifically the omission is observable. An immediate re-issue is the canonical retry-without-backoff anti-pattern — it consumes the budget on a request the provider has explicitly told the client to defer, so the retry deterministically fails for any 429 whose rate-limit window is longer than the binder's own latency, and the loom surfaces "argument binder unavailable" on a failure the spec implies is recoverable. Two reasonable implementers (one tight-loop, one with backoff) will produce different observable behaviour against the same rate-limited provider, and conformance tests cannot pin the retry interval.

The companion `TransportError` envelope in `errors-and-results.md` carries no `retry_after` field and the runtime does not expose backoff knobs in frontmatter, so the contract has to be stated normatively somewhere or explicitly delegated to a layer that already owns it.

## Spec Documents

- `docs/spec_topics/binder.md` — Failure-class taxonomy (normative) / per-invocation retry budget paragraph (edited)
- `docs/spec_topics/pi-integration-contract.md` — Provider error mapping (option-dependent — receives the delegation clause under Option A; edited under Option B if a runtime delay is pinned)
- `docs/spec_topics/errors-and-results.md` — `TransportError` envelope (read-only — checked for an existing `retry_after`-style field; none exists)
- `docs/spec_topics/query.md` — typed/untyped query transport-failure handling (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan has no authored leaves yet; `plan_topics/` contains only template/conventions/coverage-matrix scaffolding.)

## Consequence

**Severity:** correctness

Two conforming implementations will differ observably on rate-limited 429 paths: a tight-loop retry consumes the transport budget on the first wire round-trip and surfaces "argument binder unavailable," while a backoff-aware retry recovers. A binder pointed at a provider with strict per-second 429 caps becomes effectively non-retrying under the tight-loop reading despite the spec advertising one transport retry. Conformance tests cannot assert the wire-timing observable.

## Solution Space

**Shape:** multiple
**State:** shaped

### Option A — Delegate transport backoff to pi-ai

**Approach.** Add one sentence to the *Transport-class* bullet (or to the per-invocation retry budget paragraph) stating that the binder issues the retry immediately and that inter-attempt timing — including any `Retry-After` honouring, exponential backoff, jitter, or rate-limit-window awareness — is owned by `@earendil-works/pi-ai`. The loom-side retry budget counts *attempts after pi-ai's own delay completes*. If pi-ai itself returns after exhausting its internal retry, that single returned result consumes the binder's transport budget.

**Spec edits.** Single clause in `binder.md` under *Failure-class taxonomy → Transport-class* (or in the per-invocation budget paragraph immediately below). Cross-reference `pi-integration-contract.md`'s [Provider error mapping](./spec_topics/pi-integration-contract/provider-error-mapping.md#provider-error-mapping) as the layer that owns the timing contract.

**Pros.** Smallest spec surface. Consistent with the existing pattern of delegating provider-specific behaviour (overflow detection, seed-field mapping, named-tool forcing) to pi-ai. No new loom-side knob.

**Cons.** Correctness depends on a behaviour pi-ai is not contractually pinned to provide. If pi-ai retries internally with backoff, the binder's "exactly one retry" budget effectively means "one pi-ai-internal retry chain after the first failure surface."

**Risks.** Requires confirming the actual pi-ai behaviour (whether it backs off, whether it honours `Retry-After`) and citing the pi-ai version in the same edit, adding the timing-contract assumption to the bump-procedure re-validation list (the Provider error mapping paragraph is already "version-coupled to `@earendil-works/pi-ai`").

### Option B — Pin a defined runtime delay

**Approach.** State that the runtime waits a defined interval before re-issuing the binder call: either a fixed value (e.g. 500 ms via the injected `Clock` seam) for all transport-class failures, or a class-split policy (429-with-`Retry-After` → sleep capped at N seconds; all other transport failures → immediate). The wait is interruptible by `loomAbort.signal` per the existing abort-during-retry rule.

**Spec edits.** New short paragraph in `binder.md` after the per-invocation budget paragraph, naming the `Clock` seam (already defined in `pi-integration-contract.md`) so the delay is FakeClock-testable. If the policy reads `Retry-After`, add a field to `TransportError` in `errors-and-results.md` so the value is observable (or pin that the binder reads the raw provider response inline).

**Pros.** Loom-owned timing is testable through the existing `Clock` / `FakeClock` seam without depending on pi-ai's undocumented internals. Pins the 429 wire behaviour explicitly.

**Cons.** Adds a new normative obligation and likely a new constant (`BINDER_TRANSPORT_RETRY_DELAY_MS`). Duplicates work pi-ai may already do (total wait becomes loom-delay + pi-ai-delay). Requires deciding whether to honour `Retry-After`.

**Risks.** Cap selection is policy: too short defeats the purpose for 429; too long blows the binder's latency budget.

### Recommendation

Choose **Option A** if an audit of `@earendil-works/pi-ai`'s pinned minor (the lock-step pin at `pi-integration-contract.md#pi-sdk-pin`) shows it already owns transport backoff (`Retry-After` handling and a retry/backoff layer); the same paragraph adds a line to the bump procedure's re-validation list so a pi-ai minor that drops backoff is caught. If that audit shows pi-ai does **not** back off, fall back to **Option B** with a fixed 500 ms delay (no `Retry-After` parsing, no class split) — the minimum useful interval that does not require a new wire-format field — wiring the wait through the injected `Clock` seam so cancellation and FakeClock coverage already cover the path, with the cancellation rule ("an abort observed during any retry suppresses that retry") explicitly covering the in-delay window. Either way, the same paragraph should clarify the rule applies symmetrically to typed and untyped query transport-failure retries in `query.md`, or state explicitly that the binder is the only retrying transport site in loom 1.0.

## Relationships

- T22 "Binder inference call — no pi-ai entry point pinned" - must-follow (whether transport backoff is owned by pi-ai depends on which entry point that finding pins; if the chosen helper already owns backoff, Option A's delegation falls out, otherwise the binder spec must pin the timing itself — resolve the call-shape finding first).
- T15 "`TransportError.retryable` lacks a population rule outside the unsupported-provider case" - same-cluster (both expose gaps in the transport-error contract; a coherent edit would touch both in the same pass).
- T02 "Pi version-bump gate cannot detect three unstated host/provider behavioural presuppositions" - same-cluster (Option A delegates to the **Provider error mapping** surface that finding also touches).

---

## T06 - binder.md normative sections lack per-obligation BNDR-N anchors

> **PARKED** — 2026-06-04
> **Reason:** Category 2 (fixer too-hard — capability gap; the four-sub-section per-obligation `BNDR-N` coinage sweep plus the `coverage-matrix.md` update exceeds what the single-shot fast fix can complete). The `/spec-fix-findings-loop` fast loop (CascadeOrdering: off, no inner-loop trajectory) attempted a fast fix and the urgent reviewer returned FindingResolved: partial — the fixer narrowed to the three echo-policy obligations with a live GOV-9 citer, but the full four-sub-section per-obligation sweep and the coverage-matrix update were not done. Loop notes: finding not resolved by fast fix (urgent reviewer returned FindingResolved: partial — fixer narrowed to the three echo-policy obligations with a live GOV-9 citer; the full four-sub-section per-obligation sweep and coverage-matrix update were not done). A human (or a full `/spec-fix-findings-loop` run) must complete the remaining work — coin one `BNDR-N` per independently-testable obligation across all four normative sub-sections (*System-prompt structure*, *Compact-transcript format*, *System-note rendering*, *Echo policy* Format rules) and add the new IDs to `coverage-matrix.md` as uncovered — before re-introducing this finding.
> **Forensic report:** none (fast loop — no forensic report)

# T06 - binder.md normative sections lack per-obligation BNDR-N anchors

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

Four normative sub-sections of `binder.md` — *System-prompt structure (normative)*, *Compact-transcript format (normative)*, *System-note rendering*, and the *Echo policy* "Format rules" list — enumerate independently-testable RFC-2119 obligations, but none carries a `BNDR-N` REQ-ID anchor. Only `BNDR-1`..`BNDR-3` exist on the page (the binder-refinement-loop seam); the entire normative rendering and system-prompt body is un-coined. GOV-22 requires every individual obligation on a non-narrative page to be coined as a `BNDR-N` defining anchor, and GOV-9 requires cross-page citers to target a `#bndr-n` fragment; both contracts are currently unsatisfiable for these obligations. `schema-subset.md` § *Canonical form* item 2 already depends on the echo-policy `integer`/`number` rendering rules but can only cross-reference the bare `#echo-policy` section anchor.

## Solution approach

Coin one `BNDR-N` per independently-testable obligation across the four sub-sections in a single coordinated sweep, allocating the next free integers after `BNDR-3` in source order (the four sub-sections share one `BNDR` numbering space; verify the high-water mark with `grep -i 'bndr-' docs/spec_topics/binder.md` before assigning, since per GOV-3 numbering never collapses to fill holes). Use GOV-1 dual-form `<a id="bndr-n"></a> **BNDR-N.**` anchors. Repoint `schema-subset.md` § *Canonical form* item 2 from `./binder.md#echo-policy` to the specific new `#bndr-n` fragments for the `integer`, `number`, and reference-rendering rules it relies on. Add the new IDs to `coverage-matrix.md` as uncovered.

## Solution constraints

- Coinage is anchor-only: wrap the existing obligation prose with `BNDR-N` anchors without altering the normative content, preserving the inline edge-case parentheticals (e.g. the `±1e21` switch ban, the `NaN`/`±Infinity` exclusion, the "field order is irrelevant" disclaimer) verbatim.

## Relationships

- T21 "System-note rendering — prefix backticks disagree across normative statements" - must-follow (the backtick byte-form must be pinned first so each newly-coined system-note / echo-policy rule anchor cites the corrected prose).
- T09 "PIC sections beyond \"Probe-wide invariants\" — missing REQ-ID anchors" - same-cluster (same GOV-22 pattern on `pi-integration-contract.md` under the `PIC` prefix).
- T05 "Seam-blockquote MUSTs on `errors-and-results.md` and `invocation.md` lack co-located REQ-ID anchors" - same-cluster (same GOV-22 pattern under the `ERR` / `INV` prefixes; resolves independently).
