# Descriptions

Loom uses Rust-style `///` doc comments to attach descriptions. They lower to JSON Schema `description:` fields and are passed to the model when the schema is used for structured output — they materially improve output quality.

```loom
/// A user submitting a code review request
schema ReviewRequest {
  /// The programming language the code is written in
  language: string,

  /// Areas of concern to focus the review on
  focus_areas: array<string>,

  /// Author of the code being reviewed
  author: Author,
}

/// Severity classification for a single review finding
enum Severity {
  /// Trivial issues; no immediate action needed
  Low,
  /// Requires attention soon
  Medium,
  /// Must be fixed immediately
  High,
}

/// (See Errors and Results for the canonical QueryError declaration)
```

The `QueryError` union and every variant it carries are declared in [Errors and Results — QueryError variants](./errors-and-results/queryerror-variants.md#queryerror-variants); this page does not restate them, to avoid the drift hazard the consolidation closes.

Rules:

- **Placement.** Above a `schema` declaration (object form, alias form `schema X = T | U`, or explicit-discriminator union form `schema X by f = A | B` alike), an `enum` declaration, a field within a schema, a variant within an `enum`, or a top-level `fn` declaration. Not legal inline on the same line as the anchor. A `///` description on a `fn` does not lower into JSON Schema (functions have no schema); it is preserved on the AST as human-facing documentation only. A `///` description above any other production — `let`, `import`, `export`, expression statements, control-flow statements — is `loom/parse/doc-comment-misplaced`. The full anchor list is normative in [Grammar Appendix — `///` placement](./grammar.md#-placement).
- **Multi-line.** Consecutive `///` lines are joined with newlines into one description string. Common leading whitespace inside the description is stripped (same algorithm as query-template dedent). Empty `///` lines become blank lines.
- **Static text only in loom 1.0.** No `${param}` interpolation — schemas are evaluated at parse time, not per-query.
- **No transformation.** Loom emits description text byte-for-byte into the lowered schema; no escaping, dedenting, or wrapping is performed beyond the multi-line join and common-leading-whitespace strip defined above. *(Non-normative provenance.)* OpenAI and Anthropic schema consumers at loom 1.0 authoring time render description text as Markdown; authors writing Markdown can rely on that empirically, but the rendering is the provider's contract, not loom's.
- **`//` is a regular code comment** — not propagated into the schema. The two-character vs three-character distinction is the only learning cost.

## Field Separators and Comments

- Fields and enum variants are comma-separated; trailing comma is **optional**.
- `//` introduces a regular line comment (not part of any description).
- `///` introduces a description line (see above).
