# Triaged Spec Review — spec.md

_Generated: 2026-05-07T07:09:02Z_
_Source: docs/reviews/spec-review/spec-20260507-064438-enriched.md_
_Spec: spec.md_
_Process: bottom-up — the last finding (T26) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 4 high, 12 medium retained; 31 low discarded; 4 low findings merged into 2 medium findings; 8 nit dropped; 0 false dropped._

---

# T01 — "Final value" in opening preamble joins tail expression and `return expr` with bare "or"

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** "Final value" definition: ambiguous precedence between trailing expression and `return expr`
**Original section:** spec.md — Opening paragraphs (before `## Orientation`)
**Kind:** clarity
**Importance:** medium

## Finding

`spec.md` (paragraph at line 5) introduces the *final value* concept with the phrase:

> "evaluation also produces a *final value* — the loom's last expression or `return expr` per [Function Definitions — Final value]"

The bare "or" admits two readings: (a) one supersedes the other when both are present (in which case the spec needs to say which fires first), or (b) they are interchangeable specifications of the same value (in which case a `return expr` mid-body and a tail expression both contribute and the relationship is left undefined). Neither reading is selected here.

The cited anchor — [`functions.md#final-value-language-definition`](./spec_topics/functions.md) — does not resolve the ambiguity either. Its definition reads "the value of its tail expression (success path only), or the literal `null` per the **Empty-tail body** rule"; `return expr` is not mentioned at all under that anchor. The actual short-circuit semantics are stated only in `return.md` ("`return expr` exits the enclosing function (or top-level loom) immediately, producing `expr` as the value of that scope … From a top-level loom, `return expr` exits the loom with `expr` as its return value, exactly as a tail expression would"). So the aggregator forwards to an anchor that, by itself, omits the very interaction the aggregator gestures at.

The behavior is unambiguous in implementation terms (a `return` short-circuits the block, so any tail expression after it is unreachable), but the canonical "Final value" definition does not say so, and the aggregator's "or" obscures rather than names that fact.

## Spec Documents

- `spec.md` — opening preamble, paragraph at line 5 ("On the success outcome, evaluation also produces a *final value* …") (edited)
- `spec_topics/functions.md` — `<a id="final-value-language-definition">` block, ~line 38 (edited)
- `spec_topics/return.md` — already states the short-circuit semantics; no change required (read-only)
- `spec_topics/invocation.md` — `#typed-return` anchor, downstream consumer of the definition (read-only)

## Plan Impact

**Phases:** Vertical V8, Vertical V9

**Leaves (implementation order):**

- V8f — `return` statement — (modified)
- V9c — Tail-expression return — (modified)

Both leaves already implement the underlying behavior; the modification is to add an interaction test (a body whose `return expr` precedes a different tail expression: the `return`'s operand is the final value, the tail expression is unreachable and triggers `loom/parse/unreachable-code`). V9c is the natural home for the assertion that a tail expression yields the final value *in the absence of an earlier `return`*.

## Consequence

**Severity:** advisory

A first-time reader of `spec.md` cannot tell from the paragraph or its forward-link whether `return expr` and the tail expression coexist, override, or are mutually exclusive. Implementers will reach the right answer by reading `return.md`, but a reviewer citing only the canonical "Final value" anchor in `functions.md` will find the `return` case missing entirely, weakening citability.

## Solution Space

**Shape:** single

### Recommendation

Two coordinated edits:

1. **`spec.md` line 5.** Replace
   > "the loom's last expression or `return expr` per [Function Definitions — Final value]"

   with
   > "the value of the loom's tail expression, or — if an explicit `return expr` executes first — the operand of that `return`, per [Function Definitions — Final value]."

   The phrase "executes first" makes the short-circuit precedence explicit without requiring a reader to chase two anchors.

2. **`spec_topics/functions.md` `#final-value-language-definition`.** Extend the first sentence of the **Final value (language definition)** block to acknowledge `return`:
   > "A loom or function's *final value* is the value of its tail expression on the success path, the operand of an explicit `return expr` if one short-circuits the body before the tail is reached (per [Return Statement](./return.md)), or the literal `null` per the **Empty-tail body** rule when no tail expression exists."

   This keeps `return.md` as the normative owner of `return`'s evaluation semantics while making the canonical "Final value" anchor self-contained for citation.

Edge cases the implementer must keep in mind:

- A `return expr` followed by a tail expression in the same block must continue to emit `loom/parse/unreachable-code` (already specified in `return.md`); the wording change does not weaken that.
- `return` from inside a nested control-flow construct (e.g., `if`, `for`) still exits the enclosing function/loom, not just the inner block — already covered by `return.md` and not in scope to restate at the aggregator.
- The `void` carve-out is unchanged: a `void`-typed loom or function still has no observable final value regardless of whether the body ends in `return`, a tail expression, or neither.

## Relationships

None

---

# T02 — `SHOULD` modal on V1.x stability guarantee contradicts the deliberate "no gate" scope choice

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** "SHOULD" modal on stability guarantee is ambiguous; no CI gate
**Original section:** spec.md — Orientation > Scope > Source-language stability
**Kind:** clarity, testability
**Importance:** medium

## Finding

`spec.md` Orientation → Scope → Source-language stability states: "A `.loom` or `.warp` file that loads cleanly under V1.0 SHOULD load and behave identically under every V1.x release." The same SHOULD-shaped claim is restated in the normative owner, [governance.md GOV-13](./spec_topics/governance.md#gov-13).

This wording is in direct tension with the rest of GOV-13 and with GOV-14:

- GOV-13 itself records: "V1.0 ships without an automated equivalence gate; equivalence between two V1.x releases is a release-process responsibility verified by reviewer inspection of the diff against the prior V1.x release."
- GOV-14 prohibits reviewers from re-raising the missing gate as a V1.0 correctness finding: "The V1.0 release decision treats the absence of an automated equivalence gate as a recorded scope choice, not a defect."

Under RFC-2119, SHOULD is a normative modal — implementers and reviewers are entitled to verify it. But GOV-13 declares the only verification mechanism is human diff inspection, and GOV-14 forbids treating its absence as a defect. The SHOULD therefore promises a property that the spec has already, deliberately, chosen not to enforce. A reader cannot tell whether they are looking at (a) a normative obligation backed by some unstated test, (b) a normative obligation that the project knows it cannot check, or (c) a non-binding aspiration miscoded as RFC-2119.

The "behave identically" predicate carries the same defect — see the related finding on equivalence-class definition — but the modal-strength problem is independent and resolvable on its own.

## Spec Documents

- `spec.md` — Orientation → Scope → Source-language stability bullet (edited)
- `spec_topics/governance.md` — GOV-13 (edited)
- `spec_topics/governance.md` — GOV-14 (read-only)
- `spec_topics/future-considerations.md` — Known V1 limitations bullet on source-language migration that quotes the equivalence claim (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. No existing plan leaf encodes a GOV-13 V1.x equivalence gate, and `coverage-matrix.md` row for governance maps only to H6 / V18s (REQ-ID anchor mechanics and the coverage closure gate), neither of which would change under the recommended fix.

## Consequence

**Severity:** advisory

A reviewer following RFC-2119 reads SHOULD as a verifiable obligation; GOV-14 then forbids them from acting on its absence. Two implementers shipping V1.0 will not diverge — neither is required to do anything — but the spec contradicts itself on whether V1.x equivalence is a contract or a goal, undermining the credibility of every other RFC-2119 modal in the corpus. No observable runtime behaviour is affected.

## Solution Space

**Shape:** single

### Recommendation

Drop the RFC-2119 modal from both `spec.md` and GOV-13. Recast the claim as a non-binding intent statement that points at the release-process discipline already named in GOV-13 and the deferred conformance suite already named in `future-considerations.md`.

- `spec.md` Source-language stability bullet: replace "SHOULD load and behave identically" with non-modal phrasing, e.g. "is intended to load and behave identically … per [Governance — GOV-13](./spec_topics/governance.md#gov-13)."
- `governance.md` GOV-13: replace "SHOULD load … and produce … identical" with "is expected to load … and to produce … identical", and rename the rule from "V1.x source-language equivalence — no mechanical gate" to "V1.x source-language equivalence — release-process goal" so the rule's own title signals informative scope. Keep the (a)/(b)/(c) enumeration of observables and the wall-clock / token-count / log-volume carve-outs.
- `governance.md` GOV-14: no edit needed once GOV-13 no longer claims to be normative; the prohibition on re-raising the gate as a correctness finding becomes redundant but harmless. Leave it in place — reviewers seeing "expected to" can still try to relitigate scope.
- `future-considerations.md` migration bullet: drop "promises" verb if it presupposes normative force; "states" or "declares the goal" suffice.

Edge cases for the implementer:

- Keep GOV-13's enumeration of equivalence observables `(a) return values, (b) ordered diagnostic-code sequences, (c) loom-system-note content strings` and the wall-clock / token-count / log-volume exclusions.
- The change to GOV-13's text is substantive under GOV-8 (modal weakening is explicitly called out as substantive in `governance.md`'s worked examples). It must be modelled as retire-GOV-13-and-add-fresh-ID, not in-place edit. The fresh ID lands at the page tail per GOV-8 *Split / Deletion-plus-add*.

## Relationships

None

---

# T03 — `@mariozechner/` scope dropped from sibling-package names on first mention

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** `@mariozechner/` scope omitted for sibling packages in spec.md
**Original section:** spec.md — Orientation > Prerequisites > Pi SDK and capabilities
**Kind:** implementability
**Importance:** medium

## Finding

The Prerequisites paragraph in `spec.md` (the `**Pi SDK and capabilities.**` block immediately under `### Prerequisites`) names the host as `@mariozechner/pi-coding-agent` but introduces the three sibling packages bare: "additionally pins `pi-agent-core`, `pi-ai`, and `pi-tui` as direct `peerDependencies`". The actual installable names — verified against `package.json#peerDependencies` and against `pi-coding-agent`'s own `dependencies` block — are `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, and `@mariozechner/pi-tui`. The scope is implied by parallelism with the host name and is correctly used elsewhere in the spec corpus (e.g. PIC's *Pi SDK pin* item 1 uses the scoped form), but on this first-mention paragraph the scope is missing and no parenthetical recovers it.

The same defect appears in `pi-integration-contract.md`'s opening paragraph (line 3): "the lock-step pin requiring `pi-agent-core`, `pi-ai`, and `pi-tui` to resolve to the same minor-version line…". PIC then immediately switches to the scoped form in the very next item; the inconsistency is internal to PIC as well as between PIC's intro and `spec.md`.

A reader or automation that copies the literal package names from either first-mention sentence into a `package.json` produces an installable-but-wrong manifest (npm will resolve unscoped `pi-agent-core` to a different package on the public registry, or fail to resolve at all if no such package exists). Every other site in the corpus that the build-time `peerDependencies` literal-read assertion in H1 consumes already uses scoped names, so the defect is confined to the two introductory paragraphs.

## Spec Documents

- `spec.md` — Orientation > Prerequisites > Pi SDK and capabilities (edited)
- `spec_topics/pi-integration-contract.md` — opening paragraph (edited)
- `package.json` — `peerDependencies` (read-only; ground truth)
- `spec_topics/pi-integration-contract.md` — *Host prerequisites — Pi SDK pin* item 1 (read-only; canonical scoped reference)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. H1's `peerDependencies` literal-read test (`plan_topics/h1-scaffold.md`) already keys on the scoped names (`peerDependencies["@mariozechner/pi-agent-core"]` etc.), and no other leaf consumes the affected sentences as a ground-truth literal. The fix is doc-only.

## Consequence

**Severity:** advisory

A human implementer is unlikely to install unscoped packages because the host-package scope makes the convention obvious, but a literal extraction (LLM-assisted manifest generation, regex-driven dependency-list scrape, or a contributor copying the sentence verbatim) yields a manifest that either resolves to the wrong package or fails to install. The cost is small but the fix is mechanical and removes a trap.

## Solution Space

**Shape:** single

### Recommendation

In both first-mention sentences (`spec.md` Prerequisites paragraph and `pi-integration-contract.md` opening paragraph), write the three sibling packages with their `@mariozechner/` scope on first mention:

- `spec.md`: "additionally pins `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, and `@mariozechner/pi-tui` as direct `peerDependencies` …"
- `pi-integration-contract.md` opening paragraph: "the lock-step pin requiring `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, and `@mariozechner/pi-tui` to resolve to the same minor-version line …"

Subsequent mentions in the same paragraph may abbreviate, provided the abbreviation is unambiguous (e.g. "the four `@mariozechner/*` packages"). Edge case for the implementer: do not introduce a parenthetical-only fix ("the three siblings, scoped under `@mariozechner/`") in lieu of writing the names in full — the build-time literal-read assertion in H1 keys on the scoped strings, and a future automated cross-check between the spec text and `package.json` should be able to grep the scoped name directly out of the spec.

## Relationships

- T04 "`^X.Y.Z` prose label \"minor-version line\" only coincides with npm caret semantics while Pi is in 0.x" — same-cluster (same Prerequisites paragraph; both edits land in adjacent prose)

---

# T04 — `^X.Y.Z` prose label "minor-version line" only coincides with npm caret semantics while Pi is in 0.x

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** `^X.Y.Z` labeled "minor-version line" conflicts with npm caret semantics
**Original section:** spec.md — Orientation > Prerequisites > Pi SDK and capabilities
**Kind:** clarity, completeness
**Importance:** medium

## Finding

`spec.md` (Orientation > Prerequisites > Pi SDK and capabilities) and `spec_topics/pi-integration-contract.md` (Host prerequisites — Pi SDK pin) both describe the lock-step rule across `pi-coding-agent`, `pi-agent-core`, `pi-ai`, and `pi-tui` as pinning all four to "the same `^X.Y.Z` minor-version line." The `peerDependencies` literal-read test in `plan_topics/h1-scaffold.md` enforces the literal `"^0.72.1"` for each entry. The prose label and the operator disagree in the general case: npm's `^X.Y.Z` is a *major-version* range (`>=X.Y.Z, <(X+1).0.0`) when X ≥ 1, a *minor-version* range (`>=X.Y.Z, <X.(Y+1).0`) when X = 0 and Y ≥ 1, and a *patch-pinned* range (`>=X.Y.Z, <X.Y.(Z+1)`) when X = Y = 0. Only the middle case — which happens to match the current `^0.72.1` pin — produces "minor-version line" semantics.

This matters in two directions. First, an implementer reading the abstract `^X.Y.Z` template alongside the prose "minor-version line" cannot tell which constraint is normative: the prose says minor-line, the operator says (in the general case) major-line, and the only thing reconciling them is the unstated invariant "we are currently in 0.x." Should the spec ever change one without the other, lock-step intent silently widens. Second, when `pi-coding-agent` crosses to `1.0`, the same `^X.Y.Z` template — interpreted literally and copied forward to `^1.Y.Z` — becomes a major-pinned range that permits all four `peerDependencies` to drift across minor lines independently, which is precisely the skew the lock-step rule exists to forbid. The Pi version bump procedure (PIC, *Pi version bump procedure*, step 4) instructs contributors to "update the version pin in `peerDependencies` and the equivalent literal here" but never names the operator (`^` vs `~`) or the major-zero hazard, so a contributor following the checklist on the day Pi releases `1.0.0` would write `^1.0.0` and break the invariant the spec claims to enforce.

The current `^0.72.1` pin is not itself broken — it produces the intended `>=0.72.1, <0.73.0` range — and contrary to the original review note, npm does not interpret `^0.72.1` as patch-pinned (patch-pinning applies only to `^0.0.Z`). The defect is that the spec describes a behavioural contract ("same minor-version line") in terms of an operator (`^`) whose semantics happen to match only by accident of being in major-zero with a non-zero minor.

## Spec Documents

- `spec.md` — Orientation > Prerequisites > Pi SDK and capabilities (edited)
- `spec_topics/pi-integration-contract.md` — Host prerequisites #1 (Pi SDK pin) (edited)
- `spec_topics/pi-integration-contract.md` — Pi version bump procedure, step 4 (edited)
- `package.json` — `peerDependencies` block (edited)

## Plan Impact

**Phases:** Horizontal H1

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

The `peerDependencies` literal-read test and the `peer-dep-range` entry of `SDK_SURFACE_INVENTORY` (both in `plan_topics/h1-scaffold.md`) assert the literal `"^0.72.1"`. The operator change to `~` requires updating both the constant and the test literal in lockstep with the spec edit.

## Consequence

**Severity:** correctness

Today the contract holds by coincidence: `^0.72.1` resolves to the intended minor-pinned range. The defect is latent — at the next major-zero exit (`pi-coding-agent 1.0.0`) a contributor following the documented bump procedure mechanically copies `^0.Y.Z → ^1.Y.Z` and silently converts a minor-line pin into a major-line pin, allowing the four `peerDependencies` to drift independently. The lock-step invariant the spec claims to enforce mechanically becomes unenforced; install-time skew across `pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-tui` becomes possible without any spec, test, or probe firing.

## Solution Space

**Shape:** single

### Recommendation

Switch the operator to `~` and update the prose to match. Replace `^X.Y.Z` with `~X.Y.Z` in both spec sites and in `package.json`'s four `peerDependencies` entries. The `~` operator's semantics are uniform across all major versions: `~X.Y.Z := >=X.Y.Z, <X.(Y+1).0`. Keep the prose label "minor-version line."

**Spec edits.**
- `spec.md` Prerequisites: `^X.Y.Z` → `~X.Y.Z`.
- PIC Host prerequisites #1: `^X.Y.Z` → `~X.Y.Z`; the four anchor citations of `^0.72.1` become `~0.72.1`.
- PIC Pi version bump procedure step 4: no wording change required (the operator is now stable across the 0.x → 1.x transition).
- `package.json`: four entries change from `"^0.72.1"` to `"~0.72.1"`; `typebox: "*"` unchanged.
- H1 leaf: `peer-dep-range` literal in `SDK_SURFACE_INVENTORY` and the `peerDependencies` literal-read assertion both change to `"~0.72.1"`.

Operator semantics now match the prose unconditionally — no major-zero coincidence. Survives the `1.0.0` transition without contributor action. The mechanical gates (literal-read test, surface-inventory constant) continue to enforce the invariant after Pi reaches 1.0 with no further spec change. The resolved range under `^0.72.1` and `~0.72.1` is identical for the current pin (`>=0.72.1, <0.73.0`), so the change is mechanical with no behavioural risk today.

Edge cases for the implementer:

- The H1 `peerDependencies` literal-read test and the `peer-dep-range` entry of `SDK_SURFACE_INVENTORY` must change literals in the same commit as `package.json`; splitting these leaves the H1 test red on `main`.
- The four `@mariozechner/*` entries must move together; `typebox: "*"` is unaffected and remains asserted by its own one-line literal-read assertion per PIC Host prerequisites #1.
- The `^0.72.1` example literal in PIC's opening sentence and at the renderer-registration / `ExtensionContext` paragraphs must be updated to `~0.72.1` in the same commit.

## Relationships

- T03 "`@mariozechner/` scope dropped from sibling-package names on first mention" — same-cluster (same Prerequisites paragraph; co-located edits)
- T26 "`semver` not declared as a production dependency in `package.json`" — same-cluster (adjacent `package.json` defect; co-located edit window)

---

# T05 — Item 8 of binder system-prompt structure has no testable surface

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** System-prompt instruction for defaulted parameters is not testable
**Original section:** spec_topics/binder.md
**Kind:** testability
**Importance:** medium

## Finding

`spec_topics/binder.md` § *System-prompt structure (normative)* enumerates eight obligations the rendered binder system prompt MUST satisfy. Items 1–7 each pin at least one literal token or structural marker that a conformance test can grep for: `Loom: /<name>`, `Description:`, `Argument hint:`, `Parameters:` (plus per-field structure), `User arguments:`, the `Recent session context` opener, and the kind-name tokens `ok` / `needs_info` / `ambiguous`. Item 8 — the no-invent-defaults instruction — names no token, no structural marker, no required clause, and explicitly declares "Wording is non-normative; the instruction's presence is."

The combination is contradictory: a conformance test cannot detect "presence of an instruction directing the model not to invent values for defaulted parameters" without some pinned anchor — any non-empty system prompt arguably contains, or arguably does not contain, such an instruction depending on how the reader paraphrases the rule. Two implementers can disagree about whether a given prompt satisfies item 8, and a test asserting compliance has no fixed string to assert against. This breaks the symmetry the rest of the list relies on and leaves the only rule whose subject (defaulting) is genuinely model-behavioural — and therefore the most likely to be silently dropped — without a test.

The illustrative prompt in the same section already supplies a sentence that would do the job (`Do not invent values for defaulted parameters that the user did not specify; omit them.`); the gap is purely that the section's normative obligations do not pin any of its tokens.

## Spec Documents

- `spec_topics/binder.md` — System-prompt structure (normative), item 8 (edited)

## Plan Impact

**Phases:** V16

**Leaves (implementation order):**

- V16f — `bind_context: none` — (modified)

V16f is the only leaf that asserts on the rendered binder system prompt (currently the `Argument hint:` line). Tightening item 8 adds one structural-prompt assertion to V16f's *Tests* list; no other leaf needs to move.

## Consequence

**Severity:** advisory

A conformance suite that takes item 8 at face value cannot fail any prompt for omitting the no-invent guidance, so an implementation that ships a binder system prompt without that instruction passes structure tests while degrading binder accuracy on defaulted-parameter looms (the binder is more likely to invent values for omitted defaulted fields, which then survive AJV and reach the loom). The damage is bounded — the example prompt already shows the right sentence and most implementers will copy it — but the obligation as written cannot be enforced.

## Solution Space

**Shape:** single

### Recommendation

Rewrite item 8 to pin a literal token, mirroring the pattern items 1–7 already establish. Concretely, replace the current text with:

> **No-invent-defaults instruction.** The prompt MUST contain a single line that includes both the literal substring `defaulted` (case-sensitive) and at least one of the directive substrings `Do not`, `omit`, or `skip` (case-sensitive). The rest of the wording is non-normative.

This keeps the "wording is non-normative" posture the section uses elsewhere while giving conformance tests a deterministic predicate (`line contains "defaulted" AND line contains one of {"Do not", "omit", "skip"}`). The section's illustrative fenced prompt already satisfies this rule (`Do not invent values for defaulted parameters that the user did not specify; omit them.`) and needs no edit. The conditional-presence machinery used by items 2/3/4/6 does not apply here — the obligation is unconditional, so no negative-half assertion is required.

Edge cases for the implementer:

- Apply the predicate to a single rendered line, not to the whole prompt — the spec's existing items use line-scoped tokens (`Loom:`, `User arguments:`) and a same-line co-occurrence rule keeps the test cheap.
- The `defaulted` token is chosen over `default` because the latter collides with the `default=<literal>` markers the *Parameters block* (item 4) emits per field; requiring `defaulted` (the adjective) avoids accidental satisfaction by a Parameters line.
- V16f's test list adds one assertion: render the system prompt for a loom whose `params:` declares ≥1 defaulted field, find the no-invent line by the predicate above, fail when no line matches.

## Relationships

None

---

# T06 — `cause` vs `reason` sub-discriminator fields inconsistent across error variants

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** `cause` vs `reason` sub-discriminator fields inconsistent across error variants
**Original section:** spec_topics/errors-and-results.md
**Kind:** naming
**Importance:** medium

## Finding

Three `QueryError` variants in `spec_topics/errors-and-results.md` carry a wire-level field that refines the top-level `kind` discriminator into a finer-grained sub-category, but the field is named two different things:

- `ValidationError.cause: "schema_validation" | "empty_template"`
- `CodeToolError.cause: "validation" | "execution" | "cancelled" | "unknown_tool"`
- `InvokeInfraError.reason: "load_failure" | "parse_failure" | "validation" | "panic" | "internal_error"`

The semantic role is identical in all three cases — a closed enum that partitions a single `kind` into design-level sub-arms that authors `match` on when they need arm-specific recovery. No other `QueryError` variant carries a sub-discriminator, so these three define the entire population.

The spec acknowledges the split in passing — the `ValidationError` body says `"consistent with the established `CodeToolError.cause` / `InvokeInfraError.reason` patterns"` — but that aside is the only place the divergence is mentioned, and it does not justify the choice. There is no glossary note, no naming convention page, and no rule that says "infra-class envelopes use `reason`, content-class envelopes use `cause`" (or any other rationale that would predict which name a future fourth variant should pick). Authors writing `match` patterns must memorise the variant-by-variant mapping, and a future variant author has no rule to consult.

## Spec Documents

- `spec_topics/errors-and-results.md` — `QueryError variants` (edited)
- `spec_topics/glossary.md` — new entry (edited)
- `spec_topics/invocation.md` — Failures section, references to `InvokeInfraError { reason: ... }` (edited)
- `spec_topics/query.md` — Failure-mode references to `ValidationError.cause` arms (read-only)
- `spec_topics/tool-calls.md` — Failures section, references to `CodeToolError { cause: ... }` (read-only)
- `spec_topics/cancellation.md` — references to `InvokeInfraError { reason: "panic" }` and the `CodeToolError { cause: "cancelled" }` arm (edited)

## Plan Impact

**Phases:** Vertical V5, V6, V7, V11, V13, V14, V15, V18

**Leaves (implementation order):**

- V5g — `QueryError` union — initial variants — (modified)
- V6i — Synthesised respond tool: schema lowering, AJV-validating `execute`, per-mode wiring — (modified)
- V7f — Object/schema pattern with field shorthand — (modified)
- V11i — Runtime depth cap of 5 — (modified)
- V13j — Respond-repair preserves tool-call side effects — (modified)
- V14f — `CodeToolError` variant: `validation` cause — (modified)
- V14g — `CodeToolError` variant: `execution` cause — (modified)
- V14h — `CodeToolError` variant: `cancelled` cause — (modified)
- V14i — `CodeToolError` variant: `unknown_tool` cause — (modified)
- V14s — `tools:` resolution-snapshot invariants — (modified)
- V15a — `invoke("./path.loom", ...)` parsing and resolution — (modified)
- V15d — Positional argument binding for `invoke` — (modified)
- V15e — `.loom` paths in `tools:` (default basename naming) — (modified)
- V15l — `InvokeInfraError` variant — (modified)
- V18c — `AbortSignal` before every tool call — (modified)
- V18n — Panic routing: `invoke` parent surface — (modified)

## Consequence

**Severity:** advisory

Authors must memorise which of two field names a given variant carries when writing `match` arms; a wrong-field destructure (e.g. `InvokeInfraError { cause: "panic" }`) does not match — under the V1 pattern grammar an unmet listed field is a non-match, not a parse error — so the arm silently falls through and authors hit a `MatchError` panic at runtime instead of getting an early signal. The runtime is unambiguous and conformant in either naming, so no observer divergence; the cost is author cognitive load and a recurring footgun for every new author and every new sub-discriminated variant added in V1.x.

## Solution Space

**Shape:** single

### Recommendation

Standardise to `cause` across all three variants. Rename `InvokeInfraError.reason` to `InvokeInfraError.cause` on the wire and in every spec / plan reference. The enum values stay unchanged. Add a one-sentence glossary entry for `cause` defining it as "the closed sub-discriminator that refines a `QueryError.kind` into design-level sub-arms; every variant whose `kind` partitions into multiple causes carries this field."

**Spec edits.**
- `errors-and-results.md`: rename the `reason` field on the `InvokeInfraError` schema; rewrite the in-body aside to drop the `/ InvokeInfraError.reason` half; update the Runtime panics paragraph (two occurrences of `reason: "panic"` and `reason: "internal_error"`).
- `invocation.md`, `cancellation.md`: rewrite every `InvokeInfraError { reason: ... }` reference.
- `glossary.md`: add a `cause` entry per above.

Two of three variants already use `cause`; the rename moves the minority, not the majority. The label "cause" reads more naturally for a sub-category-of-failure role than "reason," which is also overloaded with the runtime-event `reason` field on `resources_discover` (V14t). A single name is the only convention that scales without further glossary maintenance as future variants land.

The wire-format change is acceptable at this stage — the spec is pre-V1 and there is no shipping wire contract to break. The risk is editorial drift (missing one of the call-site references in `invocation.md` / `cancellation.md`); a coverage-matrix grep for `reason\s*:` constrained to `InvokeInfraError` contexts catches stragglers. The wire `kind: "invoke_failure"` discriminator stays unchanged (only the inner sub-discriminator field name moves), so all `match` arms keyed on `kind` are unaffected.

## Relationships

None

---

# T07 — `loom/parse/explicit-schema-mismatch`: "disagree" not anchored to the type compatibility relation

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** `loom/parse/explicit-schema-mismatch` "disagree" undefined against type compatibility relation
**Original section:** spec_topics/query.md
**Kind:** testability
**Importance:** medium

## Finding

`spec_topics/query.md` (Explicit form, paragraph after the `match` example) says the warning fires "if both a binding annotation and an explicit `<Schema>` are present, the explicit one is used (with `loom/parse/explicit-schema-mismatch` warning if they disagree)." The diagnostics-registry row for the same code (`spec_topics/diagnostics.md`, code-registry table) mirrors the wording: "Both a binding annotation and an explicit `@<Schema>` ascription are present and disagree."

"Disagree" is not a defined relation in this spec. `spec_topics/type-system.md` defines exactly one type-comparison relation, `T₁ ⊑ T₂` ("Type compatibility"), enumerated by an eight-row rule table; the same page is the normative referent for every other site that asks "may a `T₁` value be used where `T₂` is expected." Three readings of "disagree" survive this prose:

- **strict identity** — fires whenever `ascription ≠ annotation` syntactically (e.g. `let x: number = @<integer>\`...\`?` warns even though `integer ⊑ number` by Type-compatibility rule 2);
- **non-subtype** — fires only when `ascription ⋢ annotation` (i.e. when running with the explicit ascription would not produce a value the annotation would accept);
- **mutual incompatibility** — fires only when neither `⊑` direction holds.

Sibling sites in the spec already commit to one of these readings (e.g. `loom/parse/invoke-return-type-mismatch` is defined against the same `⊑` relation per `plan_topics/v15-invoke.md` V15c citation), so the omission here is asymmetric. Two implementers would diverge: a strict-equality reader fires the warning on `let x: number = @<integer>\`...\``, a subtype reader does not. The `V6h` plan leaf inherits the ambiguity verbatim — its **Tests** bullet says "wins over inference (with parse warning if it disagrees with binding annotation)" without naming the relation, so the test author cannot write the assertion.

## Spec Documents

- `spec_topics/query.md` — Explicit form (edited)
- `spec_topics/diagnostics.md` — code-registry row for `loom/parse/explicit-schema-mismatch` (edited)
- `spec_topics/type-system.md` — Type compatibility (read-only — referent)

## Plan Impact

**Phases:** Vertical slices

**Leaves (implementation order):**

- V6h — Explicit `@<Schema>`...`` ascription — (modified)

## Consequence

**Severity:** correctness

A V1.0 author writing `let x: number = @<integer>\`Rate 1-5: ${q}\`?` either gets a warning or does not, depending on which implementer read the prose. The warning is non-fatal, so divergence will not be caught by load-success tests; it surfaces only in diagnostic-tail snapshots, where two conformant implementations will disagree silently. The closing test leaf for V6h cannot write the assertion at all without the relation pinned.

## Solution Space

**Shape:** single

### Recommendation

Pin "disagree" to non-subtype under the established `⊑` relation. Replace "disagree" in both sites with: "the explicit `<Schema>` ascription is not compatible with the binding annotation under [Type System — Type compatibility](./type-system.md#type-compatibility) — i.e. `ascription ⋢ annotation`." Keep the warning severity. Add at least two normative test vectors to `query.md`: one no-warning case (`let x: number = @<integer>\`...\`?` — fires no warning, by Type-compatibility rule 2: `integer ⊑ number`), one warning case (`let x: integer = @<number>\`...\`?` — fires the warning; the explicit `number` could yield `3.5`, which the `integer` binding cannot accept).

**Spec edits.** `query.md` Explicit-form paragraph; `diagnostics.md` Description column for the row; `query.md` add a "Test vectors" subsection or inline pair.

This reuses the single normative relation already cited from every other compatibility site (`invoke` return, `match` arms, function arguments). It eliminates the "warning fires on a safe widening" surprise and is symmetric with `loom/parse/invoke-return-type-mismatch`.

Implementer edge cases:

- The check is parser-time; when either side is past the parser's static view (the `Unresolvable operands` paragraph in `type-system.md`), the warning is skipped — runtime AJV remains the safety net.
- Both directions `⊑` should be considered: the canonical "warn" condition is `ascription ⋢ annotation` (the value the explicit form produces could not be assigned through the annotation). The reverse (`annotation ⋢ ascription`) is not the warning condition — the binding annotation is the wider type by intent.
- Update the V6h leaf's **Tests** bullet to cite the same Type-compatibility anchor and to include the no-warning widening vector (otherwise the test will encode the strict-identity reading by default).

## Relationships

None

---

# T08 — Per-`package.json` read timeout: overrun is unbounded

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** Per-`package.json` read timeout: overrun is unbounded
**Original section:** spec_topics/discovery.md
**Kind:** testability
**Importance:** medium

## Finding

`spec_topics/discovery.md` (Edge cases bullet under "Package discovery") states that the `looms.scanPackagesTimeoutMs` cap is checked "*before each new candidate-package read attempt*; a single very slow read is not aborted mid-flight (deferred hardening)." The two `looms.scanPackages*` caps therefore only bound the number of *completed* reads and the elapsed wall-clock measured *between* reads — they place no upper bound on the time a single in-flight `package.json` open/read may consume.

The practical consequence is that a discovery walk can hang indefinitely on a single slow read (a stalled NFS mount, a FUSE filesystem with a wedged backing process, an EBS volume mid-failover, an antivirus driver holding an open). Because this read is performed during `session_start` (the `resources_discover` handler installed by V14t and exercised by V14m), an indefinite hang blocks slash-command registration for the whole session — not just the offending package — and the operator gets no `loom/load/discovery-slow` warning, because the cap-check site never fires while the read is suspended.

The deferral is also untestable as currently written. V14m's test list includes a `FakeClock`-driven case that "exceeds `looms.scanPackagesTimeoutMs` … stepped between candidate-package read attempts to push elapsed `Clock.now()` past the cap" — which exercises the cap *in the same shape the spec admits is the limitation*, not the slow-read case. Without a normative statement of overrun behaviour (a per-read deadline, or an explicit "no bound, tests MUST NOT assert" carve-out), conformance test authors cannot tell whether a 10-minute hang on a single read is a defect, an acceptable consequence of the deferral, or a violation of the `looms.scanPackagesTimeoutMs` contract.

## Spec Documents

- `spec_topics/discovery.md` — Package discovery → Edge cases bullet (the "package walk is bounded" paragraph) (edited)
- `spec_topics/diagnostics.md` — `loom/load/unreadable-source` registry row (edited)
- `spec_topics/pi-integration-contract.md` — `Clock` / `FakeClock` interface (read-only; the seam any per-read deadline implementation builds on already exists)

## Plan Impact

**Phases:** Vertical V14

**Leaves (implementation order):**

- V14m — Discovery: package `looms/` and `pi.looms` — (modified)

The V14m **Adds** paragraph already names the two caps and the opt-out; under the recommended fix the prose grows by one clause (per-read deadline) and the **Tests** list grows by one case. No other plan leaf grep-matches the per-read-timeout concept; V14n / V14o reuse the *settings file* read mechanism, not the package-walk read mechanism, so they are unaffected.

## Consequence

**Severity:** correctness

A single hung `package.json` read on a slow or wedged filesystem can block `session_start` indefinitely, preventing every loom (not just the offending package's) from registering and producing no `loom/load/discovery-slow` warning to tell the operator what happened. Two reasonable implementations will diverge: one will wrap reads in a deadline and surface a recoverable diagnostic, the other will trust the OS and hang. The spec currently sanctions both.

## Solution Space

**Shape:** single

### Recommendation

Add a per-`package.json` read deadline derived from the global cap: `max(200 ms, floor(looms.scanPackagesTimeoutMs / 10))` (so the default `2000 ms` cap yields a `200 ms` per-read deadline; an operator who raises the global cap automatically raises the per-read budget). Each candidate read is wrapped in `Promise.race([read, Clock.setTimeout(deadline)])`; on timeout the in-flight read is abandoned (no cancellation contract on `fs.readFile` is required — the handle is dropped and GC'd), the package is treated as unreadable for this scan, a `loom/load/unreadable-source` warning is emitted naming the package and the per-read-deadline cause, and the walk continues with the next candidate.

**Spec edits.**
- Replace the "deferred hardening" parenthetical in `discovery.md`'s Edge cases bullet with the per-read-deadline rule, naming the formula and the diagnostic.
- Add a sentence to the `loom/load/unreadable-source` registry row in `diagnostics.md` listing the per-read deadline as one of its causes, with a `details.kind = "package-read-timeout"` discriminator and a message template like `package '<name>' package.json read exceeded <deadline>ms during package discovery`.
- No new settings key; the per-read deadline is derived, not configurable, in V1.

This closes the indefinite-hang hole, reuses the existing `Clock` seam V14m already depends on, and is testable with the `FakeClock` infrastructure H2 ships. The derivation `max(200 ms, floor(looms.scanPackagesTimeoutMs / 10))` keeps the operator surface (one settings key, two caps) unchanged.

Implementer must watch:

- The abandoned read's Promise will eventually resolve or reject; the runtime MUST attach a `.catch(() => {})` to silence unhandled-rejection warnings without re-routing the late result back into the discovery pass.
- The per-read timer MUST be scheduled through the injected `Clock.setTimeout` (not the global `setTimeout`), or the `FakeClock` test in V14m's list cannot drive it deterministically.
- When the deadline fires, the package is treated as unreadable for *this scan only* — a subsequent reload must re-attempt, not cache the timeout outcome — matching the existing rule that `loom/load/unreadable-source` is per-pass.
- If the per-read deadline fires but the global `looms.scanPackagesTimeoutMs` would also have tripped on the next iteration, the per-read warning is emitted first and the global `loom/load/discovery-slow` warning still fires from the cap-check site at the next candidate (no suppression rule needed).

## Relationships

None

---

# T09 — Schema-hash identifier is referred to by six surface names; none are in the glossary

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** "slug" and "Canonical schema hash" are two names for the same concept; neither is in the glossary
**Original section:** spec_topics/glossary.md
**Kind:** naming
**Importance:** medium

## Finding

The 16-hex-character SHA-256 truncation that content-addresses every lowered JSON Schema fragment is the most heavily cross-referenced identifier in the runtime contract — it keys the per-extension `pi.registerTool` cache, names the synthesised `__inline_…` `$defs` entries and `__loom_respond_…` typed-query tools, and keys the AJV compiled-validator cache. `schema-subset.md` defines the recipe under the heading **Canonical schema hash** and, in step 4 of that recipe, names the resulting value the **Slug** ("first 16 hex characters of the digest, lowercased"). Everywhere else, the spec uses one of at least six interchangeable surface forms:

- `<slug>` — the placeholder used in every `__inline_<slug>`, `__loom_respond_<slug>`, and `__loom_callee_<slug>__…` template (`schema-subset.md`, `query.md`, `implementation-notes.md`, `pi-integration-contract.md`).
- `<sha12>` — the placeholder used for the same identifier in `pi-integration-contract.md`'s prompt-mode registration paragraph (`__loom_callee_<sha12>__<post-rename-name>`, `__loom_respond_<sha12>`).
- "canonical schema hash" — used as both the recipe name and (informally) the resulting value in `pi-integration-contract.md`, `implementation-notes.md`, `query.md`, and `diagnostics.md`.
- "schema hash" — the type parameter of the registration cache (`Map<schema-hash, registeredToolName>` in `pi-integration-contract.md`).
- "the colliding slug" — used by `loom/runtime/registration-cache-collision` in `diagnostics.md`.
- "lowered-schema hash" / "lowered-schema content hash" — used as the validator cache key in `implementation-notes.md` and as the registration cache key in plan leaves derived from `pi-integration-contract.md`.

None of these terms appears in `glossary.md`, despite the spec's own rule that a coined term reused on more than one page warrants an entry. The relationship between "canonical schema hash" (the recipe / algorithm) and "slug" (its 16-hex output) is buried in step 4 of one section of one page; a reader landing on `pi-integration-contract.md`'s `Map<schema-hash, registeredToolName>` or `diagnostics.md`'s "the colliding slug" has no anchor to confirm that "schema hash", "slug", "canonical schema hash", and `<sha12>` all denote the same 64-bit truncation. The drift is internally inconsistent inside single sections too (`pi-integration-contract.md` switches between `<sha12>` and `<slug>` for the same template names; `v6-typed-queries.md` does the same in adjacent sentences).

## Spec Documents

- `spec_topics/glossary.md` — alphabetised vocabulary list (edited)
- `spec_topics/schema-subset.md` — `## Canonical schema hash` section, step 4 "Slug" (edited)
- `spec_topics/pi-integration-contract.md` — *Tool-registration lifetime and visibility*, *V1 diagnostic limitation* (edited)
- `spec_topics/query.md` — typed-query forced-respond paragraph and template body (edited)
- `spec_topics/implementation-notes.md` — *Runtime* — synthesised respond tool, `LoweredSchema` interface (edited)
- `spec_topics/diagnostics.md` — `loom/runtime/registration-cache-collision` row (edited)
- `spec_topics/errors-and-results.md` — `cause: "schema_validation"` paragraph (read-only; references the synthesised respond tool by name)
- `spec_topics/future-considerations.md` — diagnostic-placeholder closure list (read-only; lists `<slug>` as an unclosed placeholder)

## Plan Impact

**Phases:** Horizontal H4, Vertical V4, V6, V12, V14, V18

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified)
- V4a — AJV pipeline scaffold — (modified)
- V4f — Inline anonymous object hoisting — (modified)
- V6i — Synthesised respond tool: schema lowering, AJV-validating `execute`, per-mode wiring — (modified)
- V12a — `mode: subagent` accepted; AgentSession spawn — (modified)
- V14e — Pi tool wired into `@` queries as model-callable — (modified)
- V18f — File watcher (chokidar) over discovery roots — (modified)

Each leaf cites the schema-hash identifier under one of the surface forms above. All are *modified* (terminology sweep in `Adds` / `Tests` prose); none are *blocked* — the underlying mechanism is fully specified.

## Consequence

**Severity:** advisory

Every site that mentions the identifier means the same value, so an implementer following the cross-references will arrive at a working system. The cost is reviewer- and test-author-side: cross-referencing diagnostic codes, registration-cache invariants, and validator-cache hit rates requires mentally normalising five or six surface names, and within-paragraph drift (e.g. `__loom_respond_<sha12>` vs. `__loom_respond_<slug>` in `pi-integration-contract.md`) invites real typos into placeholder-rendering tests and conformance fixtures.

## Solution Space

**Shape:** single

### Recommendation

Pin two glossary entries and sweep the corpus to a two-term vocabulary:

1. **`canonical schema hash`** — the recipe defined in `schema-subset.md#canonical-schema-hash`. Use only when referring to the algorithm or the section.
2. **`schema slug`** (short form: `slug` when context is unambiguous) — the 16-lowercase-hex output of step 4 of that recipe. Use everywhere the spec or plan refers to the resulting identifier value.

Concretely:

- Add two `glossary.md` entries (alphabetised), each with a one-paragraph descriptor and a `See:` pointer to `schema-subset.md#canonical-schema-hash`. The `schema slug` entry must explicitly call out the synonyms to be avoided (`schema hash`, `schema-hash`, `sha12`, `lowered-schema hash`, `lowered-schema content hash`) so future drift is catchable by a grep gate.
- In `schema-subset.md` step 4, rename the bolded item from **Slug** to **Schema slug** so the canonical term appears at the source of truth.
- Sweep all six surface forms to `schema slug` (or `<slug>` in placeholder positions). In particular: `Map<schema-hash, registeredToolName>` becomes `Map<schemaSlug, registeredToolName>`; `__loom_callee_<sha12>__…` and `__loom_respond_<sha12>` become `__loom_callee_<slug>__…` and `__loom_respond_<slug>`; "the colliding slug" stays as-is; "lowered-schema content hash" / "lowered-schema hash" become "lowered-schema slug" or simply "schema slug".
- Plan leaves H4, V4a, V4f, V6i, V12a, V14e, V18f need the same sweep in their `Adds` / `Tests` prose.

Edge cases the implementer must watch:

- The diagnostic registry placeholder `<slug>` (called out in `future-considerations.md` as one of the still-unclosed identifier-shaped placeholders) is the same token; do not rename to `<schema-slug>` in placeholder positions, or the placeholder-rendering closure work will diverge from the rendering convention used by every other identifier-shaped placeholder.
- Wire-format identifiers (the literal characters Pi sees) must not change. The renames above are spec-prose only; the on-the-wire tool names `__loom_respond_<actual-16-hex-chars>` and `__loom_callee_<actual-16-hex-chars>__<name>` are unaffected.
- The byte-equality verification step in `pi-integration-contract.md` ("verify byte-equality of the cached canonical-form schema bytes against the new entry's canonical-form bytes before reusing the registration") still reads "canonical-form bytes" — that is the SHA-256 input, not the slug, and stays as-is. The recommendation only collapses names for the slug *output*.

## Relationships

None

---

# T10 — Hard-ceiling interaction: no rule for which surface fires when two ceilings could trip on the same event

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** Hard-ceiling interaction (two ceilings tripped on the same event): no precedence rule
**Original section:** spec.md — Orientation > Scope > Hard runtime ceilings
**Kind:** error-model
**Importance:** medium

## Finding

`spec.md` § *Hard runtime ceilings* asserts that each of the four ceilings has "a distinct, observable failure surface and no ceiling fails silently," but never states what happens when execution arrives at a point where two ceilings could plausibly fire for the same logical event. The owner pages do not fill the gap either: `errors-and-results.md` § *Runtime panics*, `query.md` § *Tool-call loop bound*, `invocation.md` § *Invocation depth bound*, and `schema-subset.md` § *Depth Enforcement* each describe their own surface in isolation; none names a precedence rule against the other three.

Three concrete overlaps exist within the runtime-evaluated subset (#1 invoke-depth panic, #2 `tool_loop_exhausted` `Err`, #4 JSON-depth-5 `Err`):

- A tool-call round at iteration `max_iterations` whose `tool_use` arguments are depth-6 (depth-walk runs at the tool-arg validation boundary per V14e/V14f vs. exhaustion check at the round boundary per V6k).
- A `?`-propagation point where the model's forced respond turn at iteration `max_iterations` of a typed query produces a depth-6 payload (depth-walk at the typed-query response boundary per V6i vs. exhaustion check on the same forced respond turn).
- An `invoke(...)` issued from inside iteration N of a parent's `tool_loop` that pushes the chain to depth 33 (panic at invoke entry per `loom/runtime/invoke-depth-exceeded` vs. tool_loop accounting in the parent).

Ceiling #3 (binder LLM-call cap) cannot interleave with the other three: per `binder.md` § *Binder bypass* and § *Binder model*, the binder runs once at slash-load time, only for slash invocations, and never for `invoke(...)` or registered-loom calls — by construction it cannot fire concurrently with a runtime ceiling.

The interpreter is single-threaded and each ceiling is checked at a distinct, well-defined site in evaluation order, so a working implementation will produce a deterministic answer in every overlap above. The defect is purely textual: the rule is implicit and a reader, test author, or fixer cannot cite it.

## Spec Documents

- `spec.md` — Orientation > Scope > Hard runtime ceilings (edited)
- `spec_topics/errors-and-results.md` — Terminal outcomes; Runtime panics (read-only)
- `spec_topics/query.md` — Tool-call loop bound (read-only)
- `spec_topics/invocation.md` — Invocation depth bound (read-only)
- `spec_topics/schema-subset.md` — Depth Enforcement (read-only)
- `spec_topics/binder.md` — Binder bypass; Binder model (read-only — confirms #3 cannot interleave)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The fix is a spec-text addition that codifies the evaluation order already implied by the per-site checks. No acceptance criterion in V6k (`tool_loop` exhaustion), V11i (depth walk), V14e/V14f (tool-arg depth), V16p (binder `args` depth), V18n (panic `invoke`-parent surface), or V18m (panic slash-command surface) needs to change — each leaf already tests its own surface in isolation, and the precedence rule does not introduce a new observable behaviour.

## Consequence

**Severity:** advisory

A reviewer or test author cannot cite the spec to justify which `loom-system-note` / `Err` variant a conformance test should expect for an event that satisfies two ceiling preconditions. Two implementers will most likely converge on the same observable behaviour because each ceiling is checked at a distinct site, but the spec leaves them no anchor to argue against an oddball implementation that, for example, defers depth-walk validation until after the tool_loop counter is incremented.

## Solution Space

**Shape:** single

### Recommendation

Add a short paragraph immediately after the four-ceiling enumeration in `spec.md` § *Hard runtime ceilings*, before the "No additional V1 runtime ceiling applies" non-goals bullet:

> **Interaction between ceilings.** Each ceiling is checked at a distinct point in single-threaded interpreter execution; the first check whose precondition is satisfied fires, and the unfired condition is then unreachable for that event. The fixed evaluation order is: ceiling #3 (binder LLM-call cap) at slash-load time, before any runtime ceiling can be checked; ceiling #1 (`invoke`-chain depth) at `invoke` entry, before the callee body runs; ceiling #4 (JSON-document depth) at every AJV validation boundary (typed-query response, `tool_use` args, `params` merge, `invoke<T>` return), before the boundary's other validation runs; ceiling #2 (`tool_loop.max_iterations`) at the tool-call-round boundary, after the round's tool calls have completed and before the next model turn is requested. Ceiling #3 never interleaves with #1, #2, or #4 — the binder runs only for slash invocations and only at load time, and `invoke(...)` calls do not invoke the binder per [Slash-Command Argument Binding — Binder bypass](./spec_topics/binder.md#bypass-cases). At most one ceiling surfaces per event; the spec does not promise reporting both.

Edge cases the implementer must watch:

- The depth-walk *precedes* AJV at every boundary per `schema-subset.md` (§ *Enforcement point*: "The walk runs **before** AJV at each site"). The precedence statement above must not silently re-order this — the depth-walk site is *the same* AJV boundary, just the first sub-check at it.
- A `tool_use` round whose tool-arg payload is depth-6 produces ceiling #4 (`validation` `Err` to the model) and the round is then permitted to continue the loop — this is one round of `tool_loop`, not exhaustion.
- An `invoke` issued from inside a tool-loop round counts against the parent chain's depth budget; if it panics with `invoke-depth-exceeded`, the panic propagates per V18n and the parent's `tool_loop` counter is irrelevant (the loop never resumes).
- A typed-query forced respond turn that produces depth-6 output surfaces as `cause: "schema_validation"` (per V6i) regardless of where the round count stands — depth-walk fires before the round-completion accounting that would tip into `tool_loop_exhausted`.

The non-overlap claim for ceiling #3 should also be added explicitly because the original review (and a reasonable reader) can wrongly imagine an "invoke also exhausts the binder cap" scenario; the rule above forecloses it.

## Relationships

- T12 "`invoke`-chain depth-32 cap: counting origin and subagent-mode boundary semantics undefined" — decision-overlap (precedence rule needs to know which event the depth cap trips on; pinning the breach inequality there makes "the 32nd-deep `invoke` also exhausts the binder LLM-call cap" precisely answerable)
- T15 "Ceiling #3 (binder LLM-call cap) is misclassified across the hard-ceilings aggregator" — co-resolve (both rest on tightening which ceilings can produce evaluation outcomes)

---

# T11 — `loom-system-note` messages re-enter model context as `user`-role text

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** `loom-system-note` channel: Pi serialization contract not pinned (messages re-entering model context)
**Original section:** spec.md — Orientation > Prerequisites > Host runtime
**Kind:** assumptions
**Importance:** high

## Finding

The spec routes every operator-facing diagnostic — parse, load, type, runtime-panic batches; binder failures; always-log runtime events; structural watcher notes — through a single `pi.sendMessage({ customType: "loom-system-note", … }, { triggerTurn: false })` call (PIC §**System notes**), and asserts in `spec_topics/errors-and-results.md` that pre-evaluation failures "surface per [Diagnostics] on the `loom-system-note` channel, never produce appended turns or a final value." `triggerTurn: false` is treated as the load-bearing guarantee that these notes do not perturb the model.

Pi's actual contract is the opposite of what that wording invites the reader to assume. `pi.sendMessage(..., { triggerTurn: false })` only suppresses the *immediate* turn fire; the message is still appended to the session as a `CustomMessage` (role `"custom"`). On every subsequent provider call, Pi's `convertToLlm` transformer (`@mariozechner/pi-coding-agent` `dist/core/messages.js`, the `case "custom":` arm) maps each `CustomMessage` to a fresh `{ role: "user", content }` entry — unconditionally, ignoring `display`, with no opt-out flag analogous to `BashExecutionMessage.excludeFromContext`. The cumulative effect: every parse error, binder failure, AJV-validation note, runtime panic note, and `display: false` always-log event the runtime emits is silently injected as user-authored text into the next turn the user sends in their bare Pi session.

This subverts several spec invariants without being visible at the spec surface. (a) The "subagent-private" claim for subagent-mode `display: false` cascades holds inside the subagent session but the parent's `display: true` cascade still leaks the panic prose into the user session's model context. (b) The `loom-system-note` becomes a hidden injection vector — a malformed loom file emits diagnostics that the model then reads as if the user had typed them. (c) Compaction and context-budget accounting now include diagnostic prose the spec implicitly treats as out-of-band. PIC nowhere pins what Pi does with custom-channel messages on subsequent provider calls; the reader (and the implementer) is left to assume `triggerTurn: false` means "side channel, not in context," which it does not.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — **System notes** / **Delivery surface** / **Runtime event channel** / SDK capability 6 (edited)
- `spec_topics/errors-and-results.md` — pre-evaluation failure paragraph using "never produce appended turns" wording (edited)
- `spec_topics/diagnostics.md` — channel description and renderer/fallback section (edited)
- `C:/Users/thomasa/AppData/Roaming/npm/node_modules/@mariozechner/pi-coding-agent/dist/core/messages.js` — `convertToLlm`'s `case "custom"` arm (read-only — primary evidence)
- `C:/Users/thomasa/AppData/Roaming/npm/node_modules/@mariozechner/pi-coding-agent/dist/core/messages.d.ts` — `CustomMessage` interface (no `excludeFromContext` field) (read-only)
- `C:/Users/thomasa/AppData/Roaming/npm/node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.d.ts` — `sendCustomMessage` JSDoc on `triggerTurn` (read-only)

## Plan Impact

**Phases:** Horizontal H3, Horizontal H4, Vertical V18

**Leaves (implementation order):**

- H3 — Diagnostics primitive and multi-error accumulator — (modified)
- H4 — Pi extension shell — (modified)
- V18i — Per-`kind` formatting for prompt-mode top-level `Err` — (modified)
- V18q — Runtime event channel and always-log emission — (modified)
- V18r — Settings-file watcher (`~/.pi/agent/settings.json`, `.pi/settings.json`) — (modified)
- V18m — Panic routing: slash-command surface — (modified)

(The `sendSystemNote` helper in H4 is the single chokepoint; H3, V18i, V18q, V18r, V18m all emit through it.)

## Consequence

**Severity:** correctness

The runtime as specified leaks diagnostic prose into the user's bare-Pi conversation context as user-role text on every turn after a `loom-system-note` is emitted. Two implementers reading the spec will diverge: one will trust the "never produce appended turns" wording and ship the leak; another will probe Pi's `convertToLlm` and either route notes elsewhere or add a Pi-side workaround. The leak is silent, accumulates across a session, and turns parse errors and panic messages into adversarial-injection surface for the model.

## Solution Space

**Shape:** single

### Recommendation

Document the leak honestly for V1 and pursue a Pi-SDK enhancement (`CustomMessage.excludeFromContext` field, mirroring `BashExecutionMessage.excludeFromContext`) as a fast-follow.

Concrete V1 spec edits:

1. In `errors-and-results.md`, replace "never produce appended turns or a final value" with "do not fire a new turn (`triggerTurn: false`) and produce no final value; the note enters subsequent provider calls as a `user`-role transcript entry per Pi's `convertToLlm` transform — see [PIC §Delivery surface]."
2. In PIC §**Delivery surface**, add a paragraph: "Custom-message channel persistence and LLM-context entry. Per `@mariozechner/pi-coding-agent`'s `dist/core/messages.js` `convertToLlm` transformer, every `CustomMessage` (including `loom-system-note`) is converted to `{ role: "user", content }` on every subsequent provider call. `triggerTurn: false` suppresses the immediate turn fire only; it does not exclude the message from the LLM context window. The `display` flag controls renderer behaviour, not serialization. Loom diagnostics therefore enter the user-session model context durably and contribute to `ctx.getContextUsage()` and compaction decisions. Operators authoring looms should expect parse errors, binder failures, panic notes, and always-log runtime events emitted in a session to be visible to subsequent model turns."
3. In PIC §**Runtime event channel**, add: "`display: false` gates only renderer visibility; the underlying `CustomMessage` still enters subsequent provider calls per **Delivery surface** above. Operators MUST treat all `loom-system-note` content (regardless of `display`) as durable session-context input."
4. Open a Pi-side issue requesting a `CustomMessage.excludeFromContext` field mirroring `BashExecutionMessage.excludeFromContext`. When Pi ships it, file a follow-up spec change to bump the SDK floor and set `excludeFromContext: true` on the canonical call.

This is the honest baseline; the spec must stop claiming "never produce appended turns" because Pi's `convertToLlm` contradicts it. A channel-split alternative (using `ctx.ui.notify` plus `ctx.sessionManager.appendCustomEntry`) would lose the inline transcript rendering and is too steep a UX regression for V1.

Edge cases the implementer must watch:

- The H4 `sendSystemNote` helper currently has no `excludeFromContext` parameter; the V1 helper signature stays unchanged.
- The H4 fallback-chain step that emits `loom/runtime/system-note-delivery-failed` via the diagnostics channel must not invoke `pi.sendMessage` again (existing re-entry guard); under this disposition this is unchanged.
- Subagent-mode `display: true` cascades land in the parent user session's transcript and therefore in the parent user session's model context — the spec must not promise subagent-private behaviour for the parent surface.
- Compaction sees these entries as ordinary `user` messages; nothing distinguishes them from real user input in token-accounting.

## Relationships

None

---

# T12 — `invoke`-chain depth-32 cap: counting origin and subagent-mode boundary semantics undefined

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** Invoke-chain depth 32: counting convention and subagent boundary interaction not stated
**Original section:** spec.md — Orientation > Scope > Hard runtime ceilings
**Kind:** completeness
**Importance:** high

## Finding

`spec.md` and [`invocation.md` — Invocation depth bound](./spec_topics/invocation.md) state that "the interpreter caps the nesting depth of an `invoke` chain at **32**, counting both direct `invoke(...)`, `.loom` callable calls through `tools:`, and `.warp` `fn` invokes (the count is per-chain, not per-process — sibling invokes do not share budget)." Two independent contracts are missing from this paragraph:

1. **Counting origin / breach inequality.** The text names *which call sites count* (direct `invoke`, registered-loom calls, cross-file `.warp` `fn` invokes) but never states what depth the slash-invoked top-level loom occupies, where counting begins, or whether the cap is `≤32` or `<32`. The diagnostic message in `errors-and-results.md` and `diagnostics.md` (`invoke chain depth exceeded: <depth> > 32`, with the worked example "A 33-deep `invoke` chain renders `33 > 32`") implies one specific reading — depth equals the number of countable frames in the chain, the slash entry is depth 0, and the breach fires when a frame would push the count past 32 — but this convention has to be reverse-engineered from a rendered example. An implementer asked "is the first nested `invoke` depth 1 or depth 2?" cannot answer from the normative text alone.

2. **Subagent-boundary interaction.** The cross-mode matrix on the same page describes subagent-mode children as spawning a *fresh isolated conversation* and (for `subagent → subagent`) as *sibling to* the caller's. The depth paragraph's "per-chain, not per-process — sibling invokes do not share budget" disclaimer addresses only *parallel* siblings (two invokes from the same parent get independent budgets); it does not say whether crossing into a subagent-mode child *resets* the depth counter, *shares* the parent's remaining budget, or *inherits* the absolute count. The choice has direct safety consequences: if subagent crossings reset the counter, runaway recursion through subagent-mode loom callees is bounded only by host stack — defeating the cap's stated rationale ("legitimate-but-runaway recursive divide-and-conquer"). The leaf V18n already encodes one specific reading in its test ("synthesized 33-deep `invoke` chain… sibling invokes do not share the depth budget"), but does not exercise the subagent-crossing case, so even the test surface does not pin the answer.

## Spec Documents

- `spec_topics/invocation.md` — *Invocation depth bound* (edited)
- `spec.md` — *Orientation > Scope > Hard runtime ceilings*, ceiling #1 (edited)
- `spec_topics/diagnostics.md` — code-registry row for `loom/runtime/invoke-depth-exceeded`, plus the worked-example bullet "A 33-deep `invoke` chain renders `invoke chain depth exceeded: 33 > 32`" (read-only — confirms the intended counting reading; no edit needed if the spec edit aligns with it)
- `spec_topics/errors-and-results.md` — message-template row for `loom/runtime/invoke-depth-exceeded` (read-only — same as above)

## Plan Impact

**Phases:** Vertical V15, Vertical V18

**Leaves (implementation order):**

- V15i — Cross-mode cell: prompt → subagent — (modified)
- V15j — Cross-mode cell: subagent → prompt — (modified)
- V15k — Cross-mode cell: subagent → subagent — (modified)
- V18n — Panic routing: `invoke` parent surface — (modified)

V15i/V15j/V15k each currently verify only conversation-isolation and transcript-leakage properties of one cross-mode cell. Each needs a small additional assertion that the depth counter passes through the boundary (i.e., a 32-level chain that crosses the relevant boundary still trips `loom/runtime/invoke-depth-exceeded` when the next frame would push to 33). V18n currently synthesizes a same-mode 33-deep chain; it needs an additional fixture chain that crosses into subagent mode partway through to make the per-chain semantics testable, and its existing depth-31-vs-32 fixture should explicitly pin the breach inequality (`33 > 32`, not `32 > 32`).

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on (a) whether the slash entry counts as a frame and (b) whether subagent-mode descents reset the counter. Divergence on (a) shifts every breach test by one frame and produces inconsistent diagnostic messages across implementations. Divergence on (b) is more serious: an implementer who resets across subagents leaves a runaway-recursion attack/footgun open precisely along the path the cap was designed to bound, and the resulting host-stack overflow falls outside the closed V1 panic-source list and is not catchable through the `invoke` boundary's `Err(InvokeInfraError)` envelope.

## Solution Space

**Shape:** single

### Recommendation

Extend the *Invocation depth bound* paragraph in `spec_topics/invocation.md` with two additional sentences and propagate the result via the existing forward-link from `spec.md` ceiling #1 (no separate aggregator edit needed; the bullet already says "per [Invocation — Invocation depth bound]"). The added contract:

> Depth is the count of *countable frames* on the active call chain, where a countable frame is any direct `invoke(...)` call, any `.loom` callable call dispatched through a `tools:` entry, or any cross-file `.warp` `fn` call. The slash-invoked top-level loom is depth 0; the first such frame nested inside it is depth 1. The cap is breached when the runtime is about to push a frame that would bring the count to 33, so the legal range is 1 ≤ depth ≤ 32 and the diagnostic renders `invoke chain depth exceeded: 33 > 32` (matching [Diagnostics — code registry](./diagnostics.md#code-registry)).
>
> The counter is per-chain and crosses subagent-mode boundaries unchanged. A `subagent → subagent` or `prompt → subagent` invocation does **not** reset the count: from the perspective of the cap, the subagent's spawned `AgentSession` is a continuation of the same call chain even though it owns a fresh conversation. The `subagent` carve-outs in the cross-mode matrix concern *conversation isolation*, not *call-chain accounting*. Two concurrent invokes spawned from the same parent (the "sibling invokes do not share budget" rule above) remain independent regardless of mode — the existing per-chain definition already covers that case.

Implementer-relevant edge cases:

- Within a `.warp` file, a `fn` calling another `fn` defined in the *same* `.warp` file is an in-file function call and does not count as a countable frame; only cross-file `.warp` `fn` invocations do. (This matches the existing wording — keep it as-is; the new paragraph does not relax it.)
- The depth counter is incremented before the child frame begins executing (so a child whose body itself overflows from depth 32 surfaces the panic at the child's very first nested `invoke`, not after some work has run).
- For subagent-mode children, the counter passes through the `customTools` / `AgentSession` boundary as a runtime-side invariant carried by the invoke trampoline; it is not part of the wire-level data passed to the spawned session and therefore does not appear anywhere in the Pi SDK surface.
- A `loom/runtime/invoke-depth-exceeded` raised inside a subagent-mode child still surfaces to its `invoke` parent as `Err(InvokeInfraError { reason: "panic", ... })` per V18n; the only thing the new contract changes is which frame trips the cap, not the routing of the resulting panic.

## Relationships

- T10 "Hard-ceiling interaction: no rule for which surface fires when two ceilings could trip on the same event" — decision-overlap (precedence rule needs to know which event the depth cap trips on; pinning the breach inequality here makes "the 32nd-deep `invoke` also exhausts the binder LLM-call cap" precisely answerable)
- T13 "`tool_loop.max_iterations`: validation rules and diagnostic surface unspecified" — same-cluster (parallel completeness gap on a sibling ceiling)

---

# T13 — `tool_loop.max_iterations`: validation rules and diagnostic surface unspecified

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** `tool_loop.max_iterations`: bounds, validation, and configurability unspecified
**Original section:** spec.md — Orientation > Scope > Hard runtime ceilings
**Kind:** completeness, prescription
**Importance:** high

## Finding

The `tool_loop.max_iterations` frontmatter field is one of the four hard runtime ceilings (`spec.md` Scope > Hard runtime ceilings, item 2), and `frontmatter.md` documents its default (`25`), what one "round" counts (free-phase tool-call rounds plus the typed-query forced respond turn), per-query and per-respond-repair-follow-up scoping, and the `0`-disables rule. Beyond that the field's input contract is undernormalized:

1. **Type ambiguity.** `frontmatter.md` line 143 calls `max_iterations` "a positive integer," but the same paragraph documents `max_iterations: 0` as the disable form. Plan leaf V13f's test list says "non-negative integers." The three statements disagree on whether `0` is in-range or a special-case escape; the spec does not pick one.
2. **No diagnostic code for invalid values.** `diagnostics.md` lists `loom/load/*` and `loom/parse/*` codes for `mode`, `params`, `tools`, `system`, and `argument-hint`, but no code covers `tool_loop.max_iterations` being negative, a non-integer number (`25.5`), a non-number (`"25"`), or a structurally bad block (`tool_loop: 25` with no `max_iterations` key, `tool_loop: null`, `tool_loop: {}`). The plan test "negative or non-integer values rejected" therefore has no spec-named code to assert against.
3. **No upper bound.** The field accepts arbitrarily large values; an author writing `max_iterations: 1000000` produces a valid loom under the current spec. Whether that is intentional (no cap) or oversight is not stated.
4. **Partial / empty block behaviour.** The field-contract table says `tool_loop` defaults to `{ max_iterations: 25 }`, but `tool_loop: {}` (block present, key absent) is not addressed: it could mean "use the default," "diagnostic for missing required sub-key," or undefined.
5. **Operator override silent.** `bind_model` documents a frontmatter → `looms.binderModel` settings chain. `tool_loop.max_iterations` documents only the frontmatter form; whether V1 deliberately omits an operator-level fallback (e.g. `looms.toolLoopMaxIterations`) is not stated, leaving readers to infer it from absence.

The semantics inside the loop (what a round is, when the cap fires, the resulting `QueryError`) are well specified; the gap is purely the input-validation perimeter.

## Spec Documents

- `spec_topics/frontmatter.md` — `tool_loop` prose (line 143) and field-contract table row (line 48) (edited)
- `spec_topics/diagnostics.md` — `loom/load/*` table (edited)
- `spec.md` — Scope > Hard runtime ceilings, ceiling #2 (read-only; the aggregator forward-link target)
- `spec_topics/query.md` — Tool-call loop bound (read-only; defines the runtime semantics that the validated value feeds)

## Plan Impact

**Phases:** V3, V6, V13

**Leaves (implementation order):**

- V3a — Frontmatter parsing — (modified — `tool_loop` is currently parsed as a deferred-frontmatter-field warning in V3a; once V13f fully parses it, V3a's deferred-warning test must drop `tool_loop` from its expected set)
- V13f — `respond_repair:` and `tool_loop:` frontmatter parsing — (modified — its test "negative or non-integer values rejected" needs the spec-named diagnostic code to assert against, and the "non-negative integers" framing must align with the spec's chosen type)
- V6k — `tool_loop` cap enforcement and `ToolLoopExhaustedError` — (modified — `max_iterations: 0` semantics ("model receives an empty `tools` set") are already in V6k's test list; once the spec resolves "positive" vs "non-negative," V6k's test wording follows)

## Consequence

**Severity:** correctness

Two reasonable implementations diverge: one rejects `max_iterations: -1` with a generic `loom/load/unknown-frontmatter-field` (wrong code), one silently coerces it to `0`, one rejects it with a new ad-hoc code. Conformance tests cannot be authored against an unnamed code. The "positive vs non-negative" contradiction means an author reading `frontmatter.md` cannot confidently predict whether `max_iterations: 0` is rejected or accepted as the disable form, which is observable behaviour at load time.

## Solution Space

**Shape:** single

### Recommendation

Tighten the `tool_loop.max_iterations` input contract in `spec_topics/frontmatter.md` and add the corresponding diagnostic code(s) to `spec_topics/diagnostics.md`:

1. **Type and range.** Reword the prose at `frontmatter.md` line 143 from "a positive integer" to "a non-negative integer (V1 imposes no upper bound). `0` disables model-driven tool calls entirely; positive values cap the loop." Drop the word "positive" from the sentence describing rounds.
2. **Single rejection code.** Add `loom/load/frontmatter-value-out-of-range` (E, load) covering: negative integer; non-integer number (e.g. `25.5`); non-number scalar (e.g. `"25"`); `null`. Message template: `frontmatter field '<dotted-key>' must be a non-negative integer; got <observed>`. Apply uniformly to `tool_loop.max_iterations` and `respond_repair.attempts` (the latter has the same gap and the plan v13f test already references "out-of-range `attempts` rejected" without a code).
3. **Empty / partial block.** Add to the field-contract table row for `tool_loop`: "`tool_loop: {}` (block present, `max_iterations` absent) is equivalent to omitting `tool_loop:` entirely; the default `25` applies." Mirror the same rule for `respond_repair: {}`.
4. **Operator override.** Add a one-sentence non-goal to `frontmatter.md`'s `tool_loop` prose: "V1 provides no operator-level override for `max_iterations`; the value is per-loom only. Adding a `looms.toolLoopMaxIterations` settings key is deferred per [Future Considerations]."
5. **Per-query scope confirmation.** The existing sentence "The cap applies independently to each query" already covers the nested-`invoke` case implicitly (each callee runs its own queries under its own frontmatter), but add an explicit half-sentence: "and to every query inside an `invoke`d callee, which uses the callee's own `tool_loop` frontmatter — the parent's budget is not debited by `invoke`."

Edge cases the implementer must watch:
- YAML coerces `25` and `25.0` to the same numeric scalar in many parsers; the validator must reject `25.0` based on the parsed-number's integer-ness, not on YAML lexical form.
- `max_iterations: 0` must round-trip through the cap-enforcement counter without producing a spurious `tool_loop_exhausted` on the very first turn — V6k already specifies the model receives an empty `tools` set in this case, but the counter must not double-charge.
- The new `loom/load/frontmatter-value-out-of-range` code must be added to `diagnostics.md` with a `<dotted-key>` placeholder rendered byte-identically; otherwise it inherits the testability gap that affects unenumerated diagnostic placeholders generally.

## Relationships

- T12 "`invoke`-chain depth-32 cap: counting origin and subagent-mode boundary semantics undefined" — same-cluster (parallel completeness gap on a sibling ceiling)
- T15 "Ceiling #3 (binder LLM-call cap) is misclassified across the hard-ceilings aggregator" — same-cluster (same Hard runtime ceilings bullet)

---

# T14 — Pre-evaluation failure enumeration: inline restatement in preamble, list never marked closed at owner

**Source:** docs/reviews/spec-review/spec-20260507-064438-enriched.md
**Original heading:** Pre-evaluation failure enumeration: normative content in preamble, list not closed
**Original section:** spec.md — Opening paragraphs (before `## Orientation`)
**Kind:** placement, completeness
**Importance:** medium

## Finding

The second paragraph of `spec.md`'s pre-`## Orientation` preamble carries this passage verbatim:

> Failures that occur *before* evaluation begins — host-incompatibility detected by the capability probe, lex / parse / type batches, frontmatter rejection, binder-model resolution failure, `tools:` resolution failure, watcher-time reload failures — are NOT evaluation outcomes; they surface per [Diagnostics](./spec_topics/diagnostics.md) on the `loom-system-note` channel, never produce appended turns or a final value, and are not subject to cancellation.

The same six-item enumeration and the same routing assertions appear, almost word-for-word, in `spec_topics/errors-and-results.md` immediately under the **Terminal outcomes** anchor (line 58). That topic-page paragraph is the canonical owner: it sits inside the section that GOV-12 already cites as the `## Errors and Results — Terminal outcomes` rule and is two lines below the closure phrase `the set is closed:` for the trichotomy.

Two distinct defects follow:

1. **Undeclared aggregator.** GOV-12 enumerates the spec.md aggregator surfaces by name. The pre-evaluation failure list is not in that enumeration, yet the preamble paragraph behaves like an aggregator — it restates the routing rule (`loom-system-note` channel, no appended turns, no cancellation) inline rather than confining itself to a forward-link.

2. **Closure absent at the owner.** Neither the preamble version nor the canonical `errors-and-results.md` version states that the six items are exhaustive. A reviewer encountering a seventh failure mode (path collision between `.loom` files, secret-store unavailability at frontmatter resolution, watcher-startup failure distinct from reload failure, manifest-load failure for the binder model registry, etc.) cannot determine from either page whether it joins the bucket or constitutes an unanchored case. Closure of the trichotomy itself is asserted ("the set is closed"); closure of the pre-evaluation bucket is not.

## Spec Documents

- `spec.md` — pre-`## Orientation` preamble, paragraph 2 (`Loom evaluation produces one of three terminal outcomes…`) (edited)
- `spec_topics/errors-and-results.md` — `<a id="terminal-outcomes"></a>` block, sentence beginning `The trichotomy applies only once evaluation has begun.` (edited)
- `spec_topics/diagnostics.md` — read-only (referenced as the diagnostic-code owner that the pre-evaluation bucket routes through)

## Plan Impact

**Phases:** Horizontal H6

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)

H6 already plans to retarget every `spec.md` introduction link from a section anchor to a `#prefix-n` REQ-ID anchor. Resolving this finding tightens that carve-out: the preamble paragraph collapses to a single `[Errors and Results — Terminal outcomes](#err-N)` link, which H6 then retargets to the closed-list REQ-ID once it lands.

## Consequence

**Severity:** advisory

A maintainer who later adds a seventh pre-evaluation failure mode has no signal from either page that the list was meant to be closed, so the new mode may be added in one place and not the other. A reviewer attempting to classify a novel runtime failure cannot decide from `errors-and-results.md` alone whether it belongs in the pre-evaluation bucket or constitutes a missing case. The implementation is unaffected — every individual diagnostic code is owned and tested elsewhere.

## Solution Space

**Shape:** single

### Recommendation

Make two coordinated edits.

1. **In `spec_topics/errors-and-results.md`** — close the bucket at its owner. Rewrite the sentence under `<a id="terminal-outcomes"></a>` so the six items are presented as an explicitly closed enumeration. Suggested shape:

   > The trichotomy applies only once evaluation has begun. The complete V1 set of failures that occur *before* evaluation begins is the six below; each surfaces per [Diagnostics](./diagnostics.md) on the `loom-system-note` channel, never produces appended turns or a final value, and is not subject to cancellation:
   >
   > 1. host-incompatibility detected by the capability probe (per [Pi Integration Contract — Step 0](./pi-integration-contract.md#entry-capability-probe))
   > 2. lex / parse / type batches (per [Diagnostics](./diagnostics.md))
   > 3. frontmatter rejection (per [Parameters and Frontmatter](./frontmatter.md))
   > 4. binder-model resolution failure (per [Slash-Command Argument Binding — Strict-capability requirement](./binder.md#strict-capability-requirement))
   > 5. `tools:` resolution failure (per [Parameters and Frontmatter — `tools`](./frontmatter.md#tools))
   > 6. watcher-time reload failures (per [Discovery](./discovery.md))
   >
   > No additional pre-evaluation failure surface applies in V1 — a future leaf that introduces one updates this list and the new failure's owner page in the same commit per the GOV-12 lock-step convention extended to this paragraph.

2. **In `spec.md` preamble** — replace the inline restatement with a single forward-link sentence:

   > Failures that occur before evaluation begins are owned, with their closed enumeration and per-cause routing rule, by [Errors and Results — Terminal outcomes](./spec_topics/errors-and-results.md#terminal-outcomes); they never become evaluation outcomes.

   No item names, no channel name, no cancellation assertion in the preamble.

Edge cases the implementer must watch:

- The preamble paragraph still carries the trichotomy itself, the cancellation-wiring claim, and the partial-append claim. Each of those is a separate concern; do not collapse the whole paragraph to a single link in this edit. Touch only the `Failures that occur *before* evaluation begins…` sentence.
- H6's introduction-link gate greps for `./spec_topics/<non-narrative-page>.md#<non-prefix-anchor>` residue. After this edit the preamble paragraph contains exactly one such link (the new forward-link to `#terminal-outcomes`), which H6 will then retarget to the REQ-ID anchor it assigns to the closed-list rule on `errors-and-results.md`.

## Relationships

- T15 "Ceiling #3 (binder LLM-call cap) is misclassified across the hard-ceilings aggregator" — co-resolve (the same pre-evaluation list is the target of both fixes; closing the list and adding binder-cap exhaustion can land in one edit)

---
