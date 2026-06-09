# Triaged Spec Review - spec

_Generated: 2026-06-09T12:30:00Z_
_Spec: docs/spec.md_
_Ordered by importance (least→most important, top→bottom); processed bottom-up. IDs preserved from the prior triage (so they are not monotonic top-to-bottom)._

_Triage tally: 2 high retained in-document (2 findings); all medium and lower findings removed in a post-recalibration prune._

---

# T14 - `[custom:<type>]` role tag interpolates `CustomMessage.customType` verbatim with no safe-character constraint

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** true
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

Rule 3 of *Compact-transcript format (normative)* (`docs/spec_topics/binder/binder-model-and-context.md`) pins the `[custom:<type>]` role tag's `<type>` slot as the `CustomMessage.customType` string verbatim, and rule 5 disclaims the system-note sanitisation discipline for transcript bytes. `CustomMessage.customType` is typed only as `string` (`docs/spec_topics/pi-integration-contract/host-interfaces-core.md`), and the corpus's only `customType` constraint — the `loom-<purpose>` `SHOULD` convention in `extension-bootstrap-and-per-loom.md` — is namespace coordination, not a character class, and does not bind third-party values. A `customType` containing `\n`, `]`, or the sequence `: ` shatters the line-oriented transcript, breaking BNDR-7's MUST-reproduce-exactly contract; via the `convertToLlm` transform (`docs/spec_topics/pi-integration-contract/runtime-event-channel.md#custom-message-context-entry-presupposition`) the malformed bytes then propagate into every subsequent provider call.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** `20569f8` (2026-05-07, Thomas Andersen) — "Compact-transcript format for the session-context block is unspecified" — introduced the verbatim `[custom:<type>]` rule (rule 3) and the rule-5 "No sanitisation" disclaimer; `1a41db2` (2026-06-06, Thomas Andersen) — "Compact-transcript BNDR-7 oracle coverage and assistant byte-determinism" — introduced the contradicting obligation by re-designating the BNDR-7 reference renderings as MUST-reproduce-exactly and adding BNDR-7h, the first reference rendering to place a `[custom:<type>]` line inside the byte-exact oracle; `78a2f94` (2026-06-04) / `257c545` (2026-06-05) added the `convertToLlm` propagation presupposition that extends the consequence to every subsequent provider call.
**History:** The defect is a contradiction between two clauses, and the contradiction did not exist at inception. The verbatim rule and the "No sanitisation" disclaimer entered in `20569f8` (2026-05-07) and were consistent with the spec as it then stood: the compact transcript was illustrative — the BNDR-7 renderings were "examples revisable for clarity" (the exact phrasing `1a41db2` later removed) — so an unconstrained `customType` had no byte-level invariant to violate, and nothing parses the transcript back into structure to expose a round-trip break. The contradicting obligation was introduced on 2026-06-06 by `1a41db2`, which re-designated the renderings as MUST-reproduce-exactly and added BNDR-7h (a `[custom:<type>]` line inside the byte-exact oracle) without narrowing the `customType` character class to match; `f5e89f4` (2026-06-04) only relocated the section into `binder-model-and-context.md`. The finding is the gap between the verbatim rule and that obligation — it opened on 2026-06-06, not at the section's inception. (The earlier triage's "present-since-inception" verdict tracked only the age of the verbatim rule text and overlooked that the obligation it now contradicts is three days older than the review that first scored this high.)

## Solution approach

Narrow the `<type>` slot at rule 3 of *Compact-transcript format (normative)* (`binder-model-and-context.md`) to a safe character class that excludes `\n`, `\r`, `]`, the two-byte sequence `: `, and the empty string, and pin that the binder MUST reject any `CustomMessage` whose `customType` falls outside the class before transcript rendering, surfacing the rejection through a `loom/runtime/*` diagnostic. Narrow the `loom-<purpose>` convention in `extension-bootstrap-and-per-loom.md`'s `customType` ownership and collision rule so the loom-internal naming class nests inside the broader safe class. Add a forward-cross-reference from `host-interfaces-core.md`'s `CustomMessage` paragraph noting the binder is stricter than Pi's `string` typing.

## Solution constraints

- The rejection diagnostic MUST be a row added to the closed `loom/runtime/*` registry (`docs/spec_topics/diagnostics/code-registry-runtime.md`) under DIAG-2, not a code coined at the binder rule site.

## Relationships

None

---

# T21 - Cross-type `==` trigger predicate is internally inconsistent on `integer` vs `number`

**Kind:** implementability
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The cross-type-equality paragraph in `runtime-value-model.md` §Equality (anchor `id="equality"`) states the trigger for the `false` (`==`) / `true` (`!=`) cross-type disposition twice using two non-equivalent predicates in adjacent sentences: a structural predicate ("when the operand static types share no common structural ground") and a static-identity predicate ("the cross-type rule applies only when the static types differ"). The two diverge on every pair where one operand's static type is `⊑` the other — e.g. `42 == 42.0`, since `integer ⊑ number` holds per TYPE-2: the structural predicate does not fire the cross-type rule (falls through to per-shape *Primitives compare by value* → `true`), while the static-identity predicate fires it → `false`. The implementer has no principled tie-breaker, and the same ambiguity recurs for any subtype or union-arm pair not covered by the paragraph's four genuinely-disjoint worked examples. The mismatch is observable in user code and silently changes downstream control flow, schema dispatch, and `match`-arm selection.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 43a24f3 — pi-loom spec: resolve "== cross-type disposition + expressions/runtime-value-model equality link" (2026-06-07, Thomas Andersen)
**History:** Both contradictory trigger sentences — the structural "share no common structural ground" predicate and the static-identity "applies only when the static types differ" predicate — were introduced into `runtime-value-model.md` §Equality by the single commit `43a24f3`; a pickaxe (`-S`) over each phrase localises both to that one commit. The cross-type-equality paragraph arrived internally inconsistent in that one diff. No earlier or later commit touched the contradiction.

## Solution approach

Rewrite the cross-type trigger in `runtime-value-model.md` `id="equality"` to a single decidable predicate phrased against the `⊑` relation — the cross-type rule fires only when neither operand's static type is `⊑` the other — and delete the contradicting "applies only when the static types differ" sentence. Clarify the surviving "share no common structural ground" wording to name the `⊑`-based predicate and forward-link to `type-system.md#type-compatibility`. Add one worked example exercising the now-disambiguated subtype case (`integer`/`number` operands comparing `true`) to discriminate the chosen rule. Rewrite the `expressions.md` §Equality "share no common structural ground" link prose in lockstep so the link target and linker do not drift back into the contradiction.

## Solution constraints

- Out of scope: the per-shape equality bullets (`NaN`/`±0` primitives, arrays, objects, enums, `Result`) — do not weaken their language while editing the cross-type trigger.

## Relationships

None
