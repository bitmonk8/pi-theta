// Inject a retryable error only AFTER a real successful provider completion.
// Do not abort the active run: this reaches the host's real _prepareRetry.
// Real provider errors remain unchanged and fail the test's prerequisites.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export const B0499_ERROR = "provider returned error: b0499 injected recovery attempt";
export default function retryableStop(pi: ExtensionAPI): void {
  let fired = false;
  pi.on("message_end", (event) => {
    if (fired || event.message.role !== "assistant" || event.message.stopReason !== "stop") return;
    fired = true;
    return { message: { ...event.message, stopReason: "error", errorMessage: B0499_ERROR } };
  });
}
