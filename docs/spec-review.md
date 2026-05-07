# Triaged Spec Review — spec.md

_Generated: 2026-05-07T13:35:00Z_
_Spec: spec.md_
_Process: bottom-up — the last finding (T21) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 1 high, 4 medium retained; 23 low discarded; 0 low findings merged into 0 medium findings; 19 nit dropped; 0 false dropped (13 false positives were filtered upstream by the enricher)._

---

# T01 — "loom-side name" vs "loom-side identifier": defined-term drift across topic pages

**Original heading:** "loom-side name" (glossary canonical) vs "loom-side identifier" (three topic pages)
**Original section:** spec_topics/ — Naming inconsistencies (multiple files)
**Kind:** naming
**Importance:** medium

## Finding

The glossary defines a single canonical pair — **`loom-side name`** vs **`wire name`** — and stipulates that the "loom-side name is the identifier a schema field is declared and referenced by in loom code." Three topic pages and one diagnostic message template use a competing phrasing, **`loom-side identifier(s)`**, for the same concept:

- `runtime-value-model.md` lines 12, 22, 28 ("JS plain object keyed by **loom-side identifiers**", "key set (loom-side identifiers)", "rebuilds the value with loom-side identifiers using each schema's translation map").
- `diagnostics.md` line 255, in both the *Description* and *Message* columns of `loom/parse/redundant-wire-name`: `redundant 'as' clause: wire name '<name>' equals the loom-side identifier`.
- `query.md` line 164 ("the loom-side identifiers an author writes never appear in the rendered prompt").

A fourth phrasing, **`loom-side field name`**, also appears (`diagnostics.md` line 339 in the `loom/runtime/missing-object-key` template; `expressions.md` line 95 in the `has(k)` row), giving four surface forms for one defined concept. One use of "loom-side identifier" is intentionally distinct: `diagnostics.md` line 81 ("Named schemas, enums, and type aliases by their loom-side identifier") refers to the lexical identifier *shape* fixed by `lexical.md`, not the loom-side-name/wire-name pairing. That single occurrence should be retained.

The drift matters because the glossary entry is cited as the authority for the term ("See: [Schema Declarations]…") and because the synonym `identifier` invites readers to suspect a second concept exists — particularly in `diagnostics.md` line 256 where `loom-side name` and `loom-side identifier` appear two lines apart in the same registry table.

## Spec Documents

- `spec_topics/glossary.md` — "loom-side name vs. wire name" entry (read-only)
- `spec_topics/runtime-value-model.md` — Representation table; equality bullets; inbound/outbound translation passes (edited)
- `spec_topics/diagnostics.md` — `loom/parse/redundant-wire-name` row (Description + Message); `loom/runtime/missing-object-key` row (edited)
- `spec_topics/query.md` — String-interpolation rendering bullet on outbound translation (edited)
- `spec_topics/expressions.md` — `has(k)` row in the built-in functions table (edited)
- `spec_topics/lexical.md` — Identifier-shape rules (read-only; cited as the rationale for retaining "loom-side identifier" at `diagnostics.md` line 81)
- `spec_topics/schemas.md` — `by <field>` discussion using "loom-side name" (read-only; reference exemplar)

## Plan Impact

**Phases:** Vertical V11, Vertical V13

**Leaves (implementation order):**

- V11d — Explicit `by <field>` form — (modified) — *Adds* says "Resolves to loom-side identifier"; *Tests* says "loom-side name accepted". Align both on `loom-side name`.
- V13b — Inbound wire-name translation — (modified) — *Adds* and *Ships when* both reference "loom-side identifiers"; align on `loom-side names`.
- V13c — Outbound wire-name translation — (modified) — Uses "loom-side value"; safe as-is, but the surrounding *Adds* should not reintroduce "identifier" when reworded.
- V13d — Discriminator detection on wire names — (modified) — Already uses "loom-side name"; keep, and ensure consistent with the renamed V11d/V13b text.

## Consequence

**Severity:** advisory

A reader of the diagnostic registry will encounter two terms (`loom-side name`, `loom-side identifier`) within adjacent rows for the same concept and reasonably ask whether the registry is distinguishing them. The diagnostic *message template* itself shipping with the inconsistent term means the runtime will emit text that contradicts its own glossary, which is awkward but not behavior-altering. Implementers writing the value-model walk and the AJV translation map will not produce divergent code, but tests asserting message strings (V18s diagnostic-code gate; V13a redundant-rename test) will lock in whichever phrasing is current at implementation time, making post-hoc renames a multi-leaf edit.

## Solution Space

**Shape:** single

### Recommendation

Standardize on the glossary canonical **`loom-side name`** (plural `loom-side names`) wherever the concept refers to the schema-field-declaration name paired with a wire name. Apply to:

1. `runtime-value-model.md` lines 12, 22, 28 — replace `loom-side identifier(s)` with `loom-side name(s)`.
2. `query.md` line 164 — replace `loom-side identifiers` with `loom-side names`.
3. `diagnostics.md` line 255 — both columns: change `loom-side identifier` to `loom-side name` in the Description sentence; rewrite the Message template to `redundant 'as' clause: wire name '<name>' equals the loom-side name`.
4. `diagnostics.md` line 339 and `expressions.md` line 95 — change `loom-side field name` to `loom-side name` (the "field" qualifier is redundant given the glossary definition already scopes the term to schema fields).

Retain the existing phrasing in two places:

- `diagnostics.md` line 81 ("Named schemas, enums, and type aliases by their loom-side identifier") — here `identifier` denotes the *lexical* identifier shape per `lexical.md`, not the wire-name pairing. The trailing parenthetical ("the identifier shape is fixed by [Lexical — Identifiers]") is what disambiguates; leave as-is.
- `runtime-value-model.md` line 31 (`loom-side-named`) — hyphenated adjectival form derived from the canonical noun; consistent and may stay.

Update plan leaves V11d, V13b, V13c, V13d to use `loom-side name(s)` in their *Adds* / *Tests* / *Ships when* prose so that diagnostic-message-string tests (V13a redundant-rename, V18s diagnostic-code gate) pin the canonical form.

Edge case for the implementer: the `loom/parse/redundant-wire-name` Message template change is a wire-visible diagnostic surface. If any test fixture or golden-output file already exists, it must change in lock-step. Grep for the literal string `equals the loom-side identifier` before merging.

## Relationships

None

---

# T02 — Object-value echo rendering: single-field case undefined

**Original heading:** Object value echo rendering for single-field schemas unspecified
**Original section:** spec_topics/binder.md
**Kind:** testability
**Importance:** medium

## Finding

The `bind_echo` echo-policy format rule for object values reads: *"Object values shown as `{first-field-value, …}` — just the first field's value as a hint."* The two normative reference renderings supplied in the table beneath the rule both describe two-field objects (`Cat { name, color }` → `{Whiskers, …}`; `Pet::Cat { kind, name }` → `{cat, …}`). No example or explicit clause covers an object whose declared schema has exactly one field — the case where the `…` token would, on the elision reading, signal nothing elided.

Two readings of the rule survive equally well from the prose:

1. The literal-format reading: `{<first-field-value>, …}` is the fixed shape; the `, …` is part of the format and is rendered for every object value, single-field or not. Under this reading `Cat { name: "Whiskers" }` renders as `{Whiskers, …}`. The wording *"first field's value as a hint"* and the contrast with the array rule (which carries an explicit `…+N more` count and an empty-array form `[]`) both lean this way: object echo never enumerates the dropped fields, so there is nothing for the marker to count and no reason for it to disappear when the count happens to be zero.
2. The elision-marker reading: `…` is an indicator that fields were elided, by analogy with the array rule's count-bearing marker. Under this reading a single-field object renders as `{Whiskers}` and the marker disappears whenever the count of remaining fields is zero.

Both readings are defensible from the current text, neither is contradicted, and the V16i conformance leaf — which already enumerates one assertion per echo format rule — has no input to disambiguate.

## Spec Documents

- `spec_topics/binder.md` — Echo policy → Format rules and Reference renderings table (edited)

## Plan Impact

**Phases:** V16 — Slash-command argument binder (LLM path)

**Leaves (implementation order):**

- V16i — `bind_echo` formatter — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on the single-field rendering (`{val}` vs `{val, …}`) because both can be argued from the current text. The `bind_echo` echo is a user-facing system note appended verbatim before every loom run, and the V16i test suite already asserts rule 4 against synthetic params/args pairs. Without a normative tiebreak the conformance suite cannot pin this case at all, and any author whose params block declares a single-field nested object will see the rendering shape decided by whichever interpretation the implementer happened to take.

## Solution Space

**Shape:** single

### Recommendation

Pin the literal-format reading: the `, …` token is part of the fixed object-value format and MUST be rendered regardless of how many fields the declaring schema (or discriminated-union variant) has.

Add to the Format-rules bullet for object values, after the existing "first field's value as a hint" sentence:

> The trailing `, …` is part of the format and MUST be rendered for every object value, including objects whose declaring schema (or discriminated-union variant) declares exactly one field; the marker is fixed text, not an elided-field indicator (contrast with the array rule's count-bearing `…+N more`).

Add a third row to the Reference renderings table immediately after the two existing object rows:

| Value | Rendering |
| --- | --- |
| `Cat { name: "Whiskers" }` (schema declares only `name`) | `{Whiskers, …}` |

Edge cases the V16i test author must cover:

- Single-field plain object (the new reference row).
- Single-variant discriminated union whose variant declares exactly one field — same rule applies; `…` is still emitted.
- Single-field variant whose only declared field is the discriminator — `…` still emitted.
- Empty-object value: not reachable through the schema subset (objects must declare at least one field per `schema-subset.md`); the rule need not address it, but the test should assert that the V16i formatter is never called with one and panics or short-circuits if it is.

## Relationships

- T03 "Parameters block: indentation and per-field token order are not normative" — same-cluster (sibling testability gap in the same binder rendering surface; resolved independently)
- T15 "Compact-transcript format for the session-context block is unspecified" — same-cluster (third testability gap in binder rendering; resolved independently)
- T04 "Placeholder rendering exemption is open-ended; affected registry rows are not enumerated" — same-cluster (testability gap in a different rendering surface; resolved independently)

---

# T03 — Parameters block: indentation and per-field token order are not normative

**Original heading:** Parameters block: "indented" undefined; token ordering not mandated normatively
**Original section:** spec_topics/binder.md
**Kind:** testability
**Importance:** medium

## Finding

`spec_topics/binder.md` § *System-prompt structure (normative)*, item 4 ("Parameters block"), specifies that when `params:` declares ≥1 field the prompt MUST contain a header line `Parameters:` followed by **"one indented line per declared field, in declaration order"**, and that each per-field line MUST contain (a) the field's wire name, (b) its declared type, (c) the token `required` or `default=<literal>`, and (d) when `description:` is non-empty, that description. The illustrative fenced example renders these as `  language (string) required — the language being reviewed` (two-space indent; `name (type) requirement [— description]` order), but the prose immediately above that block disclaims it as non-normative ("an alternative renderer that satisfies every obligation in the structure list is equally conformant").

Two distinct conformance gaps result:

1. **Indentation is unspecified.** "Indented" names no character (space vs. tab), no count (one space vs. two vs. four), and no leading-whitespace exclusion. A renderer using `\t` or a single space satisfies the literal text. A test asserting `^  <wire-name>` (the only assertion the example would support) is asserting an explicitly non-normative property.

2. **Per-field token order is unspecified.** The "(a) … (b) … (c)" enumeration in item 4 lists *what* must appear on the line; it does not say "in this order". A renderer that emits `required language (string)` or `(string) required language — desc` satisfies item 4's "MUST contain" obligations as written. Two implementers can produce different orderings — and the binder model receives differently-shaped prompts — without either being non-conformant.

The header line `Parameters:` itself is fixed; the omission rule when `params:` is empty is fixed; declaration order across lines is fixed. Only the *intra-line* shape of each field row is underspecified.

## Spec Documents

- `spec_topics/binder.md` — *System-prompt structure (normative)*, item 4 (Parameters block) (edited)
- `spec_topics/binder.md` — *Binder system prompt* (illustrative example block above the structure list) (read-only — example becomes a normative reference under the recommendation)

## Plan Impact

**Phases:** Vertical V16

**Leaves (implementation order):**

- V16f — `bind_context: none` — (modified)

V16f is the only plan leaf that owns binder system-prompt rendering and tests the *System-prompt structure (normative)* list (it already cites item 8 by number). Pinning indentation and per-field token order extends the per-item assertions V16f's test suite must carry; the feature scope is unchanged. No other V16 leaf renders the Parameters block: V16g extends the same prompt with the session-context block but does not rewrite the parameter table; V16o/V16n/V16h/V16e/V16k–m operate on envelopes, retries, models, echo, and failure modes, none of which touch the system-prompt structure list.

## Consequence

**Severity:** correctness

A spec-conformant renderer can emit `\tlanguage (string) required` while another emits `  required language (string)`; both pass the current obligations. Conformance tests cannot assert byte-exact prompt content for the Parameters block, and binder-model A/B comparisons across implementations will see different prompt shapes attributable to spec ambiguity rather than implementer choice. The binder is an LLM and tolerates surface variation in practice, so live behaviour is unlikely to diverge dramatically — but the spec's *System-prompt structure (normative)* heading promises a contract that this item does not deliver.

## Solution Space

**Shape:** single

### Recommendation

Amend item 4 to pin both indentation and per-field token order:

- **Indentation.** Add: "Each per-field line MUST be indented with exactly two U+0020 SPACE characters and MUST contain no other leading whitespace (no tabs, no additional spaces)."
- **Per-field grammar.** Replace the "(a) … (b) … (c) …" enumeration with a normative template:

  ```
  <wire-name> (<type>) <requirement>[ — <description>]
  ```

  where `<wire-name>` is the field's wire name; `<type>` is rendered per *Type display*; `<requirement>` is exactly one of the literal tokens `required` or `default=<literal>` (with `<literal>` rendered per *Default-literal rendering*); and the `— <description>` segment is appended (with the literal U+0020 U+2014 U+0020 separator) iff the field's `description:` is non-empty after the *Descriptions* normalisation, otherwise omitted entirely.

- **Status of the existing fenced example.** Promote the example block's parameter rows to normative reference renderings (the same pattern *Type display* and *Default-literal rendering* already use elsewhere in this section), so the example is a conformance fixture rather than illustration.

Edge cases the implementer must watch:

- The em-dash separator is U+2014 (not a hyphen-minus and not U+2013); the surrounding spaces are U+0020 (not U+00A0).
- When `description:` is empty after normalisation, the trailing separator is omitted *with* its leading space — the line ends after `<requirement>`, with no trailing whitespace.
- The two-space indent applies only to per-field lines; the `Parameters:` header line itself is unindented.
- V16f's test suite must add per-field assertions covering: indentation byte sequence (`/^  /` and not `/^\t/` or `/^   /`), token-order regex anchored on `<wire-name> \(<type>\) (required|default=…)(?: — .+)?$`, and the description-omitted form.

## Relationships

- T15 "Compact-transcript format for the session-context block is unspecified" — same-cluster (sibling item in the same *System-prompt structure (normative)* list — item 6 — with an analogous "header is normative, body shape is not" gap; resolves independently with its own format pinning)
- T02 "Object-value echo rendering: single-field case undefined" — same-cluster (different rendering surface — *Echo policy* rather than *System-prompt structure* — but the same testability lens)

---

# T04 — Placeholder rendering exemption is open-ended; affected registry rows are not enumerated

**Original heading:** Placeholder rendering exemption open-ended: affected registry rows not annotated
**Original section:** spec_topics/diagnostics.md
**Kind:** testability
**Importance:** medium

## Finding

`spec_topics/diagnostics.md` rule 4 declares the *Message* column normative and requires renderers to "emit it character-for-character with placeholders interpolated." The "Placeholder rendering (normative)" subsection then names six closed placeholder categories and pins one byte-identical rendering rule per category. A trailing **V1.0 scope** paragraph (line 69) carves out an exemption: "Registry rows whose `Message` template uses placeholder names outside the six categories carry no byte-identical rendering rule … tests asserting on those messages MUST treat the unenumerated portion as implementation-defined."

The exemption is open-ended. No row in the registry is annotated as falling under it, and the spec offers no procedure for deriving the affected set from the templates. A grep over the 137 registry rows turns up at least the following placeholders in *Message* templates that are not in any of the six categories: `<callee>`, `<cap>`, `<capability>`, `<dotted-key>`, `<enum>`, `<error>`, `<fields>`, `<higher>`, `<invocation-id>`, `<kind>`, `<list>`, `<lower>`, `<message>`, `<method>`, `<model>`, `<ms>`, `<name1>`, `<name2>`, `<observed>`, `<op>`, `<path-a>`, `<path-b>`, `<paths>`, `<provider>`, `<reason>`, `<root>`, `<schema>`, `<slash-name>`, `<slug>`, `<source>`, `<uuid>`. The cited example `loom/load/discovery-slow` uses both `<root>` and `<cap>`; neither is categorised, neither is annotated.

A test author reading the registry cannot tell which rows they are entitled to assert on byte-for-byte and which require a relaxed match against an "implementation-defined" tail. Two conformant implementations may diverge on every placeholder above without violating any stated rule, but a conformance suite that asserted equality against the registry's literal *Message* string would also be conformant under rule 4. The two postures are mutually exclusive yet both currently authorised.

## Spec Documents

- `spec_topics/diagnostics.md` — Placeholder rendering (normative); Code registry (edited)
- `spec_topics/discovery.md` — Package discovery (read-only — confirms `<cap>` ranges over a small closed set and `<root>` is host-supplied path data)
- `spec_topics/governance.md` — GOV-7 / GOV-8 closure rules cited by the exemption (read-only)

## Plan Impact

**Phases:** Horizontal (H3), Vertical (V18)

**Leaves (implementation order):**

- H3 — Diagnostics primitive and multi-error accumulator — (modified — its serialiser turns the registry *Message* templates into the line-format `content`; its tests assert on rendered output and need to know which strings are byte-deterministic vs. tail-implementation-defined)
- V18s — Coverage-matrix closing CI gate — (modified — gate (2) "Diagnostic-code registry closing gate" already greps the registry's code column; the same parser must widen to detect the new `Rendering` column or a row-marker so the gate can enforce the closure)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one writes test vectors that assert each registry *Message* literally, citing rule 4; the other writes loose matchers that ignore tails containing `<root>`, `<error>`, or `<reason>`, citing the V1.0 scope exemption. Both can be conformant under the current text. The conformance suite cannot be authoritative because the surface it must assert on is undefined.

## Solution Space

**Shape:** single

### Recommendation

Apply a hybrid posture: categorise every placeholder the runtime can deterministically render and explicitly annotate the residue that genuinely passes through host-supplied freeform text.

1. **Extend §§1–6 (or open §7) to cover the deterministic placeholders.** Most currently-uncategorised placeholders are deterministic — `<cap>` is one of two enum values, `<reason>` is the closed `session_shutdown` set, `<provider>`/`<model>`/`<slash-name>` are identifier-shaped registry keys, `<root>`/`<paths>`/`<path-a>`/`<path-b>`/`<source>` are source-derived path text already covered by category 5's rule, `<ms>` is a category 4 integer, `<callee>`/`<capability>`/`<invocation-id>`/`<uuid>`/`<dotted-key>`/`<kind>`/`<op>`/`<slug>` are identifier-shaped or come from closed enums. Fold them into the existing categories with one-line rendering rules.

2. **Add a `Rendering` column (or a dedicated row marker) to the registry table.** Default value is `byte-identical`. Rows whose template uses a placeholder that cannot be rendered deterministically (Pi transport error text via `<error>` / `<message>`, AJV-formatted schema-validation output via `<schema>` / `<fields>` / `<list>` when used to inline AJV output, raw rejection reasons via `<higher>` / `<lower>` / `<name1>` / `<name2>` if they carry host-shaped content) carry `implementation-defined-tail`, with the specific placeholder names listed inline so tests can construct partial-match patterns.

3. **Rewrite the V1.0 scope exemption paragraph** to reference the column instead of describing an open-ended set; the exempt set becomes machine-readable and the V18s registry-parser can enumerate it.

Edge cases the implementer must watch:

- `<error.message>`, `<original content first line>`, `<dispose error first line>` are already in category 6 and have a defined truncation rule; do not re-categorise them.
- `<schema>` appears in at least one registry row as an inlined schema fragment; decide once whether it renders as the loom-side schema name (deterministic — category 5) or as a serialised JSON-Schema fragment (host-derived — annotated).
- The V18s closing gate currently parses only the code column. The gate must be extended to assert that every row carries a value from the closed set `{byte-identical, implementation-defined-tail}` and that no row tagged `byte-identical` references a placeholder outside the (now-extended) six categories.
- GOV-7 / GOV-8 closure posture must extend to the new `Rendering` column: changing a row from `byte-identical` to `implementation-defined-tail` (or vice versa) is a spec-versioned breaking change.

## Relationships

- T06 "`loom/runtime/*` namespace summary mis-describes the namespace as panics-only" — same-cluster (both touch `diagnostics.md` registry-section accuracy; resolve independently)
