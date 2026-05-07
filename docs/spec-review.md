# Triaged Spec Review — spec.md

_Generated: 2026-05-07T07:09:02Z_
_Source: docs/reviews/spec-review/spec-20260507-064438-enriched.md_
_Spec: spec.md_
_Process: bottom-up — the last finding (T26) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 1 high, 8 medium retained; 31 low discarded; 4 low findings merged into 2 medium findings; 8 nit dropped; 0 false dropped._

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
