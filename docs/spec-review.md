# Triaged Spec Review - spec

_Generated: 2026-06-01T09:02:14Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T12) is addressed first; the first finding (T10) is addressed last._

_Triage tally: 3 high retained; 9 medium removed post-triage by request; 15 low discarded; 7 low findings merged (then removed with the mediums); 2 nit dropped; 0 false dropped._

---

# T10 - typebox single-instance precondition is unstated and unverified

**Kind:** assumptions
**Importance:** high
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The spec's "Pi SDK and capabilities" paragraph and PIC's `typebox` sub-paragraph (under `#pi-sdk-pin`) declare `typebox` as `"typebox": "*"` "so the host's bundled version wins", treating the bundled-instance outcome as a fact. That clause depends on two unstated preconditions: that the host actually bundles `typebox`, and that the package manager dedupes the `"*"` range to that single bundled instance. Step 0 (e) only verifies `typeof Type.Unsafe === "function"` against whatever `typebox` the loom resolves, which passes even when a second, separately-resolved `typebox` instance coexists with the host's; the four `@earendil-works/*` peer-deps get a Step 0 (d) version lock-step that would catch such drift, but `typebox` is explicitly carved out with no compensating check. A multi-instance resolution therefore surfaces downstream of `pi.registerTool` as a wrong-schema-shape failure rather than as a clean `loom/load/host-incompatible` refusal at factory entry.

## Solution approach

Clarify PIC's `typebox` sub-paragraph under `#pi-sdk-pin` to state the bundling-and-dedupe precondition the `"typebox": "*"` declaration depends on, and that the `"*"` range carries no version-pinning guarantee of its own. State that no runtime probe verifies `typebox` provenance or single-instance resolution beyond `Type.Unsafe` callability, treating a deduping failure with the same undefined-behaviour posture as the Silent shape drift carve-out at `#post-probe-sdk-shape-drift`. Rewrite spec.md's "Pi SDK and capabilities" paragraph to cite that precondition pin by location instead of restating "so the host's bundled version wins" as a bare claim.

## Solution constraints

- Out of scope: the Step 0 (d) four-package peer-dep lock-step iteration MUST remain carved out for `typebox`; do not extend it to cover `typebox`.

## Relationships

None

---
# T11 - `loads cleanly` is the GOV-15 trigger condition but is undefined

**Kind:** testability
**Importance:** high
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

GOV-15 (`gov-15`) in governance.md and the Source-language stability bullet (`source-language-stability`) in spec.md both open with "a `.loom` or `.warp` file that loads cleanly under loom 1.0.0", using `loads cleanly` as the condition that selects the input set for the loom 1.x equivalence promise on observables (a) return values, (b) ordered diagnostic-code sequences, and (c) `loom-system-note` content strings. The predicate is never defined anywhere in the corpus — not in GOV-15, the bullet, the glossary `loom 1.0.0` entry, diagnostics.md, or discovery.md. The candidate readings ("zero diagnostics of any severity", "no `E`-severity diagnostic", "a load that produced a registered loom") each select a materially different input set, because some `loom/load/*` codes leave the loom unregistered while others register it and emit only `W`-severity diagnostics. GOV-15's reviewer-inspection step and its deferred conformance fixture suite both need the predicate pinned; until then two reviewers will disagree on which inter-release diffs constitute a GOV-15 violation.

## Solution approach

Define `loads cleanly under loom 1.0.0` as a normative sub-clause of GOV-15 (`gov-15`) in governance.md, carrying a stable anchor, that fixes the predicate against existing diagnostics landmarks — the `Severity` column of the diagnostics.md Code registry (`code-registry`), with per-source `E/W` codes resolved against the Discovery — Failure modes classification — rather than coining a new severity classification. Rewrite the Source-language stability bullet (`source-language-stability`) in spec.md to forward-link the bare phrase to that new anchor.

## Solution constraints

- Out of scope: the observable (c) `loom-system-note` content-string equivalence definition owned by T12.

## Relationships

- T12 "`loom-system-note` equivalence is undefined for strings that embed variable sub-fields" - same-cluster (same Source-language stability bullet / GOV-15 paragraph; this finding pins the *Given* (`loads cleanly`) while T12 pins the *Then* (observable (c)); independent gaps that will likely land in the same edit pass).
# T12 - `loom-system-note` equivalence is undefined for strings that embed variable sub-fields

**Kind:** testability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The Source-language stability bullet (`spec.md`, `source-language-stability`) and its normative owner GOV-15 (`governance.md`, `gov-15`) promise that loom 1.x releases produce "identical … `loom-system-note` content strings" for any given input, listing wall-clock timing, token counts, and log-line volume as exclusions from the expectation. But the diagnostics registry embeds wall-clock-derived and per-invocation values directly inside `loom-system-note` content strings via the closed placeholder categories in `diagnostics.md`'s "Placeholder rendering" section — e.g. the `<ms>` elapsed-wall-time and `<uuid>`/`<invocation-id>` per-invocation placeholders. Two loom 1.x releases run on the same input therefore cannot produce byte-identical content strings even when behaviour is unchanged. GOV-15 observable (c) consequently has no decision procedure: applied literally every release fails on the first wall-clock- or UUID-bearing note, and the exclusion list names out-of-scope observables rather than a rule for normalising the strings before comparison.

## Solution approach

Rewrite the bare "identical … `loom-system-note` content strings" promise in both the `spec.md` `source-language-stability` bullet and GOV-15's main paragraph (`governance.md`, `gov-15`) to define an equivalence relation over rendered content strings rather than asserting raw byte-identicality. Delegate the variable-versus-fixed sub-field distinction to the `diagnostics.md` "Placeholder rendering" categories (§1–§8), including the existing category-8 prefix/suffix-anchoring treatment, so the wall-clock and per-invocation placeholders are the named source of permitted variation. Reconcile the standalone exclusion-list sentence with the new equivalence rule rather than leaving it to carry the comparison semantics alone.

## Solution constraints

- Both edit sites (the `spec.md` `source-language-stability` bullet and GOV-15's main paragraph) MUST land in the same commit with mirrored phrasing, per the GOV-12 lock-step convention.
- Out of scope: do not modify the `diagnostics.md` placeholder-rendering framework — the equivalence rule references it but the framework is the source of truth and stays unedited.

## Relationships

- T11 "`loads cleanly` is the GOV-15 trigger condition but is undefined" - same-cluster (same Source-language stability bullet / GOV-15 paragraph; T11 pins the *Given*, this finding pins the *Then* observable (c); independent gaps that will likely land in the same edit pass).
