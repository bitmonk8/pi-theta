import { describe, expect, it, vi } from "vitest";
import type { ExtensionContext, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { resolvePiTool } from "../src/extension/callable-pi-tool-resolver";

const observed = vi.hoisted(() => ({ contexts: [] as unknown[] }));
vi.mock("@earendil-works/pi-coding-agent", async (load) => {
  const actual = await load<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...actual,
    createReadToolDefinition: (cwd: string) => ({
      ...actual.createReadToolDefinition(cwd),
      execute: async (_id: string, _params: unknown, signal: AbortSignal, _update: unknown, ctx: ExtensionToolContext) => {
        observed.contexts.push(ctx);
        signal.throwIfAborted();
        return { content: [{ type: "text", text: ctx.cwd }], details: undefined };
      },
    }),
  };
});

describe("Pi SDK build-pin direct built-in context adaptation", () => {
  it("preserves invocation context without inventing nested-tool privileges", async () => {
    const ctx = { cwd: "/workspace", model: { id: "test-model" }, sessionManager: {} } as unknown as ExtensionContext;
    const tool = resolvePiTool("read", ctx)!;
    const result = await tool.execute("direct-call", { path: "file" }, new AbortController().signal);
    expect(result.content).toEqual([{ type: "text", text: "/workspace" }]);
    const adapted = observed.contexts.at(-1) as ExtensionToolContext;
    expect(adapted.model).toBe(ctx.model);
    expect(adapted.sessionManager).toBe(ctx.sessionManager);
    expect(adapted.tools).toEqual([]);
    await expect(adapted.executeTool("bash", { command: "must-not-run" })).rejects.toThrow("Nested tool execution is unavailable");
    expect("executeTool" in ctx).toBe(false);
  });
  it("forwards the real abort signal to the built-in", async () => {
    const ctx = { cwd: "/workspace" } as ExtensionContext;
    const abort = new AbortController();
    abort.abort(new Error("caller cancelled"));
    await expect(resolvePiTool("read", ctx)!.execute("direct-call", {}, abort.signal)).rejects.toThrow("caller cancelled");
  });
});
