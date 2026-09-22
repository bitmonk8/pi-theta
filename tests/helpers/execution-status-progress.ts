// Shared execution-status fixtures: bus doubles, progress-tool recording and renderer snapshots.

import type {
  ExecutionStatusBus,
  ExecutionStatusSnapshot,
  InvocationNodeSnapshot,
  ProgressAuthorMessage,
} from "../../src/extension/execution-status/types";
import type { ExtensionAPI, ExtensionUIContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type {
  THETA_PROGRESS_PARAMETERS,
  ThetaProgressParams,
} from "../../src/extension/execution-status/progress-tool";
import type { ActiveInvocationEntry } from "../../src/runtime/active-invocation-registry";

/** No-op status bus; callers override only the methods they need to observe. */
export function noopExecutionStatusBus(overrides: Partial<ExecutionStatusBus> = {}): ExecutionStatusBus {
  return {
    invocationStarted: (): void => {},
    invocationBound: (): void => {},
    invocationEnded: (): void => {},
    invocationPlaced: (): void => {},
    checkpointBefore: (): void => {},
    trace: (): void => {},
    openLaneSet: () => ({ claim: (): void => {}, settle: (): void => {}, close: (): void => {} }),
    childEvent: (): void => {},
    authorMessage: (): void => {},
    setVerbosity: (): void => {},
    verbosity: () => "names",
    setViewShape: (): void => {},
    viewShape: () => "tree",
    snapshot: () => ({ nodes: [], untracked: 0 }),
    dispose: (): void => {},
    ...overrides,
  };
}

/** A minimal fake `ExecutionStatusBus`: every producer a no-op spy, `verbosity`
 *  returns a controllable value, `authorMessage` records its calls. */
export function fakeBus(initialVerbosity: "off" | "counts" | "names" = "names"): {
  bus: ExecutionStatusBus;
  authorMessageCalls: { invocationId: string | undefined; payload: ProgressAuthorMessage }[];
} {
  const authorMessageCalls: { invocationId: string | undefined; payload: ProgressAuthorMessage }[] = [];
  let verbosity = initialVerbosity;
  const bus = noopExecutionStatusBus({
    authorMessage: (invocationId, payload): void => {
      authorMessageCalls.push({ invocationId, payload });
    },
    setVerbosity: (v): void => {
      verbosity = v;
    },
    verbosity: () => verbosity,
  });
  return { bus, authorMessageCalls };
}

/** A recording `pi` double: every call pushed to `calls` in order, so ordering
 *  claims (registerTool BEFORE any `pi.on` subscription) are checked on the
 *  observed sequence rather than inferred from source layout. An optional error
 *  makes registerTool throw after recording the call. */
export function makeOrderRecordingPi(registerToolError?: Error): {
  pi: ExtensionAPI;
  calls: string[];
  registeredTools: ToolDefinition<never>[];
} {
  const calls: string[] = [];
  const registeredTools: ToolDefinition<never>[] = [];
  const pi = {
    registerFlag: (): void => {
      calls.push("registerFlag");
    },
    registerMessageRenderer: (): void => {
      calls.push("registerMessageRenderer");
    },
    registerTool: (t: ToolDefinition<never>): void => {
      calls.push("registerTool");
      if (registerToolError !== undefined) throw registerToolError;
      registeredTools.push(t);
    },
    registerCommand: (): void => {
      calls.push("registerCommand");
    },
    on: (event: string): void => {
      calls.push(`on:${event}`);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): unknown[] => [],
    sendUserMessage: (): void => {},
  };
  return { pi: pi as unknown as ExtensionAPI, calls, registeredTools };
}

export function fakeHostApi(): {
  hostApi: { registerTool: (t: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>) => void };
  calls: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>[];
} {
  const calls: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>[] = [];
  return {
    hostApi: {
      registerTool: (t): void => {
        calls.push(t);
      },
    },
    calls,
  };
}

export function fakeEntry(overrides: Partial<ActiveInvocationEntry> = {}): ActiveInvocationEntry {
  return {
    thetaAbort: new AbortController(),
    disposeBarrier: Promise.resolve(),
    shutdownReason: undefined,
    theta: "quality-loop",
    invocationId: "inv-1",
    ...overrides,
  };
}

export const ARGS: ThetaProgressParams = { message: "built 3 of 12", scope: "fix", done: 3, total: 12 };

/** Minimal node builder — only the fields a given assertion needs are set. */
export function node(overrides: Partial<InvocationNodeSnapshot> & Pick<InvocationNodeSnapshot, "invocationId" | "theta" | "startedAtMs">): InvocationNodeSnapshot {
  return {
    counters: { checkpoints: 0, loopIters: 0 },
    ...overrides,
  };
}

export function snapshotOf(nodes: readonly InvocationNodeSnapshot[], untracked = 0): ExecutionStatusSnapshot {
  return { nodes, untracked };
}

/** One recorded UI call, optionally timestamped for before/after-completion assertions. */
export interface RecordedCall {
  readonly ts?: number;
  readonly kind: "setStatus" | "setWorkingMessage" | "setWidget";
  readonly text: string | undefined;
  readonly lines: readonly string[] | undefined;
}

/**
 * A recording `ExtensionUIContext` double. Only `setStatus` / `setWidget` /
 * `setWorkingMessage` — the three members the RFC 0010 footer (L0) and
 * widget (L2) `StatusSink`s used to touch — are wired to record; every other
 * member is a harmless no-op mirroring the runner's own built-in no-op UI
 * context. Since RFC 0015 D6 retired those sinks (decision 4), the live
 * cells use this double in the ABSENCE direction: a drive must record ZERO
 * status renders on these members. These cells drive `mode: prompt` thetas
 * with no dialog/editor/theme surface. Working-message recording and
 * timestamps are opt-in.
 */
export function createRecordingUi(options: { readonly recordWorkingMessage?: boolean; readonly now: () => number }): {
  readonly calls: (RecordedCall & { readonly ts: number })[];
  readonly ui: ExtensionUIContext;
};
export function createRecordingUi(options?: { readonly recordWorkingMessage?: boolean }): {
  readonly calls: RecordedCall[];
  readonly ui: ExtensionUIContext;
};
export function createRecordingUi(options: {
  readonly recordWorkingMessage?: boolean;
  readonly now?: () => number;
} = {}): { readonly calls: RecordedCall[]; readonly ui: ExtensionUIContext } {
  const calls: RecordedCall[] = [];
  const ui = {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => {},
    onTerminalInput: () => () => {},
    setStatus: (_key: string, text: string | undefined) => {
      calls.push({ ...(options.now === undefined ? {} : { ts: options.now() }), kind: "setStatus", text, lines: undefined });
    },
    setWorkingMessage: (message?: string) => {
      if (options.recordWorkingMessage) {
        calls.push({ ...(options.now === undefined ? {} : { ts: options.now() }), kind: "setWorkingMessage", text: message, lines: undefined });
      }
    },
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setWidget: (_key: string, content: unknown, _options?: unknown) => {
      calls.push({
        ...(options.now === undefined ? {} : { ts: options.now() }),
        kind: "setWidget",
        text: undefined,
        lines: Array.isArray(content) ? (content as readonly string[]) : undefined,
      });
    },
    setFooter: () => {},
    setHeader: () => {},
    setTitle: () => {},
    custom: async <T>() => undefined as unknown as T,
    pasteToEditor: () => {},
    setEditorText: () => {},
    getEditorText: () => "",
    editor: async () => undefined,
    addAutocompleteProvider: () => {},
    setEditorComponent: () => {},
    getEditorComponent: () => undefined,
    theme: {} as ExtensionUIContext["theme"],
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: true }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => {},
  } as unknown as ExtensionUIContext;
  return { calls, ui };
}
