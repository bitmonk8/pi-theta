// V11b / V11b-T — the compact-transcript renderer and the transcript-safe
// `customType` precondition (the session-context body feeding the binder
// system prompt's item-6 block).
//
// This module owns:
//   - BNDR-7 (binder/binder-model-and-context.md §"Compact-transcript format
//     (normative)"): rendering the included-turn `AgentMessage[]` slice into the
//     byte-exact transcript body of the *Recent session context* block
//     (reference renderings BNDR-7a … BNDR-7j), including the void-truncation
//     whole-block omission (BNDR-7i: zero included turns ⇒ no block at all).
//   - BNDR-8 (same page): assistant-body byte determinism (the merged
//     `[assistant]: <text>` line first, then the `[tool-call …]` sibling lines
//     in `content` array order) and the canonical no-whitespace JSON
//     serialisation (object keys in ascending Unicode code-point order at every
//     nesting level, array order verbatim) used for `<args-json>` and for the
//     `toolResult` non-text blocks.
//   - BNDR-9 (same page): the transcript-safe `customType` precondition. A
//     `customType` that is empty or contains U+000A (`\n`), U+000D (`\r`), `]`
//     (U+005D), or the two-byte sequence `: ` (U+003A U+0020) is out of class;
//     the binder MUST reject the message and abort transcript construction
//     before rendering, emitting `loom/runtime/custom-type-unsafe`
//     (diagnostics/code-registry-runtime.md) and failing the affected
//     slash/prompt invocation (argument binding does not proceed; the loom does
//     not run). The user-facing system note renders through the custom-type-
//     unsafe row of binder/determinism-cancellation-failure.md §"Failure-mode
//     templates (normative)".
//
// V11b-T (tests-task) declares these seams and stubs the behaviour-bearing
// functions inertly so the failing BNDR-7/8/9 tests compile and red on their own
// primary assertions; the paired V11b implementation leaf fills them in. The
// `bind_context: session` on `mode: subagent` parse diagnostic
// (`loom/parse/bind-context-session-on-subagent`) is emitted by the frontmatter
// parser (src/parser/frontmatter.ts) and is not a seam of this module.
//
// Spec: binder/binder-model-and-context.md (§"Compact-transcript format
// (normative)", BNDR-7 / BNDR-8 / BNDR-9), binder/binder-bypass-and-envelope.md
// (§"System-prompt structure (normative)" item 6),
// binder/determinism-cancellation-failure.md (§"Failure-mode templates").

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { SystemPromptSessionContext } from "./binder-system-prompt";

/**
 * The V11b-T stub sentinel. The stub renderer emits this in place of a real
 * transcript body / note so the byte-exact BNDR-7/8/9 tests red on their
 * equality assertions rather than on a compile error. Contains a NUL so it can
 * never collide with a real transcript rendering.
 */
export const UNIMPLEMENTED_TRANSCRIPT = "\u0000UNIMPLEMENTED-V11b-transcript\u0000";

/**
 * The runtime diagnostic code emitted when an included `CustomMessage`'s
 * `customType` is not transcript-safe (BNDR-9;
 * diagnostics/code-registry-runtime.md `loom/runtime/custom-type-unsafe`).
 */
export const CUSTOM_TYPE_UNSAFE_CODE = "loom/runtime/custom-type-unsafe";

/**
 * The outcome of rendering the included-turn slice into the binder's
 * session-context body.
 *
 *   - `{ kind: "ok"; sessionContext }` — transcript construction succeeded.
 *     `sessionContext` carries the rendered `transcriptBody` when ≥1 turn was
 *     included, and is `undefined` when the included slice produced zero turns
 *     (BNDR-7i void truncation: the whole *Recent session context* block —
 *     opening line, body, and terminating blank line — is omitted).
 *   - `{ kind: "custom-type-unsafe"; value }` — an included `CustomMessage`
 *     carried a non-transcript-safe `customType` (BNDR-9). Transcript
 *     construction aborted before rendering; the affected invocation's argument
 *     binding does not proceed. `value` is the offending `customType` verbatim,
 *     for the diagnostic and the failure-mode system note.
 */
export type CompactTranscriptResult =
  | {
      readonly kind: "ok";
      readonly sessionContext: SystemPromptSessionContext | undefined;
    }
  | { readonly kind: "custom-type-unsafe"; readonly value: string };

/**
 * BNDR-9 predicate — a `CustomMessage.customType` is *transcript-safe* iff it is
 * non-empty and contains none of U+000A (`\n`), U+000D (`\r`), `]` (U+005D), or
 * the two-byte sequence `: ` (U+003A U+0020). Only the two-byte `: ` sequence is
 * out of class — a lone `:` not followed by U+0020 is safe.
 *
 * V11b-T stubs this to always report `true` (never rejects); the paired V11b
 * implementation leaf fills in the out-of-class detection.
 */
export function isTranscriptSafeCustomType(customType: string): boolean {
  void customType;
  return true;
}

/**
 * BNDR-7 / BNDR-8 — render the included-turn `AgentMessage[]` slice (already
 * chronological oldest-to-newest, already truncated by the V11i walk) into the
 * binder's session-context body, or reject on a non-transcript-safe `customType`
 * (BNDR-9).
 *
 * V11b-T stubs this to always return an `ok` result carrying the
 * {@link UNIMPLEMENTED_TRANSCRIPT} sentinel body, so every byte-exact BNDR-7/8
 * rendering test reds on equality, the BNDR-7i void-truncation test reds on the
 * `sessionContext === undefined` assertion, and the BNDR-9 rejection test reds
 * because no rejection occurs. The paired V11b implementation leaf fills in the
 * turn-grouping, per-variant rendering, canonical JSON, and BNDR-9 rejection.
 */
export function renderCompactTranscript(
  messages: readonly AgentMessage[],
): CompactTranscriptResult {
  void messages;
  return {
    kind: "ok",
    sessionContext: { transcriptBody: UNIMPLEMENTED_TRANSCRIPT },
  };
}

/**
 * BNDR-9 — build the `loom/runtime/custom-type-unsafe` diagnostic for a rejected
 * `customType` value. `message` carries the offending value rendered per the
 * category-2 `<value>` rule (diagnostics registry Message column:
 * `custom-message type is not transcript-safe: '<value>'`).
 *
 * V11b-T stubs this to return a placeholder diagnostic with the WRONG code so
 * the BNDR-9 diagnostic-firing assertion reds; the paired V11b implementation
 * leaf fills in the real code / severity / message.
 */
export function customTypeUnsafeDiagnostic(value: string): Diagnostic {
  void value;
  return {
    severity: "error",
    code: "loom/unimplemented",
    message: UNIMPLEMENTED_TRANSCRIPT,
  };
}

/**
 * BNDR-9 — render the user-facing custom-type-unsafe system note through the
 * custom-type-unsafe row of the Failure-mode templates
 * (`loom /<name>: custom-message type is not transcript-safe: '<value>'`).
 *
 * V11b-T stubs this to return the {@link UNIMPLEMENTED_TRANSCRIPT} sentinel so
 * the BNDR-9 note-verbatim assertion reds; the paired V11b implementation leaf
 * fills in the row rendering through the V11e line discipline.
 */
export function renderCustomTypeUnsafeNote(loomName: string, value: string): string {
  void loomName;
  void value;
  return UNIMPLEMENTED_TRANSCRIPT;
}
