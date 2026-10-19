// Deterministic author output (tool-calls.md#theta-print). Unlike progress,
// this is ordinary transcript content, never a model turn or a parent wire event.
import { write } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import { Type } from "typebox";
import type { ToolDefinition, MessageRenderer } from "@earendil-works/pi-coding-agent";
import type { InProcessToolExecute, AgentToolResultEnvelope } from "../runtime/tool-call-execute";
import type { SystemNoteSender } from "../diagnostics/system-note";
import { renderSystemNoteBody } from "./system-note-renderer";

export const THETA_PRINT_TOOL_NAME = "theta_print";
export const THETA_PRINT_CHANNEL = "theta-print";
export const THETA_PRINT_MAX_BYTES = 65536;
interface PrintParams { readonly text: string }
export const THETA_PRINT_PARAMETERS = Type.Unsafe<PrintParams>({
  type: "object", properties: { text: { type: "string", maxLength: THETA_PRINT_MAX_BYTES } },
  required: ["text"], additionalProperties: false,
});
export interface PrintToolHostApi extends SystemNoteSender {
  registerTool(tool: ToolDefinition<typeof THETA_PRINT_PARAMETERS>): void;
}
export interface PrintToolDeps {
  readonly isChildRegime: boolean;
  /** Scalar host mode, refreshed at session_start; never capture an old ctx. */
  readonly mode: () => string | undefined;
  readonly writeText?: (text: string) => void | Promise<void>;
}

/** Plain text only: no Markdown interpretation or terminal-control injection. */
export function printText(text: string): string {
  return stripVTControlCharacters(text.replace(/\r\n/g, "\n"))
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "");
}
export function createThetaPrintRenderer(): MessageRenderer {
  return message => renderSystemNoteBody(
    typeof message.content === "string" ? printText(message.content) : "",
    message.display,
  );
}
function writePrintText(text: string): Promise<void> {
  // Pi 1.x redirects process.stdout.write from extensions to stderr. Use the
  // actual text-mode fd, asynchronously, only after the parent/print gate.
  const bytes = Buffer.from(text, "utf8");
  return new Promise((resolve, reject) => {
    const next = (offset: number): void => {
      if (offset === bytes.length) { resolve(); return; }
      write(1, bytes, offset, bytes.length - offset, null, (error, written) => {
        if (error) reject(error);
        else if (written <= 0) reject(new Error("theta_print stdout write made no progress"));
        else next(offset + written);
      });
    };
    next(0);
  });
}

export function registerThetaPrintTool(hostApi: PrintToolHostApi, deps: PrintToolDeps): {
  readonly codeSideExecute: InProcessToolExecute;
} {
  const execute: InProcessToolExecute = async (_id, params, signal): Promise<AgentToolResultEnvelope> => {
    if (signal.aborted) throw new Error("theta_print cancelled");
    if (params === null || typeof params !== "object" || Array.isArray(params) ||
        Object.keys(params).length !== 1 || !("text" in params) || typeof params.text !== "string") {
      throw new Error("theta_print requires exactly one string field: text");
    }
    if (Buffer.byteLength(params.text, "utf8") > THETA_PRINT_MAX_BYTES) {
      throw new Error("theta_print text exceeds 65536 UTF-8 bytes");
    }
    const text = printText(params.text);
    // A child sends only to ITS OWN session. Never fd 1: pipe children reserve
    // it for theta_result/progress protocol records. No ancestor forwarding.
    hostApi.sendMessage({ customType: THETA_PRINT_CHANNEL, content: text, display: true }, { triggerTurn: false });
    // Print mode doesn't render custom messages to stdout itself. JSON/RPC/TUI
    // already transport/render the message; do not corrupt their output streams.
    if (!deps.isChildRegime && deps.mode() === "print") {
      await (deps.writeText ?? writePrintText)(text.endsWith("\n") ? text : text + "\n");
    }
    return { content: [{ type: "text", text: "ok" }] };
  };
  hostApi.registerTool({
    name: THETA_PRINT_TOOL_NAME,
    label: "Theta print",
    description: "Display plain text directly in this session without a model turn. Subagent output stays private. Returns ok.",
    parameters: THETA_PRINT_PARAMETERS,
    execute: async (id, params, signal) => {
      await execute(id, params, signal ?? new AbortController().signal);
      return { content: [{ type: "text", text: "ok" }], details: undefined };
    },
  });
  return { codeSideExecute: execute };
}
