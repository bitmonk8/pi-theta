// RFC 0010 (execution-status.md EXST-5) — the child-activity stdout tap.
//
// A SECOND consumer on the child's existing stdout line pump, beside the
// envelope scan (PIC-59): the pump broadcasts each line to a snapshot copy of
// its listener `Set`, so attaching here never consumes, detaches, or reorders
// the lines the drive listener needs. The listener is synchronous and
// allocation-light — a size gate, one `JSON.parse`, a `switch` on the single
// universally-read field — and the parsed object never escapes the frame.
//
// EXST-5 / EXST-12 class 3: the ONLY fields read off a `--mode json` event
// are `type` and (on `tool_execution_start`) `toolName`; off the L3
// `theta_progress` reserved-key line (EXST-15 / PIC-74) the envelope's
// `v`/`seq`/`invocation_id` acceptance guards and the five class-2 event
// fields. Prompt/response text, tool arguments, tool results, and thinking
// are never read, retained, or forwarded. An unparseable, oversized,
// out-of-order, wrong-version, or otherwise unrecognised line is IGNORED with
// no diagnostic — it folds into PIC-59's existing stray-line tolerance (the
// runtime registry is closed, DIAG-2). Nothing here writes stdout, so PIC-74's
// no-relay clause holds structurally: the only wire writer is the child-regime
// tool `execute` arm.
//
// Spec: docs/spec_topics/execution-status.md EXST-5, EXST-15;
// docs/spec_topics/pi-integration-contract/subagent.md PIC-74.

import type { SubagentChildProcess } from "../../runtime/subagent-launcher";
import {
  PROGRESS_MESSAGE_CLAMP_CHARS,
  PROGRESS_MIN_INTERVAL_MS,
  PROGRESS_SCOPE_CLAMP_CHARS,
  PROGRESS_WIRE_KEY,
  PROGRESS_WIRE_VERSION,
  TAP_LINE_MAX_BYTES,
} from "./types";
import type { ProgressAuthorMessage } from "./types";
import { clampProgressField } from "./progress-tool";
import type { Clock } from "../../seams/clock";

/** F-L3-6: the optional per-child rate-gate clock (absent → no rate gate;
 *  production always passes `root.clock`, `production-theta-producer.ts`'s tap
 *  attach site). */
export interface ChildTapOptions {
  readonly clock?: Clock;
}

export type ChildTapEvent =
  | { readonly type: "turn_start" }
  | { readonly type: "tool_execution_start"; readonly toolName: string }
  | { readonly type: "tool_execution_end" }
  | { readonly type: "agent_end" }
  // L3 (EXST-5/EXST-15; PIC-74) — the reserved-key `theta_progress` wire line,
  // recognised in the tap's OWN parse (EXST-5).
  | { readonly type: "theta_progress"; readonly payload: ProgressAuthorMessage };

/** Attach the second stdout consumer beside the envelope scan (EXST-5).
 *  `child.onStdoutLine` is the makeLinePump fan-out Set
 *  (production-subagent-host.ts:328-360); the drive's own listener
 *  (subagent-json-driver.ts:162) is untouched. Returns the detach handle. */
export function attachChildActivityTap(
  child: Pick<SubagentChildProcess, "onStdoutLine">,
  publish: (event: ChildTapEvent) => void,
  opts?: ChildTapOptions,
): () => void {
  // PIC-74 per-child acceptance state: one stream identity, one monotonic
  // `seq` ladder, one rate window. Closure-scoped per attachment, so a second
  // child never inherits the first's guards.
  const clock = opts?.clock;
  let lastSeq = 0;
  let latchedInvocationId: string | undefined;
  let lastAcceptedAtMs: number | undefined;
  let tapDropped = 0;

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
    // L3 (EXST-5/EXST-15; PIC-74): the reserved-key `theta_progress` envelope
    // is recognised in the tap's OWN parse, ahead of the `type` switch below
    // (`classifyChildStdoutLine` is NOT widened — the second reserved key is
    // owned by this module). The payload is UNTRUSTED display data: every
    // guard below is a silent drop, never a diagnostic, and the parsed
    // envelope never escapes this frame (only the five event fields are read
    // — EXST-12's class-3 posture).
    if (Object.prototype.hasOwnProperty.call(record as Record<string, unknown>, PROGRESS_WIRE_KEY)) {
      const envelope = (record as Record<string, unknown>)[PROGRESS_WIRE_KEY];
      if (typeof envelope !== "object" || envelope === null) {
        return;
      }
      const env = envelope as {
        readonly v?: unknown;
        readonly seq?: unknown;
        readonly invocation_id?: unknown;
        readonly event?: unknown;
      };
      // Wrong version drops SILENTLY — PIC-74's deliberate asymmetry with the
      // `theta_result` envelope's named skew refusal: a result is a value,
      // progress is best-effort telemetry.
      if (env.v !== PROGRESS_WIRE_VERSION) {
        return;
      }
      if (typeof env.seq !== "number" || !Number.isInteger(env.seq) || env.seq <= lastSeq) {
        return; // strictly-increasing `seq` per child (replay/regression guard)
      }
      if (typeof env.invocation_id !== "string") {
        return;
      }
      if (latchedInvocationId === undefined) {
        latchedInvocationId = env.invocation_id;
      } else if (env.invocation_id !== latchedInvocationId) {
        return; // one child, one stream identity
      }
      const ev = env.event;
      if (typeof ev !== "object" || ev === null) {
        return;
      }
      const fields = ev as {
        readonly message?: unknown;
        readonly scope?: unknown;
        readonly done?: unknown;
        readonly total?: unknown;
        readonly dropped?: unknown;
      };
      if (typeof fields.message !== "string") {
        return; // `message` is load-bearing: a bad type drops the whole LINE
      }
      if (clock !== undefined) {
        // PIC-74: the parent enforces the 200 ms bound DEFENSIVELY — a hostile
        // or clock-skewed child must not outrun it. Excess lines are
        // counted-but-dropped and ride the next accepted payload's `dropped`.
        const now = clock.now();
        if (lastAcceptedAtMs !== undefined && now - lastAcceptedAtMs < PROGRESS_MIN_INTERVAL_MS) {
          tapDropped += 1;
          return;
        }
        lastAcceptedAtMs = now;
      }
      lastSeq = env.seq;
      const wireDropped =
        typeof fields.dropped === "number" &&
        Number.isInteger(fields.dropped) &&
        fields.dropped > 0
          ? fields.dropped
          : 0;
      const carried = wireDropped + tapDropped;
      tapDropped = 0;
      const payload: ProgressAuthorMessage = {
        // Defensive re-clamp + strip: the emitter clamped, but the wire is not
        // trusted to have done so (EXST-5's re-clamp obligation).
        message: clampProgressField(fields.message, PROGRESS_MESSAGE_CLAMP_CHARS),
        ...(typeof fields.scope === "string"
          ? { scope: clampProgressField(fields.scope, PROGRESS_SCOPE_CLAMP_CHARS) }
          : {}),
        // Non-conforming optional fields are discarded FIELD-WISE (PIC-74).
        ...(typeof fields.done === "number" && Number.isInteger(fields.done)
          ? { done: fields.done }
          : {}),
        ...(typeof fields.total === "number" && Number.isInteger(fields.total)
          ? { total: fields.total }
          : {}),
        ...(carried > 0 ? { dropped: carried } : {}),
      };
      publish({ type: "theta_progress", payload });
      return;
    }
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
