import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../src/extension/production-loom-producer";
import type {
  LoomCompositionInput,
  ConversationBindInput,
} from "../src/extension/loom-composition-producer";
import { executeBody } from "../src/runtime/statement-executor";
import { ToolReturnShapeDefectError } from "../src/runtime/tool-call-off-surface";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import type { LoomValue } from "../src/runtime/value";
import type {
  CallExpr,
  Expr,
  LoomBody,
  ObjectExpr,
} from "../src/parser/loom-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type {
  CallableSetSnapshot,
  ResolvedCallable,
} from "../src/parser/callable-set";
import type {
  SystemNoteChannelDeps,
  SystemNoteDetails,
} from "../src/extension/system-note-channel";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// A code-side tool-return-shape defect (`routeToolReturnShape` →
// `loom/runtime/internal-error{tool-return-shape}`) is a RUNTIME-DEFECT surface
// (errors-and-results/error-model.md §"Runtime panics"). The lowering seam emits
// that diagnostic on the injected `ToolLoweringSink`; production now threads the
// real `loom-system-note` delivery channel into the producer (rather than a
// `noopSink()`), so the diagnostic reaches the operator on the SAME channel +
// group-B `details: { diagnostics: [Diagnostic] }` shape the load-phase pre-eval
// diagnostics use — instead of being discarded. The behavioural throw
// (`ToolReturnShapeDefectError`) is unchanged; a CONFORMING return still touches
// the sink on no channel (hot-path clean).

// --- AST + double helpers --------------------------------------------------

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function strExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

/** A single object-literal argument `{ <name>: <value> }` (the tool-call convention). */
function objArg(name: string, value: string): ObjectExpr {
  return {
    kind: "object",
    typeName: null,
    fields: [{ name, value: strExpr(value) }],
    range: span(),
  };
}

function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

function body(tail: Expr | null): LoomBody {
  return { statements: [], tail };
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: {
      newInvocationId: () => "inv-1",
      newToolCallId: () => "tc-1",
    },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

/** A recording `loom-system-note` delivery channel (the runtime-defect surface). */
interface RecordingChannel {
  readonly channel: SystemNoteChannelDeps;
  readonly notes: {
    readonly content: string;
    readonly display: boolean;
    readonly details: SystemNoteDetails;
  }[];
}

function recordingChannel(): RecordingChannel {
  const notes: RecordingChannel["notes"] = [];
  const channel: SystemNoteChannelDeps = {
    pi: {
      sendMessage: (message): void => {
        notes.push({
          content: message.content,
          display: message.display,
          details: message.details,
        });
      },
    },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  return { channel, notes };
}

function producer(
  resolvePiTool: (name: string) => PiToolDispatch | undefined,
  systemNote?: SystemNoteChannelDeps,
) {
  return createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    resolvePiTool,
    ...(systemNote !== undefined ? { systemNote } : {}),
  });
}

/** A `pi-tool` snapshot entry whose held dispatch resolves `envelope`. */
function piToolEntry(
  toolName: string,
  envelope: AgentToolResultEnvelope,
): ResolvedCallable {
  const dispatch: PiToolDispatch = {
    toolName,
    execute: (): Promise<AgentToolResultEnvelope> => Promise.resolve(envelope),
  };
  return { kind: "pi-tool", toolDefinition: dispatch };
}

function snapshot(
  entries: readonly (readonly [string, ResolvedCallable])[],
): CallableSetSnapshot {
  return Object.freeze({ entries: new Map(entries) });
}

function loomCalling(callee: string, set: CallableSetSnapshot): LoomCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" };
  return {
    slashName: "demo",
    sourcePath: "/looms/demo.loom",
    frontmatter,
    body: body(callExpr(callee, [objArg("path", "docs/x")])),
    callableSet: set,
  };
}

async function runBody(
  deps: ReturnType<typeof producer>,
  loom: LoomCompositionInput,
): Promise<LoomValue> {
  const bindInput: ConversationBindInput = { loom, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(loom.body, binding.executeDeps);
  const outer = execution.result;
  if (!outer.present || outer.value === undefined) {
    throw new Error("body produced no final value");
  }
  return outer.value;
}

describe("tool-return-shape internal-error diagnostic reaches the real loom-system-note channel in production", () => {
  it("a non-conforming tool return surfaces its loom/runtime/internal-error diagnostic on the loom-system-note channel (group-B diagnostics shape)", async () => {
    const rec = recordingChannel();
    // A resolved envelope missing `text` on its `type:"text"` entry is a
    // non-conforming return shape (`entry-missing-text`) — the defect surface.
    const malformed = { content: [{ type: "text" }] } as unknown as AgentToolResultEnvelope;
    const set = snapshot([["read", piToolEntry("read", malformed)]]);
    const deps = producer(() => undefined, rec.channel);

    // The defect surfaces as the runtime-defect THROW (off the CodeToolError
    // surface, not a bound value) — behaviour is unchanged by the sink wiring.
    let thrown: unknown;
    try {
      await runBody(deps, loomCalling("read", set));
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ToolReturnShapeDefectError);

    // The diagnostic is no longer discarded: exactly one group-B
    // `details: { diagnostics: [Diagnostic] }` note reached the operator channel.
    expect(rec.notes).toHaveLength(1);
    const note = rec.notes[0]!;
    expect(note.display).toBe(true);
    const details = note.details as { readonly diagnostics?: readonly unknown[] };
    expect(details.diagnostics).toHaveLength(1);
    const diag = details.diagnostics![0] as {
      readonly code: string;
      readonly details?: { readonly kind?: string; readonly tool_name?: string };
    };
    expect(diag.code).toBe("loom/runtime/internal-error");
    expect(diag.details?.kind).toBe("tool-return-shape");
    expect(diag.details?.tool_name).toBe("read");
  });

  it("a CONFORMING tool return emits NO note (the hot path never touches the sink)", async () => {
    const rec = recordingChannel();
    const conforming: AgentToolResultEnvelope = { content: [{ type: "text", text: "ok" }] };
    const set = snapshot([["read", piToolEntry("read", conforming)]]);
    const deps = producer(() => undefined, rec.channel);

    const value = await runBody(deps, loomCalling("read", set));

    expect((value as { readonly ok?: boolean }).ok).toBe(true);
    expect(rec.notes).toEqual([]);
  });

  it("a non-production harness (no systemNote channel) still throws the defect carrier and surfaces no note", async () => {
    const malformed = { content: [{ type: "text" }] } as unknown as AgentToolResultEnvelope;
    const set = snapshot([["read", piToolEntry("read", malformed)]]);
    // No systemNote threaded — the sink no-ops, matching the pre-wiring behaviour.
    const deps = producer(() => undefined);

    let thrown: unknown;
    try {
      await runBody(deps, loomCalling("read", set));
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ToolReturnShapeDefectError);
  });
});
