// V11e / V11e-T — the binder system-note line-discipline seam.
//
// This module owns the shared system-note rendering discipline of
// binder/defaulting-system-note-echo.md §"System-note rendering" — the five
// rules every binder-emitted system note (the `needs_info` / `ambiguous`
// failure messages and the runtime-emitted failure rows) shares, which
// `bind_echo` and the V11f failure-modes table reference back to rather than
// restate:
//
//   1. Single line — replace each `\r`/`\n`/`\r\n` in a model-supplied
//      substring with one space, collapse runs of the ASCII whitespace set
//      {U+0009, U+000A, U+000B, U+000C, U+000D, U+0020} to one U+0020, and trim
//      that same set from both ends; non-ASCII whitespace (e.g. U+00A0) is
//      outside the set and preserved verbatim.
//   2. Length cap — the fully-rendered note is capped at 120 Unicode code
//      points, truncating at scalar boundaries with a trailing `…` (which
//      counts toward the cap); a note ≤120 code points gets no `…`.
//   3. Prefix/suffix demarcation — failure-arm notes follow the grammar
//      `loom /<name>: <fixed-phrase> — <sanitised-suffix>`; the em-dash marks
//      the loom-controlled-prefix ↔ model-or-runtime-controlled-suffix boundary.
//   4. Empty model content — a `message` (or a `candidates` array whose every
//      entry is) empty after rule-1 stripping is a malformed envelope, routed
//      to the malformed-envelope failure row (template owned by V11f), never
//      surfaced as an empty note.
//   5. `ambiguous.candidates` is not rendered in loom 1.0 — the `ambiguous`
//      arm renders only the model's `message` and never surfaces `candidates`.
//
// These granular functions are the seam the V11f failure-taxonomy leaf binds
// against to render its six verbatim failure-mode templates through the shared
// discipline.
//
// Spec: binder/defaulting-system-note-echo.md §"System-note rendering" (anchor
// #system-note-rendering, incl. the normative reference rendering).
//
// V11e fills in these renderers / classifiers (V11e-T declared the seams).

/** The rule-2 code-point cap for a fully-rendered system note. */
export const SYSTEM_NOTE_CODEPOINT_CAP = 120;

/** The rule-2 truncation marker (U+2026 HORIZONTAL ELLIPSIS). */
const ELLIPSIS = "\u2026";

/**
 * The rule-3 loom-controlled-prefix ↔ model/runtime-suffix separator: a spaced
 * em-dash (U+2014). Rendered verbatim as the failure-arm demarcation.
 */
const EM_DASH = "\u2014";

/**
 * The rule-1 ASCII-whitespace set — exactly {U+0009 tab, U+000A line feed,
 * U+000B vertical tab, U+000C form feed, U+000D carriage return, U+0020 space}.
 * Runs of these collapse to a single U+0020. Non-ASCII whitespace (U+00A0, the
 * U+2000–U+200A range) lies outside the set and is preserved verbatim, so this
 * class is enumerated explicitly rather than via the language-dependent `\s`.
 */
const ASCII_WHITESPACE_RUN = /[\u0009\u000A\u000B\u000C\u000D\u0020]+/g;

/** The classification of an `ambiguous` / `needs_info` arm's model content. */
export type ModelContentClass = "present" | "empty-malformed";

/**
 * Rule 1 — render a model-supplied substring to a single trimmed line: replace
 * each `\r`/`\n`/`\r\n` with one U+0020, collapse runs of the ASCII whitespace
 * set to one U+0020, and trim that set from both ends. Non-ASCII whitespace
 * (U+00A0, the U+2000–U+200A range) lies outside the set and is preserved
 * verbatim.
 *
 * V11e-T stubs this inertly (returns {@link UNIMPLEMENTED}); the paired V11e
 * implementation leaf fills in the whitespace collapse/trim.
 */
export function sanitizeSystemNoteSubstring(raw: string): string {
  // Replacing each CR/LF/CRLF with one space is subsumed by collapsing runs of
  // the ASCII-whitespace set (which includes CR and LF) to a single U+0020.
  const collapsed = raw.replace(ASCII_WHITESPACE_RUN, " ");
  // Trim only U+0020: any edge run of ASCII whitespace has already collapsed to
  // a single U+0020, so stripping U+0020 at the edges performs the rule-1 trim
  // without touching interior or edge non-ASCII whitespace (e.g. U+00A0). Using
  // JS `String.prototype.trim` here would be wrong — it also strips U+00A0.
  let start = 0;
  let end = collapsed.length;
  while (start < end && collapsed.charCodeAt(start) === 0x20) {
    start += 1;
  }
  while (end > start && collapsed.charCodeAt(end - 1) === 0x20) {
    end -= 1;
  }
  return collapsed.slice(start, end);
}

/**
 * Rule 2 — cap a fully-rendered note at {@link SYSTEM_NOTE_CODEPOINT_CAP}
 * Unicode code points, truncating at scalar boundaries and appending a trailing
 * `…` (U+2026) that counts toward the cap; a note already ≤ the cap is returned
 * unchanged (no `…`).
 *
 * V11e-T stubs this inertly (returns {@link UNIMPLEMENTED}); the paired V11e
 * implementation leaf fills in the scalar-aligned truncation.
 */
export function capSystemNote(rendered: string): string {
  // `Array.from` iterates by Unicode scalar (code point), so slicing operates at
  // scalar boundaries and never splits a surrogate pair — unlike `string.length`
  // / `slice`, which count and cut at UTF-16 code units.
  const scalars = Array.from(rendered);
  if (scalars.length <= SYSTEM_NOTE_CODEPOINT_CAP) {
    return rendered;
  }
  // Keep the first (cap − 1) scalars and append `…`, which counts toward the
  // cap, yielding exactly `SYSTEM_NOTE_CODEPOINT_CAP` code points.
  return scalars.slice(0, SYSTEM_NOTE_CODEPOINT_CAP - 1).join("") + ELLIPSIS;
}

/** Inputs to composing a failure-arm system note (rule 3 grammar). */
export interface FailureNoteInput {
  /** The loom's bare command name (shown as `loom /<name>:`). */
  readonly loomName: string;
  /** The loom-controlled fixed phrase (e.g. `argument binding needs more info`). */
  readonly fixedPhrase: string;
  /** The model- or runtime-supplied suffix, sanitised by rule 1 before interpolation. */
  readonly suffix: string;
}

/**
 * Rule 3 — compose a failure-arm system note following the grammar
 * `loom /<name>: <fixed-phrase> — <sanitised-suffix>`: the em-dash marks the
 * loom-controlled-prefix ↔ model-or-runtime-controlled-suffix boundary. The
 * suffix is passed through rule 1 and the whole note through rule 2.
 *
 * V11e-T stubs this inertly (returns {@link UNIMPLEMENTED}); the paired V11e
 * implementation leaf fills in the composition.
 */
export function renderFailureNote(input: FailureNoteInput): string {
  const suffix = sanitizeSystemNoteSubstring(input.suffix);
  const note = `loom /${input.loomName}: ${input.fixedPhrase} ${EM_DASH} ${suffix}`;
  return capSystemNote(note);
}

/** A model-content arm's fields (an `ambiguous` / `needs_info` envelope). */
export interface ModelContentInput {
  /** The model's `message` field (pre-rule-1). */
  readonly message: string;
  /** The model's `candidates` field, if any (pre-rule-1). */
  readonly candidates?: readonly string[] | null;
}

/**
 * Rule 4 — classify a model-content arm: `empty-malformed` when the `message`
 * is empty after rule-1 stripping, or when a `candidates` array is present and
 * every entry is empty after stripping; `present` otherwise. An
 * `empty-malformed` arm is routed to the malformed-envelope failure row (its
 * template owned by V11f), never surfaced as an empty note.
 *
 * V11e-T stubs this inertly (always returns `"present"`); the paired V11e
 * implementation leaf fills in the empty-content detection.
 */
export function classifyModelContent(input: ModelContentInput): ModelContentClass {
  // A `message` empty after rule-1 stripping (binder returned only whitespace)
  // is a malformed envelope, not an empty note.
  if (sanitizeSystemNoteSubstring(input.message) === "") {
    return "empty-malformed";
  }
  // The same applies to a non-empty `candidates` array whose every entry is
  // empty after stripping. An absent array (or an empty `[]` with no entries)
  // is not itself a malformed trigger.
  const candidates = input.candidates;
  if (
    candidates != null &&
    candidates.length > 0 &&
    candidates.every((c) => sanitizeSystemNoteSubstring(c) === "")
  ) {
    return "empty-malformed";
  }
  return "present";
}

/**
 * Rule 5 — derive the `ambiguous` arm's suffix: the rule-1-sanitised `message`
 * only. loom 1.0 never surfaces `candidates` on the user-facing note, so the
 * `candidates` field is not read into the suffix.
 *
 * V11e-T stubs this inertly (returns {@link UNIMPLEMENTED}); the paired V11e
 * implementation leaf fills in the message-only rendering.
 */
export function renderAmbiguousSuffix(input: ModelContentInput): string {
  // loom 1.0 surfaces only the model's `message`; `candidates` is never read.
  return sanitizeSystemNoteSubstring(input.message);
}
