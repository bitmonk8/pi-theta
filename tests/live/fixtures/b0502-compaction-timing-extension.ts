// Test-only public extension hooks. The host itself chooses and commits the
// automatic compaction. We provide a tiny custom summary, a poll-visible
// before_agent_start yield, and >10s of active-run work. No host state patching.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const B0502_QUERY = "What is 263 plus 514? Answer with the number only.";
export const B0502_TIMING = "b0502-timing";
export default function (pi: ExtensionAPI) {
  const snapshot = (phase: string, ctx: ExtensionContext) => {
    pi.appendEntry(B0502_TIMING, { phase, idle: ctx.isIdle(), signal: ctx.signal !== undefined, at: Date.now() });
  };
  let delayOwnRun = false;
  pi.on("session_before_compact", async (event, ctx) => {
    snapshot("compacting", ctx);
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    return { compaction: { summary: "The prior task was a completed arithmetic calculation.",
      firstKeptEntryId: event.preparation.firstKeptEntryId, tokensBefore: event.preparation.tokensBefore } };
  });
  pi.on("before_agent_start", async (event, ctx) => {
    if (event.messageType !== "user" || event.prompt !== B0502_QUERY) return;
    delayOwnRun = true;
    snapshot("before-start-yield", ctx);
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    snapshot("after-start-yield", ctx);
  });
  pi.on("agent_start", async (_event, ctx) => {
    if (!delayOwnRun) return;
    delayOwnRun = false;
    snapshot("active-work-start", ctx);
    await new Promise<void>((resolve) => setTimeout(resolve, 11000));
    snapshot("active-work-end", ctx);
  });
}
