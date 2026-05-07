# Triaged Spec Review — spec.md

_Generated: 2026-05-07T13:35:00Z_
_Spec: spec.md_
_Process: bottom-up — the last finding (T21) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 2 high, 11 medium retained; 23 low discarded; 0 low findings merged into 0 medium findings; 19 nit dropped; 0 false dropped (13 false positives were filtered upstream by the enricher)._

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

---

# T05 — `tool_loop.max_iterations` is named for the wrong unit (rounds, not iterations)

**Original heading:** `max_iterations` field counts "rounds" not "iterations"
**Original section:** spec_topics/ — Naming inconsistencies (multiple files)
**Kind:** naming
**Importance:** medium

## Finding

The frontmatter cap on the model's tool-call loop is exposed as `tool_loop.max_iterations`, but every normative description of what it counts uses a different unit. `spec_topics/frontmatter.md` defines it as "a non-negative integer counting tool-call *rounds*, not individual tool calls," then has to spend a clause defining what "round" means (model emits ≥1 `tool_use` blocks → runtime executes them all → results returned). `spec_topics/query.md`, `spec_topics/implementation-notes.md`, and the V6k / V13f plan leaves all repeat the same "counts rounds, not tool calls" disclaimer. The disclaimer is necessary precisely because the field name asserts the opposite.

The same mis-naming propagates to the failure surface: `ToolLoopExhaustedError` carries an `iterations: number` field whose documented value is `tool_loop.max_iterations` on exhaustion — i.e. a round count surfaced under a name that authors will read as a tool-call count. With parallel tool-use a single round may cover several tool calls, so the field name is not just stylistically off but observationally misleading: an author who interprets `iterations: 25` as "the model called tools 25 times" can be wrong by a wide margin.

The whole `tool_loop` block is pre-V1 with no installed user base; the field name is editable at the same cost as any other spec edit.

## Spec Documents

- `spec_topics/frontmatter.md` — `tool_loop` field-contract row, `tool_loop` prose bullet, frontmatter YAML example, naming-convention paragraph (edited)
- `spec_topics/query.md` — Tool-call loop bound section, forced-respond-turn paragraph (edited)
- `spec_topics/errors-and-results.md` — `ToolLoopExhaustedError` schema (`iterations: number` field) (edited)
- `spec_topics/diagnostics.md` — `loom/load/frontmatter-value-out-of-range` description row (edited)
- `spec_topics/implementation-notes.md` — tool-loop enforcement bullet citing the field name in the `Err` payload (edited)
- `spec_topics/future-considerations.md` — `looms.toolLoopMaxIterations` deferred settings key (edited)
- `spec.md` — Hard ceiling #2 (`tool_loop.max_iterations` per query) (edited)
- `plan_topics/v6-typed-queries.md` — V6k leaf (read-only; no spec-text edits, but field-name references will need to follow)
- `plan_topics/v13-wire-names.md` — V13f leaf (read-only; same)

## Plan Impact

**Phases:** V6, V13

**Leaves (implementation order):**

- V6k — `tool_loop` cap enforcement and `ToolLoopExhaustedError` — (modified)
- V13f — `respond_repair:` and `tool_loop:` frontmatter parsing — (modified)

## Consequence

**Severity:** advisory

The cap still works under either name and implementations will agree on its semantics (the prose is unambiguous). The cost is paid by every author who reads `max_iterations: 25` and assumes it bounds tool-call count, and by every reader of `ToolLoopExhaustedError.iterations` who reads "iterations: 25" as "25 tool calls." With parallel tool-use widely supported by V1 providers, the gap between rounds and tool calls can be a small integer multiplier — large enough to mis-size budgets in real usage.

## Solution Space

**Shape:** single

### Recommendation

Rename `tool_loop.max_iterations` → `tool_loop.max_rounds`; rename `ToolLoopExhaustedError.iterations` → `ToolLoopExhaustedError.rounds`; rename the deferred `looms.toolLoopMaxIterations` settings key in `future-considerations.md` → `looms.toolLoopMaxRounds`. Drop the "counting *rounds*, not individual tool calls" disclaimer at every site where it currently appears (`frontmatter.md`, `query.md`, `implementation-notes.md`, V6k, V13f) — the name now carries that meaning.

This is pre-V1 spec with no installed users; the field name is the cheapest editable surface in the system, and the spec already standardises on "round" as the unit-of-counting noun in every adjacent paragraph. Renaming both the frontmatter field and the error payload removes the disclaimer permanently and makes `iterations: 25` (now `rounds: 25`) mean what it says.

Edge cases the implementer must watch:

- V6k's test names ("`max_iterations: 25` and 24 free-phase rounds") and `loom/load/frontmatter-value-out-of-range`'s "currently `tool_loop.max_iterations` and `respond_repair.attempts`" enumeration in `diagnostics.md` both spell the field name in prose and must be updated in the same pass.
- The pin in `errors-and-results.md` (`iterations: number`) is observable wire surface, so any V1 implementation sketch already committing to the field name must follow.

## Relationships

None

---

# T06 — `loom/runtime/*` namespace summary mis-describes the namespace as panics-only

**Original heading:** `loom/runtime/*` namespace description overstates — contains non-panic codes
**Original section:** spec_topics/ — Naming inconsistencies (multiple files)
**Kind:** naming
**Importance:** medium

## Finding

The namespace overview in `spec_topics/diagnostics.md` line 46 reads:

> `loom/runtime/*` — runtime errors surfaced as panics (`MatchError`, index out of bounds, etc.) reported back to Pi as system notes.

This description is wrong about its own namespace. The `loom/runtime/*` registry table further down the same page (starting at line 329, under the heading `### loom/runtime/* — runtime panics, runtime-defect surface, and delivery failures`) contains six panic codes plus *eleven* non-panic codes covering at least three other categories:

- **Runtime-defect surface** — `loom/runtime/internal-error` (explicitly carved out as "outside the closed V1 panic-source list").
- **Delivery / fallback failures** — `loom/runtime/system-note-delivery-failed`, `loom/runtime/active-set-restore-failed`, `loom/runtime/subagent-dispose-failure`, `loom/runtime/registration-cache-collision`.
- **Lifecycle / teardown events** — `loom/runtime/registry-swap-failed`, `loom/runtime/cancelled-by-session-shutdown`, `loom/runtime/reload-teardown-timeout` (the last is explicitly routed through `console.error`, not via the system-note channel, per the carve-out at line 5).

The three-bullet namespace summary at lines 44–46 is the natural index a reader uses to decide which namespace a new code belongs in, and it is the only place on the page that pretends to characterise the namespace as a whole. The detailed section header at line 329 already gets the wording right; only the index summary is wrong.

## Spec Documents

- `spec_topics/diagnostics.md` — namespace summary bullet at line 46 (edited)
- `spec_topics/diagnostics.md` — `### loom/runtime/* — …` registry section at line 329 (read-only; reference for correct phrasing)
- `spec_topics/errors-and-results.md` — Runtime panics section, referenced by both the index and the registry rows (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The fix is a single line of orientation prose; no leaf's acceptance criteria depend on the wording of the namespace summary. `H3` and `V18` leaves consume the registry table directly, not the index bullet.

## Consequence

**Severity:** advisory

A reader who skims the namespace summary may assume every `loom/runtime/*` code routes to the panic surface (system note for top-level looms; `Err(QueryError { kind: "invoke_failure", cause: "panic", … })` to an `invoke` parent). That assumption is wrong for over half the namespace and could lead an implementer to mis-route delivery-failure or lifecycle codes — though the per-row `Trigger` and `Spec rule` columns plus `errors-and-results.md` correct the misreading on first contact with any specific code.

## Solution Space

**Shape:** single

### Recommendation

Replace the line-46 bullet with wording aligned to the section header at line 329:

> - `loom/runtime/*` — runtime-phase events: execution panics (`MatchError`, index out of bounds, etc.), the runtime-defect surface (`loom/runtime/internal-error`), and delivery / lifecycle / teardown failures. Routing varies per code — see the [`loom/runtime/*` registry section](#loomruntime--runtime-panics-runtime-defect-surface-and-delivery-failures) and [Errors and Results — Runtime panics](./errors-and-results.md) for per-code channels (most route through `loom-system-note`; `loom/runtime/reload-teardown-timeout` routes through `console.error`).

Edge cases the editor must watch:

- Verify the anchor slug used in the cross-link matches whatever slug Markdown rendering produces for the line-329 heading; if the rendering pipeline normalises punctuation differently, prefer adding an explicit `<a id="loom-runtime-namespace">` anchor at line 329 and link to that.
- Keep the parenthetical `console.error` carve-out for `reload-teardown-timeout` consistent with the existing carve-out paragraph at line 5; do not introduce a third phrasing.
- Do not enumerate every non-panic code in the index — that would duplicate the registry. Three category labels (panics / defect / delivery-and-lifecycle) is the right granularity.

## Relationships

- T04 "Placeholder rendering exemption is open-ended; affected registry rows are not enumerated" — same-cluster (both touch `diagnostics.md` registry-section accuracy; resolve independently)

---

# T07 — SDK version pin in `spec.md` reads as an unfilled template

**Original heading:** SDK version pin `~X.Y.Z` is a placeholder; no concrete version stated
**Original section:** spec.md — Orientation > Prerequisites: Pi SDK and capabilities
**Kind:** completeness, implementability, assumptions
**Importance:** medium

## Finding

The Prerequisites paragraph states that `pi-agent-core`, `pi-ai`, and `pi-tui` are pinned in `peerDependencies` "at the same `~X.Y.Z` minor-version line as `pi-coding-agent`." The `~X.Y.Z` token is *meant* to be read as a meta-syntactic stand-in ("whichever tilde minor-line `pi-coding-agent` happens to be on"), but it is typeset as if it were a literal SemVer range — same backticks, same shape as `~0.72.1` — which an implementer reading `spec.md` cold cannot distinguish from an unfilled drafting placeholder. The actual literal is `~0.72.1` (carried in `package.json`, `pi-integration-contract.md`'s preamble, and Host prerequisites — Pi SDK pin), but `spec.md` never resolves the token and never gestures that resolution is deferred.

There is also a three-way inconsistency about *whether* `spec.md` should carry the literal at all. PIC item 1 (Host prerequisites — Pi SDK pin) asserts that `spec.md` "references this pin **by location** rather than restating the literal value." The H1 plan leaf's `peerDependencies` literal-read test asserts the opposite: "The literal `~0.72.1` value is anchored in `pi-integration-contract.md` … and in `spec.md` under **Orientation — Prerequisites — Pi SDK and capabilities**; a Pi minor bump that moves the four-package lock-step must update all sites in one edit." Today neither contract is satisfied: `spec.md` neither restates the literal (failing H1's expectation) nor obviously defers to PIC (failing PIC's "by location" framing). The placeholder masks the contradiction.

The Pi version bump procedure (`pi-integration-contract.md` step 4) names the sites that move together when the pin changes; if `spec.md` is intended to be one of them, the literal must appear there. If it is not, the placeholder syntax should be replaced with prose that does not look like an unsubstituted variable.

## Spec Documents

- `spec.md` — Orientation > Prerequisites > Pi SDK and capabilities (edited — placeholder rewritten as explicit deferral to PIC)
- `spec_topics/pi-integration-contract.md` — Host prerequisites — Pi SDK pin (read-only — the existing "references this pin by location rather than restating the literal value" clause becomes accurate once `spec.md` is rewritten)
- `package.json` — `peerDependencies` block (read-only — already carries `~0.72.1`)
- `plan_topics/h1-scaffold.md` — `peerDependencies` literal-read test description (edited — drop `spec.md` from the literal-anchor list)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

The H1 `peerDependencies` literal-read test currently enumerates `spec.md` as one of the literal-anchor sites a Pi minor bump must update. The test description must drop `spec.md` from that anchor list; the four remaining sites are `package.json`, `pi-integration-contract.md` preamble, `pi-integration-contract.md` Host prerequisites — Pi SDK pin, and the H1 test's own constant.

## Consequence

**Severity:** correctness

A first-time implementer reading `spec.md` cannot determine the actual peer-dep range without leaving the page (the placeholder is indistinguishable from a fill-me-in marker). Two reviewers reading the spec, PIC, and H1 plan leaf together will disagree on whether `spec.md` should carry the literal — the documents currently make incompatible claims. The Pi version bump procedure presupposes a settled answer; today there isn't one.

## Solution Space

**Shape:** single

### Recommendation

Honour PIC's "by location, not literal" rule: rewrite the `spec.md` sentence so the deferral to PIC is explicit and no version-range syntax appears in `spec.md`, then drop `spec.md` from the H1 literal-anchor list so the test description matches reality. This minimises the literal-anchor count, leaves the Pi version bump procedure unchanged, and removes the placeholder that today reads as an unfilled drafting marker.

**Spec edits.**

- `spec.md` Prerequisites paragraph: `at the same \`~X.Y.Z\` minor-version line as \`pi-coding-agent\`` → `at the same tilde-pinned minor-version line as \`pi-coding-agent\` (the literal range is owned by [Pi Integration Contract — Host prerequisites — Pi SDK pin](./spec_topics/pi-integration-contract.md))`.
- `pi-integration-contract.md`: no normative change; the existing "references this pin by location rather than restating the literal value" clause is now accurate as written.
- `plan_topics/h1-scaffold.md` `peerDependencies` literal-read test description: remove `spec.md` from the literal-anchor list; the four sites become `package.json`, `pi-integration-contract.md` preamble, `pi-integration-contract.md` Host prerequisites — Pi SDK pin, and the H1 test's own constant.

All three edits must land in the same commit so the `spec.md` deferral, the PIC "by location" sentence, and the H1 test description agree. The implementer should also confirm the `spec.md` link target resolves to the intended PIC heading anchor (this finding's editorial fix; cross-cutting anchor-resolution concerns are tracked elsewhere in this review).

## Relationships

None

---

# T08 — `loomAbort` ↔ `ctx.signal` linkage: spec.md hand-waves the wiring and reason-propagation is unpinned

**Original heading:** `loomAbort` ↔ `ctx.signal` linkage mechanism not specified
**Original section:** spec.md — Orientation > Prerequisites: Session model
**Kind:** assumptions, implementability
**Importance:** medium

## Finding

The Orientation paragraph in `spec.md` says only "the runtime forwards Pi's per-handler `ctx.signal` … into `loomAbort` rather than using `ctx.signal` directly," and links to `./spec_topics/pi-integration-contract.md` (with no `#cancellation-source` fragment) under the label "Cancellation source." The forward link drops the reader on the file's top, not on the owning paragraph; nothing in `spec.md` itself names the per-entry-point linkage shape or distinguishes the slash-command path from the tool-exposed and `invoke` paths.

The owning topic pages do specify the per-entry-point wiring functionally — `cancellation.md` describes (a) Pi-event-handler observation of `ctx.signal.aborted` inside `tool_call`/`tool_result`/`message_update`/`turn_end`/`agent_end` for the slash-command entry, (b) "a one-shot listener registered at entry" on the tool-exposed entry's `signal` parameter, and (c) "a derived controller that aborts when the parent's signal aborts but not vice versa" for `invoke`. PIC's `#cancellation-source` repeats the same per-entry shape. PIC's Step 0 (b) capability table inventories both `AbortSignal.any` and `AbortSignal.prototype.addEventListener`, so the inventoried-member set covers either implementation choice. The originally-flagged worry that the linkage might rest on an unprobed dependency does not hold.

What does remain genuinely under-specified is **abort-reason propagation across the linkage**. `AbortSignal.prototype.reason` sits in the probe inventory, implying reason carries observable weight, but no spec text states whether `loomAbort.signal.reason` reflects `ctx.signal.reason` (or the tool-exposed `signal.reason`, or the parent-`invoke` signal's `reason`) or instead carries a default `AbortError`. The choice flips with the wiring: `AbortSignal.any([source])` produces a derived signal whose `reason` is the source's `reason`; a manual `addEventListener` callback that calls `loomAbort.abort()` with no argument loses the source reason; calling `loomAbort.abort(source.reason)` preserves it. Two implementers reading `cancellation.md` and PIC together can pick conformant wiring that produces materially different `loomAbort.signal.reason` values. The downstream `QueryError { kind: "cancelled", message: "..." }` shape does not currently consume the reason, so the divergence is invisible today; once any future surface (a system note, a `cancelled-by-session-shutdown` `details` field, a test-harness assertion) reads the reason, the gap surfaces as observable drift.

A secondary issue is purely editorial: the spec.md sentence's link label says "Cancellation source" but the URL is anchorless, so even an attentive reader follows it to the wrong place. That is a special case of the cross-cutting anchor-resolution finding elsewhere in this review, but the local fix is cheap and worth doing in the same edit.

## Spec Documents

- `spec.md` — Orientation > Prerequisites > Session model paragraph (edited)
- `spec_topics/cancellation.md` — Signal source / Forwarding into `loomAbort` (edited)
- `spec_topics/pi-integration-contract.md` — Cancellation source (edited)
- `spec_topics/pi-integration-contract.md` — Step 0 (b) `AbortSignal` member table (read-only — verifies both `AbortSignal.any` and `AbortSignal.prototype.addEventListener` are inventoried)

## Plan Impact

**Phases:** MVP, H4, V18

**Leaves (implementation order):**

- Mb — MVP runtime + slash-command registration + per-invocation cancellation plumbing — (modified — the slash-command-path wiring lives here; reason-propagation assertion would land in its cancellation tests)
- H4 — Extension shell + `PiSubagentSpawner` one-shot `loomAbort.signal` listener — (modified — the subagent and tool-exposed listener wiring lives here; would assert reason-propagation behaviour for the `addEventListener` path)
- V18d — `AbortSignal` before every `invoke` (derived child signal) — (modified — the derived-controller mechanism for the `invoke` entry needs a reason-propagation assertion if the chosen wiring is `AbortSignal.any`)
- V18e — Cancellation propagates downward only — (modified — the parent → child propagation test would gain a reason-propagation assertion)

## Consequence

**Severity:** advisory

`spec.md`'s hand-wave is repaired by the per-entry-point text in `cancellation.md` and PIC, so a careful implementer can produce a working system. The reason-propagation gap does not break any currently-specified surface, but it leaves implementations free to diverge on `loomAbort.signal.reason` in ways no test would catch — a latent foot-gun if a later leaf consumes the reason (e.g. plumbing it into a `details` field on `loom/runtime/cancelled-by-session-shutdown`).

## Solution Space

**Shape:** single

### Recommendation

In `spec.md`'s Orientation paragraph, replace the bare `./spec_topics/pi-integration-contract.md` URL with `./spec_topics/pi-integration-contract.md#cancellation-source`, and reword the linkage sentence to defer the per-entry-point wiring to the topic without describing it twice — e.g. "the runtime forwards Pi's per-handler `ctx.signal` (and the tool-exposed `signal` parameter, and parent-`invoke` signals) into `loomAbort` per the per-entry-point rules in [Cancellation — Forwarding into `loomAbort`](./spec_topics/cancellation.md) and [Pi Integration Contract — Cancellation source](./spec_topics/pi-integration-contract.md#cancellation-source)." Make no further normative claim in `spec.md`.

In `cancellation.md` (or PIC `#cancellation-source`, whichever the editor judges authoritative), pin abort-reason propagation as one normative rule covering all three forwarding shapes: when forwarding fires, the runtime MUST call `loomAbort.abort(source.reason)` so that `loomAbort.signal.reason === source.signal.reason` (or `=== source.reason` for the case where the trigger is an `agent_end` event, where `source.reason` is the runtime-synthesised value the spec already implies). The `session_shutdown` carve-out in `cancellation.md` should state its own reason value explicitly — current text says "aborts every entry's `loomAbort`" without naming a reason, leaving the same gap on the teardown path.

Edge cases the implementer must watch:
- The slash-command path's `agent_end`-driven trigger has no source `AbortSignal` — there is no `reason` to forward, so the runtime synthesises one (e.g. an `Error("user cancelled turn")` or equivalent); the chosen value should be pinned, not left to implementation.
- `AbortSignal.any([source])` and manual `addEventListener` calling `loomAbort.abort(source.reason)` produce equivalent reason-propagation observable behaviour; either is conformant. The choice may be left to the implementation provided the observable rule above holds.
- The one-shot guard on `loomAbort.abort()` already documented in `cancellation.md` means a second forwarder firing after the first does not re-stamp the reason; the first source's reason wins. Tests that fire two sources concurrently must order their assertions accordingly.
- The `invoke` entry's "derived controller" wording is most naturally implemented with `AbortSignal.any([parent])`, but a manual derived-`AbortController` whose `abort()` is wired to the parent's `addEventListener("abort", …, { once: true })` is equally conformant under the rule above.

## Relationships

None

---

# T09 — "No invocation cap / event-loop-only ordering" normative claim has no owning page

**Original heading:** "No invocation cap / event-loop-only ordering" normative claim has no owning page
**Original section:** spec.md — Orientation > Prerequisites: Session model
**Kind:** prescription, traceability
**Importance:** medium

## Finding

The Session model paragraph in `spec.md` (lines 39, inside *Orientation > Prerequisites: Session model*) carries the sentence:

> V1 imposes **no maximum on the number of in-flight invocations** within a session and no fairness or scheduling rule beyond Pi's event-loop ordering.

This is a behaviourally observable, testable normative disposition: an implementer that imposed a cap, a queue, or a fairness scheduler would diverge from the spec. It is the only obligation in the Session model paragraph that lacks a forward-link — every other claim in that paragraph is anchored elsewhere (`session_shutdown` reason set → PIC `#session-shutdown-semantics`; abort-and-await → PIC `#session-shutdown-semantics`; per-invocation `AbortController` → `cancellation.md`; private subagent `AgentSession` → `implementation-notes.md` *Per-invocation single-threaded execution*; registry → PIC `#active-invocation-registry`; per-invocation budgets → `binder.md` / `frontmatter.md` / hard-ceilings; parent→child-only propagation → `cancellation.md`).

`spec_topics/governance.md` GOV-12 makes this an explicit defect: "[`spec.md`] is treated as informative orientation: every normative obligation it appears to state is owned by a topic page that `spec.md` forward-links to." The no-cap / event-loop-ordering rule has no such owner. PIC's `#active-invocation-registry` describes the registry as a `Set<{ loomAbort, disposeBarrier }>` but does not state that the set is uncapped or that scheduling reduces to event-loop ordering. `implementation-notes.md` *Per-invocation single-threaded execution* describes per-invocation isolation and notes that "Sibling invocations can interleave on the event loop" but does not assert the absence of a cap or of any fairness/scheduling layer above the event loop. No other topic page addresses concurrency caps or scheduling.

The result: a normative rule sits exclusively in an informative-orientation surface that disclaims normative ownership. Per GOV-12 the rule is unowned, uncitable from tests or from sibling pages, and unprotected against silent removal during a `spec.md` rewrite.

## Spec Documents

- `spec.md` — *Orientation > Prerequisites: Session model* (edited — drop or replace the unowned sentence with a forward-link)
- `spec_topics/implementation-notes.md` — *Per-invocation single-threaded execution* bullet (edited — gain the no-cap / event-loop-ordering rule as a normative sentence with an `<a id>`)
- `spec_topics/pi-integration-contract.md` — `#active-invocation-registry` (option-dependent — alternative home if the rule is co-located with the registry definition)
- `spec_topics/governance.md` — GOV-12 (read-only — the governance rule the defect violates)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The rule is a normative *absence* (no cap, no scheduler) that no V1 code implements; no leaf currently tests it and none would gain a test from re-anchoring the sentence. Adding the sentence to `implementation-notes.md` does not change any existing leaf's **Spec** field closure under GOV-11 because every leaf already in the V18 (cancellation/teardown) and V15 (invoke) slices that touches concurrent invocations either does not cite `implementation-notes.md` for this rule or cites it for unrelated bullets. The fix is editorial-internal to the spec corpus.

## Consequence

**Severity:** advisory

GOV-12 is silently violated: a behaviourally observable rule sits in an aggregator paragraph that disclaims normative ownership, with no topic page to cite from tests, plan leaves, or sibling spec pages. An implementer who adds an in-flight cap "for safety" or a fairness queue "to prevent starvation" would have no spec text to point to as authoritative refusal. A future `spec.md` rewrite that drops the sentence loses the rule entirely with no detectable trace because no other page asserts it.

## Solution Space

**Shape:** single

### Recommendation

Move the sentence to `spec_topics/implementation-notes.md` as a normative addition to the *Per-invocation single-threaded execution* bullet (or as a sibling bullet under the same heading), giving it a stable anchor. Replace the orientation sentence in `spec.md` with a forward-link of the same shape used by every other claim in the Session model paragraph.

Concretely:

1. In `implementation-notes.md`, extend the *Per-invocation single-threaded execution* bullet (which already establishes the surrounding concurrency model — sibling independence, event-loop interleaving, shared-validator-cache safety) with an anchored sentence such as:

   > <a id="no-invocation-cap"></a> V1 imposes no maximum on the number of in-flight loom invocations within an extension instance and no fairness or scheduling rule above Pi's event-loop ordering. The runtime MUST NOT introduce an admission cap, a priority queue, or any scheduler interposed between sibling invocations and the event loop; widening or narrowing this rule is a major-version concern.

   Place it adjacent to the existing "Sibling invocations can interleave on the event loop" sentence, which provides natural context.

2. In `spec.md`, replace the bare sentence with a forward-link of the canonical form used by adjacent claims:

   > V1 concurrency disposition for in-flight invocations — no admission cap, no scheduler interposed above Pi's event loop — is owned by [Implementation Notes — No invocation cap](./spec_topics/implementation-notes.md#no-invocation-cap).

`implementation-notes.md` is the correct home over PIC's `#active-invocation-registry` because the rule is a *runtime architecture* statement (the runtime imposes no scheduler, no admission control), not a Pi-SDK integration contract; the surrounding *Per-invocation single-threaded execution* bullet already owns the per-invocation/event-loop interleaving substrate the rule extends. PIC's registry section may add a one-line cross-reference if reviewers find the absence-of-cap surprising at the registry definition site, but the source of truth is `implementation-notes.md`.

Edge cases the implementer must watch:

- The rule constrains the **runtime** only. Pi's own session-level serialisation (the host already serialises slash-command turns within one user session in prompt mode; see PIC) is upstream of the runtime and remains in force; the no-cap rule does not promise that a single user can dispatch unbounded *user-visible* slash commands in parallel.
- The rule does not promise *resource* unboundedness — host-OOM still routes through `loom/runtime/internal-error` per the existing aggregator. The rule prohibits a runtime-imposed admission cap; it does not prohibit observable OOM-class failures from below.

## Relationships

None

---

# T10 — Post-probe SDK-shape drift has no stated routing or operator attribution

**Original heading:** Mid-session capability invalidation unaddressed
**Original section:** spec.md — Orientation > Prerequisites: Host runtime
**Kind:** error-model
**Importance:** medium

## Finding

The Step 0 capability probe (`spec_topics/pi-integration-contract.md#entry-capability-probe`) is single-shot at extension-factory entry. After it succeeds, the spec gives no general rule for what happens if a previously-probed Pi capability degrades or disappears later in the session: a member that was `typeof === "function"` at probe time stops being callable, returns the wrong shape, or starts throwing; `pi.setActiveTools` is replaced by an object with a different signature; the binder model handle resolved at load time is unregistered before the next binder call; `pi.sendUserMessage` rejects when the SDK contract says it returns `void`; an `AgentSession.sendUserMessage` call rejects with a transport error rather than yielding through the message stream; and so on.

For three specific surfaces, the spec does provide a dedicated code: `loom/runtime/active-set-restore-failed` (restore-side `pi.setActiveTools` throw), `loom/runtime/system-note-delivery-failed` (`pi.sendMessage` synchronous throw), and `loom/runtime/subagent-dispose-failure` (`AgentSession.dispose()` throw). The catch-all `loom/runtime/internal-error` row in `spec_topics/diagnostics.md` enumerates "a host-function `TypeError`, an internal invariant violation, an unanticipated SDK reject" as triggers and routes them through the panic surface. Read together, these cover the *throw* path for almost every host-drift scenario that an implementer would actually encounter.

What is still missing is (a) an explicit aggregator-level statement that post-probe capability drift routes through `loom/runtime/internal-error` (the `internal-error` row's example list does not name the snapshot-side `pi.setActiveTools` call, the per-invocation `pi.sendUserMessage` call, the post-load `ctx.modelRegistry` re-resolution, or any "previously probed but now wrong shape" case, and the spec nowhere says the runtime does not re-run the probe); (b) any operator-facing way to distinguish a host-drift failure from a genuine loom-runtime defect — both currently surface as the same `"loom /<name> aborted with internal error: <message>"` system note with the underlying error's `message`/`stack` in `hint`, leaving the operator no signal about which side of the seam to investigate; and (c) the silent-shape-drift sub-case (a member that no longer matches its probed shape but does not throw — e.g., `pi.setActiveTools` becoming a Promise-returning function the runtime forgets to `await`), which has no detection rule at all.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — Host prerequisites / Step 0 (Capability probe) / SDK capability inventory (edited)
- `spec_topics/pi-integration-contract.md` — Tool-registration lifetime and visibility (read-only under the recommendation)
- `spec_topics/pi-integration-contract.md` — Conversation drive (prompt mode and subagent mode) (read-only)
- `spec_topics/diagnostics.md` — `loom/runtime/internal-error` row (edited)
- `spec_topics/errors-and-results.md` — Runtime panics / runtime-defect surface (read-only)
- `spec_topics/binder.md` — Binder model resolution (read-only)
- `spec.md` — Orientation > Prerequisites: Host runtime (read-only — the orientation paragraph the finding cites stays a forward-link to PIC)

## Plan Impact

**Phases:** Horizontal H4, Vertical V14, Vertical V16, Vertical V18

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified: `withActiveTools` and `sendSystemNote` plumbing, plus the `PiSubagentSpawner`/`PiToolHost` shims, are the call sites that would carry the drift-routing rule)
- V14e — Pi tool wired into `@` queries as model-callable — (modified: prompt-mode `pi.setActiveTools` snapshot-side failure currently has no asserted routing; the leaf would gain a snapshot-side drift test paralleling its existing restore-side coverage)
- V16 (binder leaves under `plan_topics/v16-binder.md`) — (modified: post-load binder-model re-resolution needs a defined route when the cached `Model<Api>` handle has been invalidated between load and call)
- V18m — Panic routing: slash-command surface — (modified: add a new test case that synthesises a probed-capability post-call throw and confirms it lands on `internal-error`)
- V18n — Panic routing: `invoke` parent surface — (modified: same shape, on the `InvokeInfraError { cause: "internal_error" }` arm)

## Consequence

**Severity:** advisory

Without the explicit rule, two implementers will diverge on the silent-shape-drift case (one `await`s a function the probe said was sync, the other does not; one re-probes on each invocation, the other does not), and operators triaging an `"aborted with internal error"` note have no way to decide whether to file a Pi bug or a loom bug. Throw-side behavior is recoverable from the existing `internal-error` row, so nothing critical breaks; the gap shows up as inconsistent triage and as a quiet correctness hazard for the no-throw drift path.

## Solution Space

**Shape:** single

### Recommendation

Add one paragraph under PIC's Step 0 (or under the SDK capability inventory) stating: (i) the probe runs exactly once at factory entry and is not re-run; (ii) any post-probe call to a previously-probed Pi member that throws, rejects, or returns a value of the wrong shape is routed to `loom/runtime/internal-error` per the existing catch-all, except where a more specific code applies (cross-link the four existing dedicated codes — `active-set-restore-failed`, `system-note-delivery-failed`, `subagent-dispose-failure`, `registry-swap-failed`); (iii) silent-shape drift that does not throw is undefined behavior — the runtime is not required to detect it. Then extend the `internal-error` row in `diagnostics.md` to mention "post-probe SDK-shape drift" alongside the existing examples.

This is a documentation-only edit over an already-implemented routing rule. The runtime keeps its existing single catch-all wrap and the existing test scaffolding in V18m/V18n still applies. The operator-facing attribution gap (host-drift vs. loom-defect) is real but small enough to defer; if triage proves painful in practice after V1 ships, a `details.kind` discriminator on `loom/runtime/internal-error` is an additive registry-minor change that does not break any existing emission or routing.

Edge cases the implementer must watch:

- The binder-model handle is re-resolved per call (`spec_topics/binder.md` — "the resolved binder-model handle [is] constructed afresh on every binder call"); a mid-session unregistration therefore surfaces on the *next* binder call as a `ctx.modelRegistry.find` throw (or a falsy return). The catch-all wrap MUST cover this surface; it is not the binder transport-failure case (`binder.md`'s `Binder model transport failure` row), which fires after a successful resolution.
- The `pi.setActiveTools` snapshot-side call (the *first* `setActiveTools` of the swap) is not covered by `loom/runtime/active-set-restore-failed`; that code is restore-side only. A snapshot-side throw must route to `internal-error` and the swap must be aborted before the wrapped `fn` runs.
- `pi.sendUserMessage` returns `void` per the `ExtensionAPI` surface; a synchronous throw from it is the observable failure mode and routes to `internal-error`. The runtime MUST NOT `await` it (the `Promise<void>` shape exists only on `AgentSession.sendUserMessage` and `ReplacedSessionContext.sendUserMessage`).
- The probe's "single-shot" property must be stated in the same paragraph that introduces the post-probe drift rule, otherwise an implementer reading PIC top-to-bottom will reasonably guess that the runtime re-probes per invocation.

## Relationships

- T17 "Tool failure modes beyond `throw` / `isError: true` unspecified" — same-cluster (analogous error-model gap on a different host surface; resolves independently using the same routing-class taxonomy)
- T16 "Pre-evaluation setup failures: no routing rule for the slash, `invoke()`, or tool-call dispatch surfaces" — same-cluster (both extend `loom/runtime/internal-error`'s reach across boundaries the existing taxonomy does not name)

---

# T11 — `session_shutdown` fast-path: spec.md sentence implies a branching short-circuit that PIC does not authorise

**Original heading:** `session_shutdown` fast-path condition undefined; contradicts PIC Step 4; non-testable
**Original section:** spec.md — Orientation > Prerequisites: Session model
**Kind:** clarity, completeness, testability
**Importance:** medium

## Finding

The `*Session model.*` paragraph in `spec.md` Prerequisites says the `session_shutdown` handler "treats every reason identically and **may fast-path to a no-op when the underlying reason did not invalidate the extension runtime**." The italicised clause is the problem: it reads as permission for the implementer to take a separate, branching short-circuit code path keyed off `event.reason`, with the branch condition ("did not invalidate") left undefined in `spec.md` itself. None of the five enumerated reasons (`"quit" | "reload" | "new" | "resume" | "fork"`) is mapped to an invalidation status in this paragraph, and no observable post-condition is given by which a test could check that the fast-path was correctly taken.

PIC step 4 is more careful and arrives at a different rule: "The handler runs in fixed order regardless of `event.reason`," with the no-op behaviour falling out as a *consequence* — sub-step 2 (`loomAbort.abort()` over every `ActiveInvocationRegistry` entry) and sub-step 3 (`Promise.allSettled` over their `disposeBarrier`s) iterate an empty set on `new | resume | fork` because Pi serialises turns at session boundaries, so no active invocations exist; sub-step 1 (drain the registry), sub-step 4 (close watchers), and sub-step 5 (detach forwarding listeners) still run unconditionally, and PIC explicitly accepts that watcher closure on a no-teardown reason is a `/reload` away. PIC's "fast-path no-op" is therefore an emergent property of running the same fixed sequence over an empty registry, *not* a branch the handler may take.

`spec.md`'s wording invites two divergent implementations: (a) an implementer who reads only the orientation paragraph writes `if (reasonDidNotInvalidate(event.reason)) return;` at handler entry and skips watcher closure and listener detachment entirely; (b) an implementer who reads PIC writes the fixed five-sub-step sequence. Both can claim conformance to their respective surfaces. Worse, "did not invalidate" has no spec-anchored mapping, so even implementer (a) has to invent the predicate. The clause should be deleted (or rewritten to restate PIC's actual rule) so the orientation paragraph aligns with PIC and stops authorising a branch PIC does not.

## Spec Documents

- `spec.md` — Orientation > Prerequisites: Session model paragraph (edited)
- `spec_topics/pi-integration-contract.md` — Extension entry point, step 4 + Edge cases the handler must observe (read-only; already correct)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The plan does not currently have a leaf that owns the `session_shutdown` handler implementation directly — H4 covers only the factory shell and `/loom-status`; V18 covers cancellation checkpoints, the file watcher, and panic routing but never enumerates the five-sub-step teardown sequence as a leaf. The fix is a `spec.md` wording edit; PIC already states the operative rule correctly. No existing leaf's `Tests` or `Ships when` clauses change.

## Consequence

**Severity:** advisory

An implementer reading only the spec.md orientation paragraph could write a `event.reason`-keyed short-circuit at handler entry that skips watcher closure and listener detachment on `new | resume | fork`, leaking chokidar handles, debounce timer handles, and `AbortSignal` listeners across user-session swaps until the next `/reload`. An implementer who reads PIC will not diverge. The leak is bounded by `/reload`, so this is degradation rather than incorrectness, but the ambiguity also blocks any test from asserting "the fast-path was correctly taken" because the fast-path's observable invariants are unstated.

## Solution Space

**Shape:** single

### Recommendation

Delete the clause "and may fast-path to a no-op when the underlying reason did not invalidate the extension runtime" from the `*Session model.*` paragraph in `spec.md`. Replace the surrounding sentence with: "the runtime's handler treats every reason identically; the fixed teardown sequence and the V1 acceptance that it may close watchers on a reason that did not in fact tear down the extension are owned by [Pi Integration Contract — Extension entry point, step 4](./spec_topics/pi-integration-contract.md)."

This removes the apparent contradiction without adding any normative content to `spec.md`: PIC's "fixed order regardless of `event.reason`" rule and its "no-teardown reason makes the sequence a fast-path no-op (no active invocations exist at session boundaries because Pi serialises turns)" explanation already cover the behaviour. The orientation paragraph reverts to its proper role — pointing at the authoritative surface — and stops authorising a branch PIC does not.

Edge cases the implementer must watch:
- The `*Session model.*` paragraph already forward-links PIC for the closed reason set; the new sentence consolidates that link with the teardown-sequence link rather than introducing a second one. Keep both anchors (`#entry-capability-probe` is unrelated; the relevant anchor is the "Extension entry point" section heading and the `#session-shutdown-semantics` anchor for the semantics paragraph).
- Do not introduce a new `event.reason → invalidates?` mapping table in `spec.md`. PIC already pins the rule contextually ("`reason: \"new\" | \"resume\" | \"fork\"` does not always tear down the *extension* runtime"); duplicating it in the orientation paragraph re-creates the source-of-truth split this finding flags.

## Relationships

- T12 "`session_shutdown` unknown reason: no closed-set validation, no fail-safe" — same-cluster (both touch the same `*Session model.*` sentence; resolve independently — that finding adds an out-of-set fallback rule, this one removes the fast-path clause)

---

# T12 — `session_shutdown` unknown reason: no closed-set validation, no fail-safe

**Original heading:** `session_shutdown` unknown reason: no closed-set validation, no fail-safe
**Original section:** spec.md — Orientation > Prerequisites: Session model
**Kind:** assumptions, completeness, error-model
**Importance:** high

## Finding

`spec.md`'s Session model paragraph and `pi-integration-contract.md` step 4 both treat `event.reason: "quit" | "reload" | "new" | "resume" | "fork"` as a closed normative set, and the PIC handler is specified to "[treat] every reason identically" with a permitted fast-path no-op when the reason "did not invalidate the extension runtime." Neither page states what the runtime does if Pi delivers a reason outside this set. There is no validation step, no fallback behaviour, no diagnostic, and no operator-visible signal that an unrecognised value was observed.

The omission has two concrete failure paths. (1) An implementer reading the PIC sub-steps may write `switch (event.reason) { case "quit": …; case "reload": …; … }` against the enumerated set with no `default` arm, silently doing nothing for an unknown reason — leaking the chokidar watcher handle, the settings watcher handle, every pending debounce timer, every entry in `ActiveInvocationRegistry`, and every forwarding listener attached to Pi-side `ctx.signal` / tool `execute(signal)` / parent-`invoke` signals onto an extension instance Pi is about to invalidate. (2) A future Pi minor that adds a sixth reason (e.g., `"swap"`) lands as a host-drift hazard with no stated routing class, no diagnostic code, and no test that can fail in CI to surface the drift.

The closed-set claim is also load-bearing for one other surface: `loom/runtime/cancelled-by-session-shutdown` carries `details.event.reason` typed as the same five-arm union (per `diagnostics.md`'s registry row and PIC's Per-invocation operator visibility bullet). An unknown reason flowing into that emission produces a payload outside the documented `details` schema, with no rule for substitution, sanitisation, or rejection.

## Spec Documents

- `spec.md` — Orientation > Prerequisites > Session model paragraph (edited)
- `spec_topics/pi-integration-contract.md` — Extension entry point, step 4 and the `reason: "new" | "resume" | "fork"` edge-case bullet (edited)
- `spec_topics/pi-integration-contract.md` — Session-swap behaviour for in-flight invocations, Per-invocation operator visibility bullet (edited; `details.event.reason` typing)
- `spec_topics/diagnostics.md` — `loom/runtime/*` registry table (edited if a new code is registered; read-only otherwise)
- `spec_topics/cancellation.md` — second-trigger paragraph that enumerates `/reload`, `/new`, fork, or quit (read-only; cross-reference for consistency)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. No leaf in the current plan owns the `session_shutdown` handler implementation: H4 (`h4-extension-shell.md`) registers only the renderer and a no-op `/loom-status` command, Mb (`m-mvp.md`) owns the `session_start` subscription and the per-invocation `loomAbort` construction but not the shutdown handler, and `coverage-matrix.md` carries no row for the PIC step-4 sequence. The unknown-reason rule will become a constraint on whichever leaf eventually closes the handler implementation; once that leaf exists, its acceptance criteria must include the validation, the fail-safe routing, and the diagnostic emission.

## Consequence

**Severity:** correctness

A reasonable implementer can produce a session-shutdown handler that silently no-ops on an unknown reason, leaking watchers, timers, abort controllers, and registry entries onto an about-to-be-invalidated extension runtime — with no diagnostic the operator can observe and no test that can fail. A Pi minor that introduces a new reason value would land as a silent regression, and the typed `details.event.reason` payload on `loom/runtime/cancelled-by-session-shutdown` would carry an out-of-schema value with no defined handling.

## Solution Space

**Shape:** single

### Recommendation

Add an explicit unknown-reason rule to PIC step 4 (and a one-line restatement in `spec.md`'s Session model paragraph):

1. **Validation.** On handler entry, compare `event.reason` against the closed set `{"quit", "reload", "new", "resume", "fork"}`. The comparison is the only pre-sequence branch the handler MAY take.
2. **Fail-safe routing.** An unknown reason MUST be treated as the most-invalidating case: the five-sub-step sequence runs in full, the fast-path no-op MUST NOT be taken, and the `ActiveInvocationRegistry` is drained via `loomAbort.abort()` + bounded `Promise.allSettled` exactly as for `"quit"` / `"reload"`.
3. **Diagnostic.** Emit exactly one `loom/host/session-shutdown-reason-unknown` (W, runtime; new registry row in `diagnostics.md`) via `console.error` (the teardown handler's documented channel — `pi.sendMessage` may already be invalidated). `details: { observed: <event.reason as string> }`. The diagnostic is emitted before sub-step 1 so it survives even if the handler later throws.
4. **Payload contract.** The `details.event.reason` field on `loom/runtime/cancelled-by-session-shutdown` carries the observed string verbatim when the reason is unknown; the registry row's typing for that field widens to `"quit" | "reload" | "new" | "resume" | "fork" | string` with a normative note that the wider arm is reserved for the unknown-reason path.
5. **Test obligation.** The leaf that lands the handler implementation asserts the unknown-reason path with a synthesised reason (e.g., `"swap"`): the diagnostic is emitted exactly once, the full five-sub-step sequence runs (registry drained, watchers closed, listeners detached), and the fast-path bullet under PIC's edge-case list is not taken.

Edge cases the implementer must observe: an unknown reason at a moment when `ExtensionRuntime.invalidate()` has already fired still routes the diagnostic through `console.error` (not through the `sendSystemNote` chain — same rule as `loom/runtime/reload-teardown-timeout`); the validation step itself MUST be wrapped in `try`/`catch` so a getter that throws on `event.reason` access is treated as an unknown reason, not as an unhandled exception escaping the handler; the `details.event.reason` widening on `cancelled-by-session-shutdown` is the only place the wider type appears in the diagnostic registry, and the rest of the spec's `event.reason` references continue to use the closed five-arm union.

## Relationships

- T11 "`session_shutdown` fast-path: spec.md sentence implies a branching short-circuit that PIC does not authorise" — same-cluster (both touch the step-4 reason-handling surface; resolutions interlock — removing the fast-path simplifies the unknown-reason rule to "always run the full sequence")

