// RFC 0010 (execution-status.md EXST-5) — the child-activity stdout tap.
//
// A SECOND consumer on the child's existing stdout line pump, beside the
// envelope scan (PIC-59): the pump broadcasts each line to a snapshot copy of
// its listener `Set`, so attaching here never consumes, detaches, or reorders
// the lines the drive listener needs. The listener is synchronous and
// allocation-light — a size gate, one `JSON.parse`, a `switch` on the single
// universally-read field — and the parsed object never escapes the frame.
//
// EXST-5 / EXST-12 class 3: the ONLY fields read are `type` and (on
// `tool_execution_start`) `toolName`. Prompt/response text, tool arguments,
// tool results, and thinking are never read, retained, or forwarded. An
// unparseable, oversized, or unrecognised line is IGNORED with no diagnostic —
// it folds into PIC-59's existing stray-line tolerance (the runtime registry
// is closed, DIAG-2).
//
// Spec: docs/spec_topics/execution-status.md EXST-5.

import type { SubagentChildProcess } from "../../runtime/subagent-launcher";
import { TAP_LINE_MAX_BYTES } from "./types";

export type ChildTapEvent =
  | { readonly type: "turn_start" }
  | { readonly type: "tool_execution_start"; readonly toolName: string }
  | { readonly type: "tool_execution_end" }
  | { readonly type: "agent_end" };

/** Attach the second stdout consumer beside the envelope scan (EXST-5).
 *  `child.onStdoutLine` is the makeLinePump fan-out Set
 *  (production-subagent-host.ts:328-360); the drive's own listener
 *  (subagent-json-driver.ts:162) is untouched. Returns the detach handle. */
export function attachChildActivityTap(
  child: Pick<SubagentChildProcess, "onStdoutLine">,
  publish: (event: ChildTapEvent) => void,
): () => void {
  return child.onStdoutLine((line: string): void => {
    // 1. Size gate before any parse — a pathological line costs one length read.
    if (line.length > TAP_LINE_MAX_BYTES) {
      return;
    }
    // 2. Parse once (the pump hands the raw string; the envelope scan's own
    //    parse is not exposed), defensively: garbage is ordinary stray-line
    //    traffic, never a diagnostic.
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch { // allow-broad-catch: EXST-5 — execution-status.md#exst-5
      return;
    }
    // 3. Non-object / null roots carry no `--mode json` event.
    if (typeof parsed !== "object" || parsed === null) {
      return;
    }
    const record = parsed as { readonly type?: unknown; readonly toolName?: unknown };
    // 4. Switch on `type` — the only universally-read field. Everything else
    //    (`message_update`, `tool_execution_update`, `agent_start`, the session
    //    header, a `theta_result` envelope line, unknown kinds) is ignored.
    switch (record.type) {
      case "turn_start":
        publish({ type: "turn_start" });
        return;
      case "tool_execution_start": {
        const toolName = record.toolName;
        if (typeof toolName !== "string") {
          return;
        }
        publish({ type: "tool_execution_start", toolName });
        return;
      }
      case "tool_execution_end":
        publish({ type: "tool_execution_end" });
        return;
      case "agent_end":
        publish({ type: "agent_end" });
        return;
      default:
        return;
    }
  });
}
