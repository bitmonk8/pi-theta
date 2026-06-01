# Triaged Spec Review - spec.md

_Generated: 2026-05-31T15:30:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T25) is addressed first; the first finding (T17) is addressed last._

_Triage tally: 6 high retained._

---

# T17 - Slash-handler registration leaves the `getArgumentCompletions` value undefined

**Kind:** implementability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The Pi Integration Contract pins the slash-registration call shape at the `#slash-handler-registration` anchor (Extension entry point step 3) and at the `#sdk-cap-slash-command-registration` SDK capability inventory item 1 as the literal three-key object `pi.registerCommand(name, { description, getArgumentCompletions, handler })`, presenting all three keys as required surface area. The spec never states what value loom 1.0 passes for `getArgumentCompletions`. Pi's `RegisteredCommand` type makes the property optional, so omitting the key, threading `undefined`, and supplying a no-op completer are all type-legal — yet every other loom 1.0 statement says no autocomplete surface exists (`slash-invocation.md`, `frontmatter.md`, `future-considerations.md`). Two literal-reading implementers can each be conformant while producing different `pi.registerCommand` calls, and any contract test pinning the call has nothing to assert against.

## Solution approach

Rewrite the `pi.registerCommand` literal at the `#slash-handler-registration` anchor and at `#sdk-cap-slash-command-registration` to the two-key form `pi.registerCommand(name, { description, handler })`, and sweep every other restatement of the three-key literal on `pi-integration-contract.md` (including the *Drain-state-gated dispatch* clause) to match. Add a sentence at one of those sites stating that loom 1.0 omits `getArgumentCompletions` because Pi's `RegisteredCommand` types it as optional and no loom 1.0 autocomplete surface exists, with a forward-link to [Future Considerations](./future-considerations.md) for the deferred `argumentHint`-style upstream.

## Solution constraints

- None.

## Relationships

None
# T18 - Settings scalar keys lack a malformed / out-of-range rule

**Kind:** completeness
**Importance:** high
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`discovery.md` § "Settings file reads" › "Keys read" declares four recognised scalar `looms.*` keys (`binderModel`, `scanPackages`, `scanPackagesMaxFiles`, `scanPackagesTimeoutMs`), each with a type, default, and meaning, but states no behaviour when a key is present with the wrong type or out of its implied range (e.g. `scanPackagesMaxFiles: 0` or `25.5`, `scanPackages: "yes"`, `binderModel: 42` or `null`). The "Failure modes" sub-section covers only file-level failures and the array-entry path (`loom/load/settings-invalid-entry`); scalar-key validation falls in the gap. The frontmatter side has a parallel rule, `loom/load/frontmatter-value-out-of-range`, but settings has no analogue, so two implementers diverge — one silently accepts and degrades (cap-0 disables discovery, a non-string model crashes the binder), another rejects and falls back to the default.

## Solution approach

Add a per-key validation rule to "Settings file reads" in `discovery.md` stating that a recognised `looms.*` scalar key whose JSON value fails the declared type and range is treated as absent (the built-in default applies) with one load-time diagnostic per offending key per file, mirroring the type/range shape of `loom/load/frontmatter-value-out-of-range`. Register the diagnostic in `diagnostics.md`, either generalising `frontmatter-value-out-of-range` to cover both surfaces or adding a settings sibling with the same severity-E / phase-load shape. Pin the per-key acceptance set: `binderModel` a non-empty string; `scanPackages` the JSON literal `true` or `false`; `scanPackagesMaxFiles` and `scanPackagesTimeoutMs` integers ≥ 1 judged on the parsed numeric value, with `null` out of range for every key.

## Solution constraints

- None.

## Relationships

None
# T19 - Integer-literal magnitude bound is unspecified

**Kind:** completeness
**Importance:** high
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`lexical.md`'s **Number literals** paragraph gives a literal with no fractional or exponent part the type `integer`, and `runtime-value-model.md` pins both `integer` and `number` to a JS `number` (IEEE-754 double). The spec does not say what happens when an `integer`-typed literal exceeds the safe-integer range (`|value| > 2^53 − 1`, e.g. `12345678901234567890`): default JS behaviour silently rounds to the nearest representable double, and because the rounded value is still integral it passes an `integer` sink with no diagnostic. The same gap applies on the `number` side at a larger threshold — a literal exceeding `Number.MAX_VALUE` (e.g. `1e400`) parses to `Infinity` with no rule covering reject / warn / accept. Two conforming implementations therefore diverge between silent precision loss (or silent `Infinity`) and a parse error.

## Solution approach

Add a magnitude/finiteness clause to the **Number literals** paragraph in `lexical.md` making an over-range `integer`-typed literal (`|value| > 2^53 − 1`) and a `number`-typed literal whose parsed value is not a finite IEEE-754 double both parse errors, consistent with the existing `loom/parse/integer-narrowing` reject-at-parse-time treatment of `integer`/`number` boundary violations. Register the corresponding new `loom/parse/*` diagnostic codes in `diagnostics.md` alongside `loom/parse/integer-narrowing`. Judge magnitude on the lexed literal token before the parse-time unary-`-` fold, so `-9007199254740992` is still rejected and `9007199254740992 - 1` (two tokens) is not.

## Solution constraints

- None.

## Relationships

- T20 "`\u{XXXX}` accepts non-scalar code points" - same-cluster (sibling completeness gap on literal value ranges in the same `lexical.md` section; resolve in the same edit pass for consistency).
- T18 "Settings scalar keys lack a malformed / out-of-range rule" - same-cluster (parallel out-of-range-scalar theme on a different page; no shared edit).
- T21 "`%` by zero is unspecified" - same-cluster (sibling numeric-semantics completeness gap; expressions.md side).
# T20 — `\u{XXXX}` accepts non-scalar code points

**Kind:** completeness
**Importance:** high
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The `**String literals.**` paragraph in `docs/spec_topics/lexical.md` defines the Unicode escape as `\u{XXXX}` with "1–6 hex digits" and no value constraint. Six hex digits encode up to `0xFFFFFF`, exceeding the maximum Unicode scalar value `U+10FFFF`, and the unconstrained range includes the UTF-16 surrogate block `0xD800`–`0xDFFF`, which are code points but not scalar values. No diagnostic covers out-of-range or surrogate content inside a recognised `\u{...}` form: `loom/parse/illegal-escape` fires only on unrecognised characters after `\`, and `loom/load/invalid-encoding` checks raw source bytes, not ASCII-source escapes. Behaviour for `\u{110000}`, `\u{FFFFFF}`, and `\u{D800}` is therefore unspecified, so conforming implementations diverge between rejecting, emitting a lone surrogate, or substituting `U+FFFD`.

## Solution approach

Rewrite the `\u{XXXX}` escape definition in lexical.md's `**String literals.**` paragraph to constrain the escaped value `v` to a Unicode scalar value — well-formed iff `v ≤ 0x10FFFF` and `v` is outside the surrogate range `0xD800`–`0xDFFF` — and to name a parse diagnostic for any other value. Add the corresponding diagnostic row to diagnostics.md's `lex` / `E` block alongside `loom/parse/illegal-escape`.

## Solution constraints

- None.

## Relationships

- T19 "Integer-literal magnitude bound is unspecified" — same-cluster (sibling completeness gap in the same lexical section; resolve in the same editorial pass).
# T21 - `%` by zero is unspecified

**Kind:** completeness
**Importance:** high
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/expressions.md` § "Other arithmetic" pins division-by-zero behaviour (IEEE-754 `Infinity` / `-Infinity` / `NaN`, "does not panic") and states that `%` "requires same-typed operands and preserves the type", but never states what `n % 0` evaluates to. In the JS host this section keys off, `n % 0` is `NaN`, which collides with the type-preservation clause for `integer % integer`: `NaN` is a `number`, not an `integer`, so applying the operator type rule literally yields a value whose runtime type contradicts its static type. The diagnostics-page panic-catalogue exclusion paragraph lists "division by zero, integer overflow, and explicit author-driven panics" but omits modulo, so an implementer cannot infer the intended channel by analogy. Two reasonable implementations diverge — one returning `NaN`, another panicking, another widening the integer result to `number`.

## Solution approach

Clarify expressions.md § "Other arithmetic" to specify modulo-by-zero behaviour by analogy with the existing division-by-zero rule: `% 0` yields IEEE-754 `NaN` and does not panic, and the `%` type-preservation rule is conditional on a non-zero divisor so an `integer % 0` result widens to `number` per the `integer ⊑ number` rule (rule 2, [Type System — Type compatibility](./type-system.md#type-compatibility)). Extend diagnostics.md's `loom/runtime/*` closing exclusion paragraph to list modulo by zero alongside division by zero among the deliberately-excluded non-panics.

## Solution constraints

- None.

## Relationships

- T19 "Integer-literal magnitude bound is unspecified" - same-cluster (independent numeric edge-case completeness gap on a different surface — lexical vs. operator).
# T22 - Typed-query non-compliance paragraph names a placeholder (`<validator-errors>`) that does not exist

**Kind:** implementability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The typed-query non-compliance paragraph in `docs/spec_topics/pi-integration-contract.md` (the synthesised-issue clause that feeds the respond-repair pipeline) names a `<validator-errors>` placeholder on the `validator_error` template. That template, defined normatively in `query.md` under *Follow-up turn templates*, carries no such placeholder — its sole AJV-derived placeholder is `<ajv-summary>`, the same name used by the sibling binder failure-mode templates. The token `<validator-errors>` appears nowhere else in the corpus, so an implementer or test author keying on it either searches for a token that does not exist or invents a second, divergent placeholder. This citation is the only documented bridge between the PIC non-compliance arm and the normatively-pinned template.

## Solution approach

In `pi-integration-contract.md`, rename the `<validator-errors>` placeholder reference in the typed-query non-compliance paragraph to `<ajv-summary>`, matching the placeholder the `validator_error` template actually defines in `query.md`. The surrounding clause describing the placeholder as rendered from the synthesised issue as if AJV had produced it remains accurate, since `<ajv-summary>` is the AJV-derived placeholder being described.

## Solution constraints

- Out of scope: the `validator_error` template and its `<ajv-summary>` placeholder rule in `query.md` are normative and read-only — align the PIC citation to the template, not the template to the citation.

## Relationships

None
