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

/// Top-level error returned by every query
schema QueryError = ValidationError
                  | TransportError
                  | ToolFailureError
                  | ToolCallError
                  | ContextOverflowError
                  | CancelledError
                  | InvokeFailure
                  | InvokeCalleeError
```

The authoritative `QueryError` union lives in [Query](./query.md); the variant order above mirrors that file so the two blocks diff cleanly.

Rules:

- **Placement.** Above a `schema` declaration, an `enum` declaration, a field within a schema, or a variant within an `enum`. Not legal inline on the same line as the field.
- **Multi-line.** Consecutive `///` lines are joined with newlines into one description string. Common leading whitespace inside the description is stripped (same algorithm as query-template dedent). Empty `///` lines become blank lines.
- **Static text only in V1.** No `${param}` interpolation — schemas are evaluated at parse time, not per-query.
- **Markdown.** Description text is treated as Markdown by providers; no transformation is performed.
- **`//` is a regular code comment** — not propagated into the schema. The two-character vs three-character distinction is the only learning cost.

## Field Separators and Comments

- Fields and enum variants are comma-separated; trailing comma is **optional**.
- `//` introduces a regular line comment (not part of any description).
- `///` introduces a description line (see above).
