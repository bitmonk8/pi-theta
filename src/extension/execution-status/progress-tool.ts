// RFC 0010 (execution-status.md EXST-13/14/15; pi-integration-contract/
// subagent.md PIC-74) — the author-facing `theta_progress` tool.
//
// ONE `pi.registerTool` registration per extension instance, from the
// factory's synchronous body ahead of any compose pass (EXST-13's ordering
// MUST — the `pi.getAllTools()` snapshot a `tools:` admission reads must
// already carry the name). `execute` branches on the process's regime, which
// is the ONLY axis that changes what a call does:
//
//   - PARENT regime (EXST-14): exactly two effects per ACCEPTED call — one
//     class-2 bus publication and one durable `theta-progress-entry`
//     milestone. Never `pi.sendMessage` (EXST-1), never a wire line.
//   - CHILD regime (EXST-15 / PIC-74): exactly one fd-1 stdout wire line and
//     nothing else — no UI, no bus, no entry (the child's `--no-session`
//     transcript is ephemeral, so the line is the call's entire effect).
//
// The EXST-14 clamps (strip control/ANSI, 200-char message, 64-char scope,
// 200 ms minimum inter-acceptance with the counted-but-dropped carry) are
// applied HERE, at the emitter, before anything renders, appends, or crosses
// the process boundary — the parent tap re-applies them defensively because
// the wire is untrusted display data (PIC-74's parent posture).
//
// Every exit returns the fixed `ok` result (EXST-13): accepted, dropped,
// off-gated, or no-live-invocation alike, and a defective latch or sink can
// never surface an error result or throw into the host tool loop (EXST-9).
//
// Spec: docs/spec_topics/execution-status.md EXST-13, EXST-14, EXST-15;
// docs/spec_topics/pi-integration-contract/subagent.md PIC-74.

import { writeSync } from "node:fs";
import { Type } from "typebox";
import type { AgentToolResult, ToolDefinition } from "@earendil-works/pi-coding-agent"; // allow-pi-surface: PIC#64 — ToolDefinition/AgentToolResult are the shipped registerTool carriers, mirrored from production-theta-producer.ts's own respond-tool registration
import type { ActiveInvocationRegistry } from "../../runtime/active-invocation-registry";
import type { Clock } from "../../seams/clock";
import type { EntryChannelHandle } from "./entry-channel";
import type { ExecutionStatusBus, ProgressAuthorMessage } from "./types";
import {
  PROGRESS_MESSAGE_CLAMP_CHARS,
  PROGRESS_MIN_INTERVAL_MS,
  PROGRESS_SCOPE_CLAMP_CHARS,
  PROGRESS_WIRE_KEY,
  PROGRESS_WIRE_MAX_LINE_BYTES,
  PROGRESS_WIRE_VERSION,
  THETA_PROGRESS_TOOL_NAME,
} from "./types";

/** EXST-13: `{ message: string, scope?: string, done?: integer, total?: integer }`,
 *  additional properties rejected. Built from a raw JSON-schema literal
 *  wrapped in `Type.Unsafe` (the repo's own convention for a hand-built
 *  schema, e.g. `production-theta-producer.ts`'s respond-tool `parameters` —
 *  never the `Type.Object`/`Type.String`/… builder surface). */
export interface ThetaProgressParams {
  readonly message: string;
  readonly scope?: string;
  readonly done?: number;
  readonly total?: number;
}

export const THETA_PROGRESS_PARAMETERS = Type.Unsafe<ThetaProgressParams>({
  type: "object",
  properties: {
    message: { type: "string" },
    scope: { type: "string" },
    done: { type: "integer" },
    total: { type: "integer" },
  },
  required: ["message"],
  additionalProperties: false,
});

/** The narrow dependency surface `registerThetaProgressTool` reads. */
export interface ProgressToolDeps {
  /** `deps.isSubagentChild === true` at the factory (EXST-15). */
  readonly isChildRegime: boolean;
  /** The factory's `liveStatusBus` latch. */
  readonly bus: () => ExecutionStatusBus | undefined;
  /** The factory's `liveActiveInvocations` latch. */
  readonly invocations: () => ActiveInvocationRegistry | undefined;
  /** The factory's `liveClock` latch. */
  readonly clock: () => Clock | undefined;
  /** The `theta-progress-entry` channel handle. */
  readonly entryChannel: EntryChannelHandle | undefined;
  /** Default (production): the PIC-59 fd-1 `writeSync` discipline. Overridable for tests. */
  readonly writeWireLine?: (line: string) => void;
}

const OK_RESULT: AgentToolResult<unknown> = Object.freeze({
  content: Object.freeze([Object.freeze({ type: "text", text: "ok" })]),
  details: undefined,
  isError: false,
}) as unknown as AgentToolResult<unknown>;

/**
 * ANSI/OSC-style escape sequences: CSI in both its 7-bit (`ESC [`) and 8-bit
 * (`CSI`, U+009B) spellings, plus the two-byte `ESC <Fe>` forms. Stripped
 * WHOLESALE before the residual control scan below, so a sequence's
 * printable tail (`31m`) never survives as text (EXST-14).
 */
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]|\u009B[0-?]*[ -/]*[@-~]|\u001B[@-Z\-_]/g;
/** Residual C0 + DEL + C1 after the ANSI pass. Tab is handled before this. */
const CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * EXST-14's strip step: ANSI sequences removed wholesale, a horizontal tab
 * becomes ONE space, every residual control character (newline included — a
 * newline would split the PIC-74 wire line) removed. Ordered strip-then-clamp
 * so a strip can never un-clamp a field.
 */
export function stripControlAndAnsi(s: string): string {
  return s.replace(ANSI_PATTERN, "").replace(/\t/g, " ").replace(CONTROL_PATTERN, "");
}

/** EXST-14: strip, then clamp to `max` code units (the `clampName` discipline). */
export function clampProgressField(s: string, max: number): string {
  const stripped = stripControlAndAnsi(s);
  return stripped.length <= max ? stripped : stripped.slice(0, max);
}

/** The post-clamp class-2 payload (EXST-14): the single currency of both arms. */
export function clampProgressPayload(
  params: ThetaProgressParams,
  dropped: number,
): ProgressAuthorMessage {
  return {
    message: clampProgressField(params.message, PROGRESS_MESSAGE_CLAMP_CHARS),
    ...(typeof params.scope === "string"
      ? { scope: clampProgressField(params.scope, PROGRESS_SCOPE_CLAMP_CHARS) }
      : {}),
    // `done`/`total` are schema-enforced integers; they render verbatim.
    ...(Number.isInteger(params.done) ? { done: params.done } : {}),
    ...(Number.isInteger(params.total) ? { total: params.total } : {}),
    ...(dropped > 0 ? { dropped } : {}),
  };
}

/** Per-instance acceptance/emission state (EXST-14 / PIC-74). Closure-held. */
interface ProgressToolState {
  lastAcceptedAtMs: number | undefined;
  droppedSinceAccept: number;
  /** PIC-74: per-process monotonic wire counter, first emitted line is `seq: 1`. */
  wireSeq: number;
}

/**
 * The default child-regime wire writer. Byte-for-byte the PIC-59 envelope
 * discipline (production-subagent-host.ts's `defaultStdoutFdWrite`): pi's
 * `takeOverStdout()` reassigns the extension-visible `process.stdout.write`
 * to stderr in `--mode json`/`-p`, so a progress line written through the
 * extension API would never reach the parent's stdout scan. `writeSync(1, …)`
 * targets the descriptor directly, one atomic newline-terminated write per
 * line (unsplittable, Windows-safe) — PIC-74's write-discipline bullet.
 */
function defaultWireFdWrite(line: string): void {
  writeSync(1, line); // allow-sync: RFC 0010 PIC-74 one-shot progress-line write to fd 1, not event-loop I/O
}

/**
 * EXST-13: execution ALWAYS returns the fixed success result, in both
 * regimes, whether the call was accepted or dropped by the rate clamp.
 */
function executeThetaProgress(
  params: ThetaProgressParams,
  deps: ProgressToolDeps,
  state: ProgressToolState,
): AgentToolResult<unknown> {
  try {
    // 1. EXST-13: a call executing while no theta invocation is live in this
    //    process is a no-op. Pre-compose calls land here too (the latches are
    //    published at compose), which is why they are read lazily.
    const registry = deps.invocations();
    const clock = deps.clock();
    if (registry === undefined || clock === undefined || registry.size() === 0) {
      return OK_RESULT;
    }
    if (typeof params.message !== "string") {
      return OK_RESULT; // defensive: the host validates `parameters` ahead of execute
    }
    // 2. EXST-10/EXST-12: class-2 is disabled ENTIRELY under `off` — nothing
    //    renders, appends, or is emitted, and the call is NOT counted as a
    //    drop (an `off` window must not shrink the next accepted payload's
    //    carry). Each process applies its OWN resolved ceiling (EXST-15).
    const bus = deps.bus();
    if ((bus?.verbosity() ?? "names") === "off") {
      return OK_RESULT;
    }
    // 3. EXST-14: the 200 ms minimum inter-acceptance interval. A call inside
    //    the window is counted-but-dropped and its count rides the NEXT
    //    accepted publication's `dropped` field.
    const now = clock.now();
    if (
      state.lastAcceptedAtMs !== undefined &&
      now - state.lastAcceptedAtMs < PROGRESS_MIN_INTERVAL_MS
    ) {
      state.droppedSinceAccept += 1;
      return OK_RESULT;
    }
    state.lastAcceptedAtMs = now;
    const dropped = state.droppedSinceAccept;
    state.droppedSinceAccept = 0;
    const payload = clampProgressPayload(params, dropped);

    if (deps.isChildRegime) {
      emitWireLine(payload, registry, deps, state);
    } else {
      publishParentRegime(payload, registry, deps, bus);
    }
    return OK_RESULT;
  } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
    // EXST-9/EXST-13: a defective latch, sink, or writer drops the
    // publication; the tool never surfaces an error result to the tool loop.
    return OK_RESULT;
  }
}

/**
 * EXST-14 parent regime: exactly two effects and nothing else. Attribution is
 * best-effort from the registry's NEWEST live entry (F-L3-1: the innermost
 * executing parent-side frame — prompt-mode bodies are strictly sequential
 * per PIC-2, and subagent-mode bodies report over the wire instead), never
 * invented; with no attributable entry the milestone carries neither field.
 */
function publishParentRegime(
  payload: ProgressAuthorMessage,
  registry: ActiveInvocationRegistry,
  deps: ProgressToolDeps,
  bus: ExecutionStatusBus | undefined,
): void {
  const entries = registry.snapshot();
  const attributed = entries[entries.length - 1];
  bus?.authorMessage(attributed?.invocationId, payload);
  // EXST-14: a dead/absent entry channel skips the milestone SILENTLY —
  // PIC-72's message-channel fallback covers the three operator note classes
  // only and MUST NOT be applied to milestones (EXST-1 forbids the message
  // channel for execution-status output outright).
  deps.entryChannel?.appendMilestone({
    ...payload,
    ...(attributed !== undefined
      ? { theta: attributed.theta, invocation_id: attributed.invocationId }
      : {}),
  });
}

/**
 * EXST-15 / PIC-74 child regime: one line, fd 1, nothing else. The line's
 * `invocation_id` is the process's ROOT invocation — the OLDEST live registry
 * entry (insertion order) — so one child is one stream identity regardless of
 * how many nested frames are live when a call lands.
 */
function emitWireLine(
  payload: ProgressAuthorMessage,
  registry: ActiveInvocationRegistry,
  deps: ProgressToolDeps,
  state: ProgressToolState,
): void {
  const root = registry.snapshot()[0];
  if (root === undefined) {
    return;
  }
  const seq = state.wireSeq + 1;
  const line = `${JSON.stringify({
    [PROGRESS_WIRE_KEY]: {
      v: PROGRESS_WIRE_VERSION,
      invocation_id: root.invocationId,
      seq,
      event: payload,
    },
  })}\n`;
  // PIC-74 emission bound: post-clamp lines fit by construction, so this is a
  // defensive floor — an over-cap line is DROPPED (folded into the next
  // line's `dropped`), never truncated mid-JSON and never split. `seq` is not
  // consumed by a line that never reached the wire.
  if (Buffer.byteLength(line, "utf8") > PROGRESS_WIRE_MAX_LINE_BYTES) {
    state.droppedSinceAccept += 1;
    return;
  }
  state.wireSeq = seq;
  (deps.writeWireLine ?? defaultWireFdWrite)(line);
}

/** The narrow `pi.registerTool` surface the tool touches (mirrors
 *  `status-command.ts`'s `StatusCommandPi`: a deliberately narrow structural
 *  cap, param named `hostApi` rather than the bare `pi`/`ExtensionAPI`
 *  literal so the inventory-closure audit's canonical-carrier check does not
 *  mistake this narrowed surface for the full `ExtensionAPI` binding). */
export interface ProgressToolHostApi {
  registerTool(tool: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>): void;
}

/**
 * Register the `theta_progress` tool (EXST-13). Call site: the factory BODY,
 * synchronous arm, before any `session_start`/compose pass resolves a
 * callable set — see `factory.ts`'s call site comment for the ordering
 * argument.
 */
export function registerThetaProgressTool(hostApi: ProgressToolHostApi, deps: ProgressToolDeps): void {
  // EXST-2's no-globals posture: the acceptance interval, the drop carry, and
  // the wire sequence are per-registration closure state, torn down with the
  // extension instance.
  const state: ProgressToolState = {
    lastAcceptedAtMs: undefined,
    droppedSinceAccept: 0,
    wireSeq: 0,
  };
  const definition: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS> = {
    name: THETA_PROGRESS_TOOL_NAME,
    label: "Theta progress",
    description:
      "Report live progress from a running theta. Renders on the operator's execution-status surfaces only; never enters any conversation. Returns \"ok\".",
    parameters: THETA_PROGRESS_PARAMETERS,
    execute: async (_toolCallId, params) => executeThetaProgress(params, deps, state),
  };
  hostApi.registerTool(definition);
}
