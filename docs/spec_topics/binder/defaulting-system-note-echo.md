# Defaulting system note echo

## Defaulting

<a id="post-default-merge-ajv-validation"></a>

Defaults declared on `params:` fields are filled by the runtime *after* the binder returns, not by the binder. The binder is told (in its system prompt) which fields are required and which have defaults; for default-having fields, the binder may omit them from `args` when the user did not specify them, and the runtime fills the defaults before AJV validation. The binder is never asked to invent default values — only to extract what the user actually said.

The runtime default-fill is **fill-if-absent**, keyed on the field's wire name in the binder-returned `args`: when the wire name is present, the binder-supplied value is preserved unchanged and no default is applied (even when the binder, contrary to its instructions, emitted a value for a defaulted field); when the wire name is absent, the field takes its declared default. Only a field that took its declared default this way is tagged `(default)` in the echo (see [Echo policy](#echo-policy)) — a binder-supplied value for a defaulted field is untagged. Because `<params-schema-with-defaulted-fields-relaxed>` leaves defaulted fields in `properties` under `additionalProperties: false`, both a binder-supplied value and a runtime-filled default produce a structurally valid envelope; fill-if-absent is what decides which value survives, so the merged `args` and the echo's `(default)` tagging are identical across conforming implementations on identical binder responses.

The **post-default-merge AJV validation** is the named hook this section installs: the `SchemaValidator.validate()` call that AJV-validates the merged `args` object against the lowered `params` schema after the runtime has filled the defaults above. Per [Schema Subset — Depth Enforcement](../schema-subset.md#depth-enforcement) the depth-walk runs *first* at this site (it is enforcement point #4 in that section's per-boundary table), so a depth-6 merged `args` payload short-circuits the AJV step and produces a depth-walk failure that is classified into the AJV-on-`args` retry class per [Failure-class taxonomy](./determinism-cancellation-failure.md#failure-class-taxonomy) below.

<a id="system-note-rendering"></a>
## System-note rendering

All binder-emitted system notes — the success echo, the `needs_info` and `ambiguous` failure messages, and the three runtime-emitted failure rows in the table below — share one line-discipline. The rules apply uniformly to every model-supplied or runtime-supplied substring interpolated into the note; `bind_echo` and the failure-modes table reference back here rather than restating them.

1. **Single line.** Replace each `\r`, `\n`, and `\r\n` in any model-supplied substring (the echo's interpolated values, the `message` field, each `candidates[i]`) with a single space. Collapse runs of whitespace to one U+0020 space. Trim leading and trailing whitespace from the result. For both the collapse and the trim sub-steps, **whitespace** is exactly the ASCII whitespace set {U+0009 (tab), U+000A (line feed), U+000B (vertical tab), U+000C (form feed), U+000D (carriage return), U+0020 (space)}, matching the enumeration style of the replacement sub-step above — never the language-dependent regex `\s` class. Non-ASCII whitespace, including U+00A0 (no-break space) and the U+2000–U+200A range, lies outside this set and is preserved verbatim (neither collapsed nor trimmed).
2. **Length cap.** The fully-rendered note (loom-controlled prefix + interpolated content) is capped at 120 Unicode code points. Truncation operates at code-point (Unicode scalar) boundaries — never at UTF-16 code unit boundaries, which would split surrogate pairs. When the rendered note exceeds 120 code points, the runtime MUST replace the overflow with a trailing `…` (U+2026) and the resulting note MUST be exactly 120 code points (the `…` counts toward the cap). When the rendered note is ≤120 code points, no `…` is appended. Implementations MAY additionally back the truncation point off to the nearest preceding extended grapheme cluster boundary as a rendering courtesy, provided the resulting note is still ≤120 code points; this back-off is non-normative and tests MUST NOT assert cluster-aware behaviour. The cap applies post-interpolation, so a long loom name reduces the budget available to the suffix; do not pre-truncate the suffix to a fixed sub-budget. Rule 1's whitespace collapse and trim run before this rule, so the 120-scalar measurement is taken over the rule-1 output. Note: `string.length` in JavaScript returns UTF-16 code units and over-counts every astral code point as 2; count scalars via `Array.from(str).length` or a `for…of` iterator.
3. **Prefix is loom-controlled, suffix is model- or runtime-controlled.** Failure-arm notes follow the grammar `loom /<name>: <fixed-phrase> — <sanitised-suffix>`; the success echo follows `Running /<name>: <formatted-args>`. The em-dash in failure notes (and the `:` in the echo) is the textual demarcation between the loom-controlled prefix and the model- or runtime-supplied suffix. Renderers MAY style the prefix distinctly, but the boundary is part of the contract so a downstream renderer knows which span it can trust.
4. **Empty model-supplied content.** A `message` that is empty after rule 1's stripping — the binder returned only whitespace — is treated as a malformed envelope, not as an empty note: surface via the malformed-envelope row in the failure-modes table. The same applies to a `candidates` array whose every entry is empty after stripping.
5. **`ambiguous.candidates` is not rendered in loom 1.0.** The `candidates` field stays in the binder envelope schema (the binder may emit it; AJV accepts `null`) but the loom 1.0 runtime does not surface it on the user-facing system note — the `ambiguous` row of the failure-modes table renders only `<message>`. The rendering question (and the array-truncation rules a future revision would need) is deferred along with the binder refinement loop; see [Future Considerations — Binder refinement loop](../future-considerations/surface-extensions.md#binder-refinement-loop).

*Reference rendering (normative; conforming implementations MUST reproduce this exactly).* A `needs_info` `message` of `binding\tfailed   here` — a literal U+0009 tab between `binding` and `failed`, then a run of three U+0020 spaces between `failed` and `here` — renders, after rule 1, as the system note `loom /<name>: argument binding needs more info — binding failed here`: the tab counts as whitespace, so the tab-plus-spaces run between the two words collapses to a single U+0020. By contrast a `message` of `a\u00A0b` (the two letters separated by U+00A0) renders unchanged as `a\u00A0b`, because U+00A0 is outside the rule-1 whitespace set.

## Echo policy

Configured via `bind_echo:` (`true` | `false`; default `true`). When echo is on (and the bypass did not apply), the runtime appends a one-line system note to the user's session immediately before the loom starts. The example below is illustrative — the format rules that follow are normative; no single example string can be (the formatter is data-driven and the rendered text depends on the loom's `params:` and the bound values):

> Running /code-review: language=TypeScript, focus_areas=["error handling", async], author={"Ada Lovelace", …}

Format rules:

- Top-level `params:` fields shown in declaration order, comma-separated.
- String values are rendered **unquoted** if the string is non-empty and every Unicode code point matches `[A-Za-z0-9_.-]`; otherwise they are rendered **quoted**. The quoted form is U+0022 (`"`), then the string with each U+0022 replaced by `\"` and each U+005C (`\`) replaced by `\\` (no other escapes), then a closing U+0022. The empty string renders as `""`. Whitespace, ASCII punctuation outside the unquoted set, non-ASCII letters, and C0 control characters all fall outside the unquoted set and therefore force quoting; only `"` and `\` are escaped — newlines cannot reach the formatter because [System-note rendering](#system-note-rendering) rule 1 has already collapsed them to spaces upstream.
- <a id="bndr-4"></a> **BNDR-4.** `integer` values are rendered as the canonical decimal form: a leading `-` for negative values, then the magnitude as base-10 digits with no leading zeros (other than the single `0` for zero itself), no thousands separators, no decimal point, no exponent. `-0` renders as `0`.
- <a id="bndr-5"></a> **BNDR-5.** `number` values are rendered as the shortest round-tripping decimal that reparses to the same IEEE-754 double, with the following pins: scientific notation MUST NOT be used in loom 1.0 (both ends of the JS `String(n)` switch are forbidden — the large-magnitude switch at ±1e21 and the small-magnitude switch at `|value| < 1e-7`; render the value in full fixed-point decimal form at every IEEE-754 double magnitude, matching the BNDR-4 "no exponent" precedent); a non-integral value MUST include at least one fractional digit; an integral value MUST NOT carry a trailing `.0` (an integral `number` renders as `42`, not `42.0`); `-0` renders as `0`. `NaN` and `±Infinity` are not valid JSON numbers and cannot reach the formatter — the binder envelope schema rejects them upstream.
- `boolean` values render as the literal lowercase tokens `true` and `false`.
- `null` values (a bound value of static type `null`, or a nullable field whose binding is `null`) render as the literal lowercase token `null`.
- Enum-variant values render as the variant's underlying wire string (the explicit RHS, or the variant name verbatim when no RHS is given — the same string the runtime stores per [Schemas](../schemas.md) "loom 1.0 enums carry string values only"), passed through the same quote predicate as a top-level string value. So `Severity.High` (RHS `"High"`) renders as `High`; an enum variant whose underlying string is `"needs review"` renders as `"needs review"`. The formatter sees only the underlying string at runtime; this rule keeps the implementation a flat type switch rather than carrying the static `Enum`-vs-`string` distinction into the formatter.
- Array values: arrays of **3 or fewer** elements are shown in full as `[a, b, c]` in element order; arrays of **4 or more** elements are shown as `[a, b, c, …+N more]` where the rendered prefix is the first three elements in order and `N` is the count of dropped elements (i.e. `total − 3`). An empty array renders as `[]`. Per-element rendering follows the same rules recursively (a string element is quoted by the same predicate as a top-level string value; a nested object element renders as `{first-field-value, …}`).
- Object values shown as `{first-field-value, …}` — just the first field's value as a hint. The first-field value is itself rendered by applying these same formatting rules recursively, so a composite first field — an array, a nested object, or a discriminated-union variant — renders by its own rule (an array-typed first field renders as `{[a, b], …}`; an object- or variant-typed first field renders as `{{first-field-value, …}, …}`). "First field" of an object value is the first field listed in the declaring `schema` block's source order (the same notion of order used by the top-level `params:` bullet above). For a value whose static type is a discriminated union, the variant's declared fields are used in the variant's own source order; the discriminator field is included in that order if it appears there. For a value whose static type is an [inline anonymous object](../type-system.md) `{ field: T, ... }` — which has no declaring `schema` block to consult — the first field is the leftmost field of the inline type expression as written in the loom source. This first-field definition applies recursively wherever the object rule reaches: a top-level `params:` field, an array element, or a nested object field whose static type is an inline anonymous object resolves its first field from its own inline type expression's leftmost field. The "field order is irrelevant" clause in [Type System](../type-system.md) compatibility row 8 governs type compatibility only and does not override this rendering rule. The trailing `, …` is part of the format and MUST be rendered for every object value, including objects whose declaring schema (or discriminated-union variant) declares exactly one field; the marker is fixed text, not an elided-field indicator (contrast with the array rule's count-bearing `…+N more`).
- Defaulted fields tagged `(default)`: `focus_areas=[] (default)`. The tag fires only when the field took its declared default (default-supplied, not binder-supplied); per [Defaulting](#defaulting)'s fill-if-absent rule a binder-supplied value for a defaulted field is rendered untagged.
- Total line subject to the shared 120-code-point cap defined in [System-note rendering](#system-note-rendering) above, measured over the whole line including the `Running /<name>: ` prefix; overflow truncated with `…`. The line-level cap wins over the array rule's own `…+N more` marker — if truncation falls inside an array, the inner `…+N more` may be cut. The 120-code-point cap is applied *after* per-value rendering, so a quoted string that fits its own predicate may still be truncated at the line level.

<a id="bndr-6"></a> **BNDR-6.** Reference renderings (normative; conforming implementations MUST reproduce these exactly):

| Value (declared type) | Renders as |
| --- | --- |
| `""` (string) | `""` |
| `"plain_id-1.2"` (string) | `plain_id-1.2` |
| `"has space"` (string) | `"has space"` |
| `"key=value"` (string) | `"key=value"` |
| `"with \"quote\" and \\slash"` (string) | `"with \"quote\" and \\slash"` |
| `"café"` (string) | `"café"` |
| `Cat { name: "Whiskers", color: "red" }` (schema declares `name` first) | `{Whiskers, …}` |
| `Cat { name: "Whiskers" }` (variant of `schema Animal = Cat \| Dog`; variant `schema Cat { kind: "cat", name: string }` declares `kind` before `name`, supplied implicitly) | `{cat, …}` |
| `Cat { name: "Whiskers" }` (schema declares only `name`) | `{Whiskers, …}` |
| `{ name: "Whiskers", color: "red" }` (inline `{ name: string, color: string }`) | `{Whiskers, …}` |
| `Tagged { tags: ["a", "b c"], name: "x" }` (schema declares `tags` first) | `{[a, "b c"], …}` |
| `Outer { pet: Cat { name: "Whiskers", color: "red" }, label: "x" }` (schema declares `pet` first; `Cat` declares `name` first) | `{{Whiskers, …}, …}` |
| `[]` (array) | `[]` |
| `["a", "b c"]` (array) | `[a, "b c"]` |
| `42` (integer) | `42` |
| `-0` (integer or number) | `0` |
| `3.14` (number) | `3.14` |
| `1e21` (number) | `1000000000000000000000` |
| `1e-8` (number) | `0.00000001` |
| `true` (boolean) | `true` |
| `false` (boolean) | `false` |
| `null` (null) | `null` |
| `Severity.High` (enum, RHS `"High"`) | `High` |
| `Severity.NeedsReview` (enum, RHS `"needs review"`) | `"needs review"` |

Setting `bind_echo: false` suppresses the echo. The bypass case (single-string param) auto-suppresses echo regardless of the frontmatter setting (there is nothing to misbind); declaring `bind_echo: true` on a bypass-eligible loom is `loom/parse/bind-echo-on-bypass` (warning).

The echo channel is also used for the binder's `needs_info` and `ambiguous` outputs, which *replace* execution rather than precede it (both shaped by [System-note rendering](#system-note-rendering)):

> loom /code-review: argument binding needs more info — missing required field `language`. Specify the language being reviewed.

> loom /code-review: ambiguous arguments — "focusing on Ada" could mean focus_areas or author. Be more explicit.
