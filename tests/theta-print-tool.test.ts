import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createThetaPrintRenderer, registerThetaPrintTool, THETA_PRINT_PARAMETERS, THETA_PRINT_TOOL_NAME, THETA_PRINT_CHANNEL, printText } from "../src/extension/print-tool";
import type { SystemNoteSender } from "../src/diagnostics/system-note";
import { resolveList, callableSetDeps } from "./helpers/e2e-s1";

function boot(mode = "tui", child = false) {
  const messages: Parameters<SystemNoteSender["sendMessage"]>[0][] = [];
  const options: unknown[] = []; const stdout: string[] = [];
  let tool: ToolDefinition<typeof THETA_PRINT_PARAMETERS> | undefined;
  const registration = registerThetaPrintTool({
    registerTool: value => { tool = value; },
    sendMessage: (message, opts) => { messages.push(message); options.push(opts); },
  }, { mode: () => mode, isChildRegime: child, writeText: text => { stdout.push(text); } });
  return { ...registration, messages, options, stdout, tool };
}
const signal = () => new AbortController().signal;

describe("theta_print deterministic output", () => {
  it("registers a normal callable tool and emits one literal multiline custom message, not a turn", async () => {
    const b = boot(); expect(b.tool?.name).toBe(THETA_PRINT_TOOL_NAME);
    expect(resolveList([THETA_PRINT_TOOL_NAME], { ...callableSetDeps(), inProcessToolNames: new Set([THETA_PRINT_TOOL_NAME]) }).registered).toBe(true);
    const text = "0472 first bug\n0499 **literal, not Markdown**\nRunning /literal";
    const result = await b.codeSideExecute("id", { text }, signal());
    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
    expect(b.messages).toEqual([{ customType: THETA_PRINT_CHANNEL, content: text, display: true }]);
    expect(b.options).toEqual([{ triggerTurn: false }]); expect(b.stdout).toEqual([]);
  });
  it.each(["tui", "rpc", "json"])("does not write raw stdout in %s mode", async mode => {
    const b = boot(mode); await b.codeSideExecute("id", { text: "output" }, signal());
    expect(b.stdout).toEqual([]); expect(b.messages).toHaveLength(1);
  });
  it("text print mode mirrors safe output once, with exactly one trailing newline", async () => {
    const b = boot("print");
    await b.codeSideExecute("a", { text: "one" }, signal());
    await b.codeSideExecute("b", { text: "two\n" }, signal());
    expect(b.stdout).toEqual(["one\n", "two\n"]);
  });
  it.each(["print", "tui", "json"])("child %s keeps text in its own session, never stdout/protocol or parent", async mode => {
    const b = boot(mode, true); await b.codeSideExecute("id", { text: "private child output" }, signal());
    expect(b.messages[0]?.content).toBe("private child output"); expect(b.stdout).toEqual([]);
  });
  it("preserves LF, tabs, blank lines and Unicode, while removing VT/control escapes", async () => {
    const raw = "\u001b[31mred\u001b[0m\r\n\t界\n\n\u0000\u0007";
    expect(printText(raw)).toBe("red\n\t界\n\n");
    const b = boot(); await b.codeSideExecute("id", { text: raw }, signal());
    expect(b.messages[0]?.content).toBe("red\n\t界\n\n");
  });
  it("rejects invalid, oversized UTF-8, cancelled and failed delivery without success", async () => {
    const b = boot();
    for (const params of [{}, { text: 7 }, { text: "a", extra: true }, null, { text: "界".repeat(22000) }]) {
      await expect(b.codeSideExecute("id", params, signal())).rejects.toThrow();
    }
    await expect(b.codeSideExecute("id", { text: "not sent" }, AbortSignal.abort())).rejects.toThrow();
    expect(b.messages).toEqual([]);
    const failing = registerThetaPrintTool({ registerTool: () => {}, sendMessage: () => { throw new Error("delivery failed"); } }, { mode: () => "print", isChildRegime: false, writeText: () => { throw new Error("must not reach stdout"); } });
    await expect(failing.codeSideExecute("id", { text: "not sent" }, signal())).rejects.toThrow("delivery failed");
  });
  it("accepts empty text and wraps the literal renderer without hiding Running notes", async () => {
    const b = boot(); await b.codeSideExecute("id", { text: "" }, signal()); expect(b.messages[0]?.content).toBe("");
    const renderer = createThetaPrintRenderer();
    const message = { customType: THETA_PRINT_CHANNEL, content: "Running /literal\n\nabcdef", display: true };
    const component = renderer(message as never, {} as never, {} as never);
    expect(component?.render(4)).toEqual(["Runn", "ing", "/lit", "eral", "", "abcd", "ef"]);
    expect(renderer({ ...message, display: false } as never, {} as never, {} as never)).toBeUndefined();
  });
});
