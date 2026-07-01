import { describe, expect, it } from "vitest";
import type {
  AssistantMessage,
  ImageContent,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  CUSTOM_TYPE_UNSAFE_CODE,
  customTypeUnsafeDiagnostic,
  isTranscriptSafeCustomType,
  renderCompactTranscript,
  renderCustomTypeUnsafeNote,
} from "../src/binder/compact-transcript";
import {
  parseFrontmatter,
  type FrontmatterParseResult,
  type ModelReferenceMatcher,
} from "../src/parser/frontmatter";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// V11b-T — failing tests for the paired `V11b` "Bind context and transcript
// renderer" implementation.
//
// Spec: binder/binder-model-and-context.md (§"Compact-transcript format
// (normative)", BNDR-7 / BNDR-8 / BNDR-9), binder/binder-bypass-and-envelope.md
// (§"System-prompt structure (normative)" item 6),
// binder/determinism-cancellation-failure.md (§"Failure-mode templates").
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md, diagnostics/code-registry-runtime.md)
// and the §"Failure-mode templates (normative)" table per the *Diagnostic
// message anchors* rule.
//
// These tests red because the V11b renderer is absent: `renderCompactTranscript`
// is an inert stub that always returns an `ok` result carrying the
// `UNIMPLEMENTED_TRANSCRIPT` sentinel body, `isTranscriptSafeCustomType` always
// reports `true`, `customTypeUnsafeDiagnostic` returns the wrong code,
// `renderCustomTypeUnsafeNote` returns the sentinel, and the frontmatter parser
// does not yet emit `loom/parse/bind-context-session-on-subagent`. Each test
// reds on its own primary assertion (a byte-exact inequality, a wrong
// discriminant, a wrong code / note, or an absent diagnostic) — not on a
// compile error, a missing fixture, or a harness throw.

// --- AgentMessage constructors ----------------------------------------------

const USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
} as const;

function user(text: string): UserMessage {
  return { role: "user", content: text, timestamp: 0 };
}

function assistant(
  content: (TextContent | ThinkingContent | ToolCall)[],
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test-model",
    usage: USAGE,
    stopReason: "stop",
    timestamp: 0,
  };
}

function text(value: string): TextContent {
  return { type: "text", text: value };
}

function toolCall(name: string, args: Record<string, unknown>): ToolCall {
  return { type: "toolCall", id: "tc", name, arguments: args };
}

function toolResult(content: (TextContent | ImageContent)[]): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "tc",
    toolName: "get_weather",
    content,
    isError: false,
    timestamp: 0,
  };
}

function custom(
  customType: string,
  content: string | (TextContent | ImageContent)[],
  display = true,
): AgentMessage {
  return { role: "custom", customType, content, display, timestamp: 0 };
}

/** A non-text tool-result block whose only observable is its serialised form. */
function opaqueBlock(shape: Record<string, unknown>): ImageContent {
  return shape as unknown as ImageContent;
}

/** The rendered `transcriptBody` for an `ok` result (unwraps the block). */
function body(messages: readonly AgentMessage[]): string | undefined {
  const result = renderCompactTranscript(messages);
  if (result.kind !== "ok") {
    expect.unreachable(
      `renderCompactTranscript returned '${result.kind}', expected 'ok'`,
    );
  }
  return result.sessionContext?.transcriptBody;
}

// ============================================================================
// BNDR-7 — compact-transcript reference renderings (byte-exact)
// binder/binder-model-and-context.md §"Compact-transcript format (normative)"

describe("BNDR-7 — compact-transcript reference renderings (byte-exact)", () => {
  it("BNDR-7a: single-message user turn", () => {
    // binder-model-and-context.md#bndr-7a
    expect(body([user("hello")])).toBe("[user]: hello\n");
  });

  it("BNDR-7b: user + assistant + tool-call + tool-result + assistant turn", () => {
    // binder-model-and-context.md#bndr-7b
    const messages: AgentMessage[] = [
      user("What's the weather?"),
      assistant([text("Let me check."), toolCall("get_weather", { city: "Paris" })]),
      toolResult([text("Sunny, 20\u00b0C")]),
      assistant([text("Sunny in Paris, 20\u00b0C.")]),
    ];
    expect(body(messages)).toBe(
      "[user]: What's the weather?\n" +
        "[assistant]: Let me check.\n" +
        '[tool-call get_weather({"city":"Paris"})]\n' +
        "[tool]: Sunny, 20\u00b0C\n" +
        "[assistant]: Sunny in Paris, 20\u00b0C.\n",
    );
  });

  it("BNDR-7c: turn containing a `loom-system-note` custom message; two turns separated by one blank line", () => {
    // binder-model-and-context.md#bndr-7c — the display:false custom message is
    // still surfaced (convertToLlm entry); the third message opens a new turn.
    const messages: AgentMessage[] = [
      user("/lookup foo"),
      custom("loom-system-note", "loom /lookup: argument binding cancelled", false),
      user("try again"),
    ];
    expect(body(messages)).toBe(
      "[user]: /lookup foo\n" +
        "[custom:loom-system-note]: loom /lookup: argument binding cancelled\n" +
        "\n" +
        "[user]: try again\n",
    );
  });

  it("BNDR-7d: empty-content user message renders `[user]: ` with the trailing U+0020 preserved", () => {
    // binder-model-and-context.md#bndr-7d — the rule-3 trailing space is part of
    // the contract.
    expect(body([user("")])).toBe("[user]: \n");
  });

  it("BNDR-7f: assistant message with a `ToolCall` but no `TextContent` still emits `[assistant]: ` (empty body) then the tool-call line", () => {
    // binder-model-and-context.md#bndr-7f — MUST NOT collapse to a bare
    // `[tool-call …]` line with no owning role; the `[assistant]: ` line keeps
    // its rule-3 trailing U+0020.
    const messages: AgentMessage[] = [
      user("Check weather."),
      assistant([toolCall("get_weather", { city: "Paris" })]),
    ];
    expect(body(messages)).toBe(
      "[user]: Check weather.\n" +
        "[assistant]: \n" +
        '[tool-call get_weather({"city":"Paris"})]\n',
    );
  });

  it("BNDR-7g: `toolResult` with mixed text and non-text content blocks concatenates under one `[tool]` line", () => {
    // binder-model-and-context.md#bndr-7g — the non-text block serialises to
    // `{"chartId":7}` (canonical no-whitespace JSON) between the two text blocks.
    const messages: AgentMessage[] = [
      user("Run the report."),
      toolResult([text("Rows: "), opaqueBlock({ chartId: 7 }), text(" (rendered)")]),
    ];
    expect(body(messages)).toBe(
      "[user]: Run the report.\n" + '[tool]: Rows: {"chartId":7} (rendered)\n',
    );
  });

  it("BNDR-7h: `custom` message with a `(TextContent | ImageContent)[]` array body concatenates only the text blocks", () => {
    // binder-model-and-context.md#bndr-7h — the ImageContent block contributes
    // no transcript bytes.
    const messages: AgentMessage[] = [
      user("Look."),
      custom("extension-card", [
        text("See: "),
        { type: "image", data: "…", mimeType: "image/png" },
        text("above."),
      ]),
    ];
    expect(body(messages)).toBe(
      "[user]: Look.\n" + "[custom:extension-card]: See: above.\n",
    );
  });

  it("BNDR-7 (rule 4, assistant): `ThinkingContent` blocks are omitted from the assistant body", () => {
    // binder-model-and-context.md#compact-transcript-format-normative rule 4:
    // ThinkingContent is not part of the conversation the binder grounds against.
    const messages: AgentMessage[] = [
      user("Hi."),
      assistant([
        { type: "thinking", thinking: "SECRET-DELIBERATION" } as ThinkingContent,
        text("Hello!"),
      ]),
    ];
    const rendered = body(messages);
    expect(rendered).toBe("[user]: Hi.\n" + "[assistant]: Hello!\n");
    expect(rendered).not.toContain("SECRET-DELIBERATION");
  });

  it("BNDR-7i: void truncation (zero included turns) omits the entire Session-context block", () => {
    // binder-model-and-context.md#bndr-7i — an empty included slice produces no
    // transcript body at all; the block is absent (`sessionContext` undefined),
    // NOT a header with an empty body.
    const result = renderCompactTranscript([]);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.sessionContext).toBeUndefined();
    }
  });
});

// ============================================================================
// BNDR-8 — assistant-body byte determinism + canonical no-whitespace JSON
// binder/binder-model-and-context.md §"Compact-transcript format", BNDR-8

describe("BNDR-8 — assistant-body ordering and canonical JSON serialisation", () => {
  it("BNDR-8 / BNDR-7e: the merged `[assistant]:` text line is emitted first, then `[tool-call …]` lines in `content` array order, with args keys in ascending Unicode at every nesting level and array order verbatim", () => {
    // binder-model-and-context.md#bndr-7e — the ToolCall appears before the
    // TextContent in `content`, but the text line is still emitted first; the
    // two tool-call lines follow in array order. Keys sort ascending
    // (`city` < `unit`; `days` < `region`; `lat` < `zone`); the `days` array
    // order [3,1,2] is preserved verbatim.
    const messages: AgentMessage[] = [
      user("Plan my trip."),
      assistant([
        toolCall("get_weather", { unit: "celsius", city: "Paris" }),
        text("Checking now."),
        toolCall("get_forecast", {
          region: { zone: "eu", lat: 48 },
          days: [3, 1, 2],
        }),
      ]),
    ];
    expect(body(messages)).toBe(
      "[user]: Plan my trip.\n" +
        "[assistant]: Checking now.\n" +
        '[tool-call get_weather({"city":"Paris","unit":"celsius"})]\n' +
        '[tool-call get_forecast({"days":[3,1,2],"region":{"lat":48,"zone":"eu"}})]\n',
    );
  });

  it("BNDR-8 / BNDR-7j: a `toolResult` non-text block emits its keys in ascending Unicode order (source insertion order not preserved)", () => {
    // binder-model-and-context.md#bndr-7j — insertion order chartId,caption but
    // canonical serialisation sorts caption before chartId.
    const messages: AgentMessage[] = [
      user("Run the report."),
      toolResult([
        text("Rows: "),
        opaqueBlock({ chartId: 7, caption: "Q3" }),
        text(" (rendered)"),
      ]),
    ];
    expect(body(messages)).toBe(
      "[user]: Run the report.\n" +
        '[tool]: Rows: {"caption":"Q3","chartId":7} (rendered)\n',
    );
  });
});

// ============================================================================
// BNDR-9 — transcript-safe `customType` precondition
// binder/binder-model-and-context.md §BNDR-9;
// binder/determinism-cancellation-failure.md §"Failure-mode templates"

describe("BNDR-9 — transcript-safe `customType` precondition", () => {
  it("BNDR-9: the transcript-safe predicate rejects empty / `\\n` / `\\r` / `]` / `: ` and admits a lone `:`", () => {
    // binder-model-and-context.md#bndr-9 — only the two-byte `: ` sequence is
    // out of class; a lone `:` not followed by U+0020 is safe.
    expect(isTranscriptSafeCustomType("loom-system-note")).toBe(true);
    expect(isTranscriptSafeCustomType("a:b")).toBe(true); // lone colon is safe
    expect(isTranscriptSafeCustomType("")).toBe(false); // empty
    expect(isTranscriptSafeCustomType("a\nb")).toBe(false); // U+000A
    expect(isTranscriptSafeCustomType("a\rb")).toBe(false); // U+000D
    expect(isTranscriptSafeCustomType("a]b")).toBe(false); // U+005D `]`
    expect(isTranscriptSafeCustomType("a: b")).toBe(false); // U+003A U+0020
  });

  it("BNDR-9: a non-transcript-safe `customType` fires the diagnostic, fails the invocation, and renders the failure-mode note verbatim", () => {
    // The oracle asserts all three, not the diagnostic alone.
    const unsafe = "weird]type"; // contains `]` — unsafe, no whitespace to reshape
    const messages: AgentMessage[] = [user("go"), custom(unsafe, "body")];

    // (2) The invocation fails: transcript construction aborts and argument
    // binding does not proceed (the renderer rejects rather than returning `ok`).
    const result = renderCompactTranscript(messages);
    expect(result.kind).toBe("custom-type-unsafe");
    if (result.kind === "custom-type-unsafe") {
      expect(result.value).toBe(unsafe);
    }

    // (1) The diagnostic fires: `loom/runtime/custom-type-unsafe` (E). Message
    // from diagnostics/code-registry-runtime.md.
    const diag: Diagnostic = customTypeUnsafeDiagnostic(unsafe);
    expect(diag.code).toBe(CUSTOM_TYPE_UNSAFE_CODE);
    expect(diag.code).toBe("loom/runtime/custom-type-unsafe");
    expect(diag.severity).toBe("error");
    expect(diag.message).toBe(
      `custom-message type is not transcript-safe: '${unsafe}'`,
    );

    // (3) The user-facing system note matches the custom-type-unsafe row of the
    // Failure-mode templates verbatim.
    expect(renderCustomTypeUnsafeNote("lookup", unsafe)).toBe(
      `loom /lookup: custom-message type is not transcript-safe: '${unsafe}'`,
    );
  });
});

// ============================================================================
// loom/parse/bind-context-session-on-subagent — parse-time warning
// binder/binder-model-and-context.md §"Binder context";
// diagnostics/code-registry-parse.md

const resolvingMatcher: ModelReferenceMatcher = { resolve: () => "resolved" };

function parse(source: string): FrontmatterParseResult {
  return parseFrontmatter(source, { file: "test.loom", modelMatcher: resolvingMatcher });
}

function loom(...frontmatterLines: string[]): string {
  return ["---", ...frontmatterLines, "---", "@`hello`"].join("\n");
}

function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

describe("loom/parse/bind-context-session-on-subagent", () => {
  it("fires for `bind_context: session` on a `mode: subagent` loom and NOT on a prompt-mode loom", () => {
    // code-registry-parse.md — W, message verbatim. Conditional rule: positive
    // (subagent → fires) and negative (prompt → absent) halves.
    const subagent = parse(loom("mode: subagent", "bind_context: session"));
    const d = withCode(subagent.diagnostics, "loom/parse/bind-context-session-on-subagent");
    expect(d, "warning fires on a subagent-mode loom").toBeDefined();
    expect(d?.severity).toBe("warning");
    expect(d?.message).toBe(
      "'bind_context: session' has no effect on a mode: subagent loom",
    );

    const prompt = parse(loom("mode: prompt", "bind_context: session"));
    expect(
      withCode(prompt.diagnostics, "loom/parse/bind-context-session-on-subagent"),
      "warning is absent on a prompt-mode loom",
    ).toBeUndefined();
  });
});
