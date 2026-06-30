// V7c / V7c-T — the diagnostic placeholder-rendering seam.
//
// The registry's *Message* column carries `<…>` placeholders the renderer
// interpolates at the diagnostic site. The normative surface (per
// diagnostics/placeholder-rendering-a.md and …-b.md) groups every V1
// placeholder into eight categories and fixes one rendering rule per category,
// so two conformant implementations produce byte-identical strings (or a
// byte-identical surround around an implementation-defined tail, for category
// 8) for the same source defect. Throughout, *byte-identical* means equal as
// UTF-8 byte sequences (GOV-15).
//
// V7c-T (tests-task) declares this seam and stubs the per-category renderers so
// the failing tests compile and red on their own primary assertions. The paired
// V7c implementation leaf fills these in. Each stub returns a benign wrong value
// (the empty string) so the byte-identical vector assertion reds for the
// intended reason (implementation absent), never on a thrown harness error.
//
// Host-derived inputs (category 8's `node-floor` `<observed>`, the running
// `process.versions.node` string) are passed in by the caller, never read from
// the ambient `process` here: the renderer is `src/**` production code and the
// *No globals, statics, singletons* ambient-primitive ban forbids a direct
// `process.versions` read. The category-8 test mocks the host version by
// passing it as an argument.

// ── Category 1 — static-type placeholders ──────────────────────────────────
// `<type>`, `<expected>`, `<actual>`, `<left>`, `<right>`, `<element>`.

/** A Loom static type, re-serialised in source-grammar form (type-system.md). */
export type LoomType =
  | { readonly kind: "primitive"; readonly name: "string" | "integer" | "number" | "boolean" | "null" }
  | { readonly kind: "literal"; readonly value: string | number | boolean }
  | { readonly kind: "union"; readonly members: readonly LoomType[] }
  | { readonly kind: "array"; readonly element: LoomType }
  | { readonly kind: "named"; readonly name: string }
  | { readonly kind: "result"; readonly ok: LoomType; readonly err: LoomType }
  | { readonly kind: "object"; readonly fields: readonly { readonly name: string; readonly type: LoomType }[] };

/** Render a Loom static type by re-serialising it in source-grammar form. */
export function renderType(type: LoomType): string {
  switch (type.kind) {
    case "primitive":
      // Primitive type names lowercase (already in canonical lowercase form).
      return type.name;
    case "literal":
      // Literal types as their literal source: `"foo"`, `42`, `true`.
      return typeof type.value === "string"
        ? JSON.stringify(type.value)
        : String(type.value);
    case "union":
      // Unions joined by ` | ` with no surrounding parentheses.
      return type.members.map(renderType).join(" | ");
    case "array":
      // Arrays as `array<T>` (the angle-bracket form).
      return `array<${renderType(type.element)}>`;
    case "named":
      // Named schemas/enums/aliases by their loom-side identifier.
      return type.name;
    case "result":
      // `Result<T, E>`, inner types recursing this rule.
      return `Result<${renderType(type.ok)}, ${renderType(type.err)}>`;
    case "object":
      // Inline anonymous object types: fields in declaration order, single
      // space after each `:` and after each `,`.
      return `{ ${type.fields
        .map((f) => `${f.name}: ${renderType(f.type)}`)
        .join(", ")} }`;
  }
}

// ── Category 2 — runtime-value placeholders ─────────────────────────────────
// `<scrutinee summary>`, `<value>` (runtime usage).

/** A runtime value to stringify per the canonical interpolation table. */
export type RuntimeValue =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "integer"; readonly value: number }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "null" }
  | { readonly kind: "schema-object"; readonly value: Record<string, unknown> }
  | { readonly kind: "result"; readonly variant: "Ok" | "Err"; readonly inner: RuntimeValue };

/**
 * Render a runtime value per the canonical interpolation-stringification table,
 * with the category-2 string-truncation extension: a string longer than 80
 * Unicode code points is truncated to its first 77 code points followed by the
 * literal three-character ellipsis `...` (counting by code point).
 */
export function renderRuntimeValue(value: RuntimeValue): string {
  switch (value.kind) {
    case "string":
      return truncateRuntimeString(value.value);
    case "integer":
      return renderInteger(value.value);
    case "number":
      // The `number` row of the stringification table: shortest decimal,
      // signed-zero normalised at the rendering boundary.
      return Object.is(value.value, -0) ? "0" : String(value.value);
    case "boolean":
      return value.value ? "true" : "false";
    case "null":
      return "null";
    case "schema-object":
      // Schema-typed object: compact `JSON.stringify` (the schema name does
      // not surface in the rendered string).
      return JSON.stringify(value.value);
    case "result":
      // `Result<T, E>` values render as `Ok(<inner>)` / `Err(<inner>)`, the
      // inner recursing this rule.
      return `${value.variant}(${renderRuntimeValue(value.inner)})`;
  }
}

/**
 * Truncate a runtime string per category 2: a string longer than 80 Unicode
 * code points is truncated to its first 77 code points followed by the literal
 * three-character ellipsis `...`. Counting is by Unicode code point (not by
 * UTF-16 code unit and not by grapheme cluster), so iterate code points.
 */
function truncateRuntimeString(s: string): string {
  const codePoints = Array.from(s);
  if (codePoints.length <= 80) {
    return s;
  }
  return codePoints.slice(0, 77).join("") + "...";
}

// ── Category 3 — syntactic-construct placeholders ───────────────────────────
// `<construct>` (closed token-name table); `<expr>` (verbatim source span).

/** A category-3 placeholder: a closed-table construct, or a verbatim span. */
export type ConstructPlaceholder =
  | { readonly kind: "construct"; readonly token: string }
  | { readonly kind: "expr"; readonly sourceSpan: string };

/**
 * Render a syntactic-construct placeholder: the closed token-name for
 * `<construct>`, or the verbatim source span (byte-for-byte) for `<expr>`.
 */
export function renderConstruct(placeholder: ConstructPlaceholder): string {
  // For `<construct>` the caller supplies the closed token-name; for `<expr>`
  // the verbatim source span. Both render byte-for-byte as given.
  return placeholder.kind === "construct"
    ? placeholder.token
    : placeholder.sourceSpan;
}

// ── Category 4 — numeric placeholders ───────────────────────────────────────
// `<i>`, `<length>`, `<depth>`, `<offset>`, `<count>`, `<index>`,
// `<required>`/`<provided>` (arity sites), `<max>`.

/**
 * Render an integer as the shortest decimal representation: no scientific
 * notation, no leading zeros, leading `-` for negatives, `0` for `-0`.
 */
export function renderInteger(value: number): string {
  // `0` for the value `-0` (signed zero normalised at the rendering boundary);
  // otherwise the shortest decimal representation `String` already produces for
  // an integer (no scientific notation, no leading zeros, leading `-` for
  // negatives). `Infinity` / `NaN` are unreachable for these placeholders by
  // construction (every emitting site is bounded).
  return Object.is(value, -0) ? "0" : String(value);
}

// ── Category 5 — source-derived placeholders ────────────────────────────────
// `<path>`, `<file>`, `<descriptor>`, `<name>`, `<field>`, `<param>`,
// `<variant>`, `<keyword>`, `<key>`, `<char>`.

/** A category-5 placeholder rendered verbatim from the source. */
export type SourceDerivedPlaceholder =
  | { readonly kind: "identifier"; readonly text: string }
  | { readonly kind: "path"; readonly text: string }
  | { readonly kind: "key"; readonly text: string }
  | { readonly kind: "char"; readonly codePoint: number }
  | { readonly kind: "descriptor"; readonly descriptorKind: "settings" | "cli-flag" | "package"; readonly value: string };

/**
 * Render a source-derived placeholder verbatim as it appears in the source:
 * identifiers/paths bare, `<key>` quoted only when not identifier-shaped,
 * `<char>` raw when printable else escaped, `<descriptor>` as `<kind>:"<value>"`.
 */
export function renderSourceDerived(placeholder: SourceDerivedPlaceholder): string {
  switch (placeholder.kind) {
    case "identifier":
      // Identifier-shaped names rendered unquoted; any surrounding quoting is
      // contributed by the registry template, not the placeholder.
      return placeholder.text;
    case "path":
      // The literal text inside the path-literal quotes, no normalisation.
      return placeholder.text;
    case "key":
      // `<key>` quoted with double quotes only when the key string is *not*
      // identifier-shaped per Lexical — Identifiers; otherwise rendered bare.
      return isIdentifierShaped(placeholder.text)
        ? placeholder.text
        : JSON.stringify(placeholder.text);
    case "char":
      // The raw character when printable (outside Unicode `Cc`/`Cn`); else the
      // standard `\xNN` / `\u{NNNN}` escape.
      return renderChar(placeholder.codePoint);
    case "descriptor":
      // The discovery-source descriptor as a `kind:value` pair, rendered
      // `<kind>:"<value>"` (the kind unquoted, the value double-quoted).
      return `${placeholder.descriptorKind}:${JSON.stringify(placeholder.value)}`;
  }
}

/**
 * The category-5 `<key>` identifier-shape predicate: a *runtime* string check
 * against `^[A-Za-z_][A-Za-z0-9_]*$` (Lexical — Identifiers). Reserved-keyword
 * collisions are still identifier-shaped for this rule (the reserved-keyword
 * rule fires at parse time on source positions, not at runtime on string
 * values).
 */
function isIdentifierShaped(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

/**
 * Render a `<char>` placeholder: the raw character when printable (any code
 * point outside the Unicode general categories `Cc` and `Cn`); otherwise the
 * `\xNN` escape for code points ≤ U+00FF, else the `\u{NNNN}` escape.
 */
function renderChar(codePoint: number): string {
  // `Cc` = control characters (C0 + C1: U+0000–U+001F, U+007F–U+009F). `Cn` =
  // unassigned. `String#match(/\p{Cc}|\p{Cn}/u)` witnesses both categories.
  const ch = String.fromCodePoint(codePoint);
  if (!/\p{Cc}|\p{Cn}/u.test(ch)) {
    return ch;
  }
  if (codePoint <= 0xff) {
    return `\\x${codePoint.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return `\\u{${codePoint.toString(16).toUpperCase()}}`;
}

// ── Category 6 — underlying-error placeholders ──────────────────────────────
// `<error.message>`, `<original content first line>`, `<dispose error first line>`.

/**
 * Render an underlying error to its first line. A caught thrown value is first
 * coerced to its underlying string (object `.message` when string, else
 * `String(v)`, else `<unreadable>`), newline-normalised, then cut at the first
 * `\n` (trailing whitespace preserved), rendering `<no message>` when empty.
 */
export function renderUnderlyingError(caught: unknown): string {
  return firstLineTruncate(coerceUnderlyingString(caught));
}

/**
 * Coerce a caught thrown value to its underlying string per the §6
 * underlying-error coercion: when `v` is an object whose `.message` is a
 * string, that `.message`; otherwise `String(v)`, or the literal `<unreadable>`
 * when the `String(v)` coercion itself throws.
 */
function coerceUnderlyingString(v: unknown): string {
  if (typeof v === "object" && v !== null) {
    const message = (v as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  try {
    return String(v);
  } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — Specific exception types only
    // `v` is a caught thrown value owned by the Pi SDK (a `pi.sendMessage`
    // throw, an `AgentSession.dispose()` rejection, an extension-bootstrap
    // throw) whose runtime shape loom cannot statically guarantee — a hostile
    // `toString`/`valueOf`/`Symbol.toPrimitive` may throw during the `String(v)`
    // coercion. The §6 coercion pins the literal `<unreadable>` fallback for
    // exactly this case: any throw maps to the sentinel (the caught value is
    // not inspected), so `String(v)` never yields a synchronous TypeError.
    void e;
    return "<unreadable>";
  }
}

/**
 * Truncate an already-coerced underlying string to its first line per §6:
 * newline-normalise (`\r\n` and bare `\r` collapse to `\n`), take the prefix up
 * to (but not including) the first `\n`, preserve trailing whitespace, and
 * render `<no message>` when the string is empty or has nothing before its
 * first `\n`. Only `\n` is a line break; `\u2028` / `\u2029` are ordinary.
 */
function firstLineTruncate(s: string): string {
  const normalised = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const newlineIndex = normalised.indexOf("\n");
  const firstLine =
    newlineIndex === -1 ? normalised : normalised.slice(0, newlineIndex);
  return firstLine === "" ? "<no message>" : firstLine;
}

// ── Category 7 — identifier-, descriptor-, and closed-enum placeholders ──────
// `<callee>`, `<enum>`, `<schema>`, `<slash-name>`, `<uuid>`, `<reason>`,
// `<kind>`, `<step>`, `<ctor>`, … (rendered by closed sub-rule).

/** A category-7 placeholder, rendered by its closed sub-rule. */
export type Category7Placeholder =
  | { readonly kind: "identifier"; readonly text: string }
  | { readonly kind: "uuid"; readonly value: string }
  | { readonly kind: "closed-enum"; readonly value: string }
  | { readonly kind: "numeric"; readonly value: number }
  | { readonly kind: "path"; readonly text: string }
  | { readonly kind: "descriptor"; readonly descriptorKind: "settings" | "cli-flag" | "package"; readonly value: string };

/**
 * Render a category-7 placeholder by its closed sub-rule (identifier-shaped
 * unquoted, `<uuid>` canonical lowercase 8-4-4-4-12, closed-enum verbatim,
 * numeric via the integer rule, path via the `<path>` rule, descriptor via the
 * `<descriptor>` rule).
 */
export function renderCategory7(placeholder: Category7Placeholder): string {
  switch (placeholder.kind) {
    case "identifier":
      // Identifier-shaped rendered unquoted in identifier form; surrounding
      // quoting comes from the registry template.
      return placeholder.text;
    case "uuid":
      // `<uuid>` renders in canonical lowercase 8-4-4-4-12 hex form.
      return placeholder.value.toLowerCase();
    case "closed-enum":
      // Each closed-enum value renders verbatim from its closed value table.
      return placeholder.value;
    case "numeric":
      // `<ms>`, `<deadline>`, `<step>` render via category 4's integer rule.
      return renderInteger(placeholder.value);
    case "path":
      // Path-shaped placeholders render via category 5's `<path>` rule.
      return renderSourceDerived({ kind: "path", text: placeholder.text });
    case "descriptor":
      // Descriptor-shaped placeholders render via category 5's `<descriptor>`.
      return renderSourceDerived({
        kind: "descriptor",
        descriptorKind: placeholder.descriptorKind,
        value: placeholder.value,
      });
  }
}

// ── Category 8 — host-derived freeform-tail placeholders ────────────────────
// `<error>`, `<message>`, `<observed>`.

/**
 * Render a host-supplied string as the implementation-defined freeform tail:
 * the same first-line truncation as category 6 (newline-normalise, cut at the
 * first `\n`, preserve trailing whitespace, render `<no message>` when empty).
 * The byte-identical surround comes from the registry *Message* template, not
 * from this function.
 */
export function renderHostDerivedTail(hostString: string): string {
  // Category 8's host-derived tail uses the same first-line truncation as
  // category 6 (the input is already a string, so no §6 caught-throw coercion).
  return firstLineTruncate(hostString);
}

/** The `loom/load/host-incompatible` payload the renderer interpolates. */
export interface HostIncompatibleDetails {
  readonly kind: string;
  /** The raw `<observed>` input (host-derived for `node-floor`). */
  readonly observed: string;
  /** The `<required>` substring (pinned per `kind`). */
  readonly required: string;
}

/**
 * Render the full `loom/load/host-incompatible` *Message* string by
 * interpolating its template `host incompatible (<kind>): observed <observed>,
 * required <required>`, applying category 8's first-line truncation to a
 * host-derived `<observed>`. The prefix and suffix bytes are byte-identical
 * across implementations; only the `<observed>` tail is implementation-defined.
 */
export function renderHostIncompatible(details: HostIncompatibleDetails): string {
  // Interpolate the registry template `host incompatible (<kind>): observed
  // <observed>, required <required>`. The `<observed>` of a host-derived
  // `kind` (e.g. `node-floor`, the running version string) is bounded by
  // category 8's first-line truncation; the closed-literal kinds pass through
  // unchanged (they carry no newline). The `<kind>` and `<required>` substrings
  // are pinned per `kind` and contribute byte-identical surround.
  const observed = renderHostDerivedTail(details.observed);
  return `host incompatible (${details.kind}): observed ${observed}, required ${details.required}`;
}
