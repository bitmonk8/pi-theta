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

import type {
  AssistantMessage,
  TextContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { SystemPromptSessionContext } from "./binder-system-prompt";
import { capSystemNote, sanitizeSystemNoteSubstring } from "./system-note";

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
 * The paired V11b implementation implements the out-of-class detection.
 */
export function isTranscriptSafeCustomType(customType: string): boolean {
  if (customType.length === 0) {
    return false;
  }
  // U+000A (`\n`), U+000D (`\r`), and `]` (U+005D) each break the `[custom:<type>]`
  // role tag; the two-byte `: ` sequence (U+003A U+0020) collides with the
  // role-tag separator. A lone `:` not followed by U+0020 is in class.
  if (
    customType.includes("\n") ||
    customType.includes("\r") ||
    customType.includes("]") ||
    customType.includes(": ")
  ) {
    return false;
  }
  return true;
}

/**
 * The **canonical no-whitespace JSON serialisation** of BNDR-8: object keys in
 * ascending Unicode code-point order at every nesting level, array element order
 * preserved verbatim, no insignificant whitespace. This is the renderer's single
 * source for emitting JSON anywhere in the transcript — the assistant
 * `<args-json>` and the `toolResult` non-text blocks — because `JSON.stringify`
 * alone is not key-order-stable across the SDK's property-insertion orders.
 */
function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    // Array element order is preserved verbatim; `undefined` slots serialise as
    // `null`, matching JSON.stringify array semantics.
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      // Object keys emitted in ascending Unicode code-point order at every
      // nesting level (recursion handles nesting). Keys whose value is
      // `undefined` are dropped, matching JSON.stringify object semantics.
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => compareCodePoint(a, b));
    const body = entries
      .map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`)
      .join(",");
    return `{${body}}`;
  }
  // No other JSON-representable runtime type remains (bigint / symbol / function
  // are not part of the `ToolCall.arguments` / tool-result value domain).
  return JSON.stringify(value) ?? "null";
}

/**
 * Compare two strings by Unicode code-point (lexical) order, as BNDR-8's
 * key sort requires. The default `<` on strings compares UTF-16 code units,
 * diverging from code-point order across the surrogate range; iterating code
 * points keeps astral keys ordered as the rule mandates.
 */
function compareCodePoint(a: string, b: string): number {
  const aPoints = [...a];
  const bPoints = [...b];
  const len = Math.min(aPoints.length, bPoints.length);
  for (let i = 0; i < len; i += 1) {
    const ap = aPoints[i]?.codePointAt(0) ?? 0;
    const bp = bPoints[i]?.codePointAt(0) ?? 0;
    if (ap !== bp) {
      return ap - bp;
    }
  }
  return aPoints.length - bPoints.length;
}

/**
 * Concatenate the text content of a `user` / `custom` message body: a bare
 * string is emitted as-is; a `(TextContent | ImageContent)[]` array contributes
 * only its `TextContent.text` in array order (image blocks contribute no
 * transcript bytes, per BNDR-7 rule 4).
 */
function textBody(content: string | readonly { readonly type: string }[]): string {
  if (typeof content === "string") {
    return content;
  }
  let out = "";
  for (const block of content) {
    if (block.type === "text") {
      out += (block as unknown as TextContent).text;
    }
  }
  return out;
}

/** Render one `user` message to its single `[user]: <text>` line (rule 4). */
function renderUser(message: UserMessage): string {
  return `[user]: ${textBody(message.content)}\n`;
}

/**
 * Render one `assistant` message (BNDR-8): the merged `[assistant]: <text>` line
 * (concatenation of every `TextContent.text` in `content` array order, with
 * `ThinkingContent` omitted) is emitted first, then each `ToolCall` as a sibling
 * `[tool-call <name>(<args-json>)]` line in `content` array order.
 */
function renderAssistant(message: AssistantMessage): string {
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const block of message.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "toolCall") {
      toolCalls.push(block);
    }
    // `ThinkingContent` is omitted: it is not part of the grounding conversation.
  }
  let out = `[assistant]: ${text}\n`;
  for (const call of toolCalls) {
    out += `[tool-call ${call.name}(${canonicalJson(call.arguments)})]\n`;
  }
  return out;
}

/**
 * Render one `toolResult` message under the single `[tool]` role tag (rule 4):
 * text blocks contribute their `.text`; any non-text block is serialised by the
 * canonical no-whitespace JSON serialisation, all concatenated in array order.
 */
function renderToolResult(message: ToolResultMessage): string {
  let body = "";
  for (const block of message.content) {
    if (block.type === "text") {
      body += (block as TextContent).text;
    } else {
      body += canonicalJson(block);
    }
  }
  return `[tool]: ${body}\n`;
}

/** Render one `custom` message under its `[custom:<type>]` role tag (rule 4). */
function renderCustom(message: {
  readonly customType: string;
  readonly content: string | readonly { readonly type: string }[];
}): string {
  return `[custom:${message.customType}]: ${textBody(message.content)}\n`;
}

/** Render a single message to its `\n`-terminated line block. */
function renderMessage(message: AgentMessage): string {
  switch (message.role) {
    case "user":
      return renderUser(message as UserMessage);
    case "assistant":
      return renderAssistant(message as AssistantMessage);
    case "toolResult":
      return renderToolResult(message as ToolResultMessage);
    default:
      // The remaining variant is `custom` (the `AgentMessage` union is
      // `Message | CustomMessage`); its `customType` was validated by the
      // BNDR-9 pre-scan before this renderer runs.
      return renderCustom(
        message as unknown as {
          readonly customType: string;
          readonly content: string | readonly { readonly type: string }[];
        },
      );
  }
}

/**
 * BNDR-7 / BNDR-8 — render the included-turn `AgentMessage[]` slice (already
 * chronological oldest-to-newest, already truncated by the V11i walk) into the
 * binder's session-context body, or reject on a non-transcript-safe `customType`
 * (BNDR-9).
 *
 * The included slice arrives chronological oldest-to-newest and already
 * truncated by the V11i walk; this renderer groups it into turns, renders each
 * per-variant, joins turn blocks with exactly one blank line, and returns the
 * body — or rejects on the first included non-transcript-safe `customType`.
 */
export function renderCompactTranscript(
  messages: readonly AgentMessage[],
): CompactTranscriptResult {
  // BNDR-9 pre-scan: reject before rendering if any included `custom` message
  // carries a non-transcript-safe `customType`. The invocation-level outcome is
  // failure (no proceed-and-drop branch): argument binding does not proceed.
  for (const message of messages) {
    if (message.role === "custom") {
      const customType = (message as unknown as { readonly customType: string })
        .customType;
      if (!isTranscriptSafeCustomType(customType)) {
        return { kind: "custom-type-unsafe", value: customType };
      }
    }
  }

  // Group into turns: a turn is a `user` message plus all subsequent
  // assistant / toolResult / custom messages up to (but not including) the next
  // `user` message. `buildSessionContext(...).messages` is guaranteed to begin
  // with a `user` message (leading-`user`-message precondition), so no leading
  // run falls outside a turn; a message preceding any `user` (contra the
  // precondition) still opens a turn so the render stays total.
  const turns: AgentMessage[][] = [];
  for (const message of messages) {
    if (message.role === "user" || turns.length === 0) {
      turns.push([message]);
    } else {
      turns[turns.length - 1]?.push(message);
    }
  }

  // BNDR-7i void truncation: zero included turns ⇒ the whole Session-context
  // block is omitted (no header, no body, no terminating blank line).
  if (turns.length === 0) {
    return { kind: "ok", sessionContext: undefined };
  }

  // Each turn block is the concatenation of its `\n`-terminated message lines
  // (already chronological). Successive turn blocks are separated by exactly one
  // blank line: block A ends `\n`, joining with a further `\n` yields `\n\n`.
  const blocks = turns.map((turn) =>
    turn.map((message) => renderMessage(message)).join(""),
  );
  const transcriptBody = blocks.join("\n");
  return { kind: "ok", sessionContext: { transcriptBody } };
}

/**
 * BNDR-9 — build the `loom/runtime/custom-type-unsafe` diagnostic for a rejected
 * `customType` value. `message` carries the offending value rendered per the
 * category-2 `<value>` rule (diagnostics registry Message column:
 * `custom-message type is not transcript-safe: '<value>'`).
 *
 * `<value>` is emitted verbatim (the category-2 runtime-value rendering); the
 * structured diagnostic message is not subject to the one-line system-note
 * discipline (that applies to the user-facing note below).
 */
export function customTypeUnsafeDiagnostic(value: string): Diagnostic {
  return {
    severity: "error",
    code: CUSTOM_TYPE_UNSAFE_CODE,
    message: `custom-message type is not transcript-safe: '${value}'`,
  };
}

/**
 * BNDR-9 — render the user-facing custom-type-unsafe system note through the
 * custom-type-unsafe row of the Failure-mode templates
 * (`loom /<name>: custom-message type is not transcript-safe: '<value>'`).
 *
 * The `<value>` suffix passes through the V11e rule-1 single-line sanitisation
 * (an unsafe `customType` may contain a `\n`/`\r`) and the whole note through
 * the rule-2 code-point cap; the surrounding template text is fixed.
 */
export function renderCustomTypeUnsafeNote(loomName: string, value: string): string {
  const suffix = sanitizeSystemNoteSubstring(value);
  const note = `loom /${loomName}: custom-message type is not transcript-safe: '${suffix}'`;
  return capSystemNote(note);
}
