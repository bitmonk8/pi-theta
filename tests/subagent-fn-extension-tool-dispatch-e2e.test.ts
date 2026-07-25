// PIC-64 / FN-6 — `subagent fn` INLINE-BODY code-side extension-tool dispatch.
//
// PIC-64 classifies the inline `subagent fn` body as a THIRD dispatch context:
// the body runs in-process and off-session (its private conversation offers the
// model no tools), and its code-side extension-tool calls dispatch through the
// PROCESS's backing host session exactly as the enclosing theta's own code-side
// calls do — the user's live session in the parent (prompt-mode *Accepted cost*
// applying), the child's private, discarded session inside a subagent-root
// child. FN-6's isolation is scoped to the body's CONVERSATION (its queries,
// its transcript, its return value), not to the dispatch channel, so an inline
// body is NOT a no-rung context: registration tracks rung availability alone,
// and only a surfaces-absent host keeps the fail-closed
// `theta/load/extension-tool-unreachable` refusal.
//
// Four obligations are witnessed here:
//   1. (load, parent) a `mode: prompt` theta whose code-side extension-tool
//      call sits INSIDE a `subagent fn` inline body REGISTERS with zero
//      diagnostics when the host-loop surfaces are present — through the
//      SHIPPED composition root (`discoverAndComposeFixtures`);
//   2. (dispatch, parent leg) driving that theta lands the dispatch in the
//      PARENT's backing host session — the ops sequence (install [tool] →
//      switch to the bridge → send with settled armed → settled → restore) and
//      the model + active-set snapshot restore, mirroring
//      prompt-mode-extension-tool-reach-e2e.test.ts over the shared
//      `FakeHostLoopHost` fabricated-turn core;
//   3. (dispatch, child leg) the equivalent under the ACTIVE subagent-root
//      regime: the inline body's call dispatches through the child process's
//      own backing host session via the REAL `createProductionHostLoopDispatch`
//      wiring, and the tool text crosses the FN-6 boundary into the PIC-59
//      return envelope;
//   4. (load, no-rung) a surfaces-absent host still refuses the same theta
//      fail-closed with `theta/load/extension-tool-unreachable` naming the
//      tool — the refusal keys on rung availability, never on the enclosing
//      construct.
//
// Spec: pi-integration-contract/subagent.md PIC-64 (#pic-64,
// #subagent-host-loop-dispatch — the inline-body context and the accepted
// cost), functions.md FN-6 (#fn-6 — conversation-scoped isolation carve-out),
// diagnostics/code-registry-load.md (`theta/load/extension-tool-unreachable`).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ThetaFixture } from "../src/extension/factory";
import {
  composeExtensionInstance,
  discoverAndComposeFixtures,
} from "../src/extension/production-composition";
import {
  createProductionProducerDeps,
  type ProductionProducerInput,
} from "../src/extension/production-theta-producer";
import {
  BRIDGE_MODEL_ID,
  createProductionHostLoopDispatch,
} from "../src/extension/production-host-loop-dispatch";
import { EXTENSION_TOOL_UNREACHABLE_CODE } from "../src/runtime/host-loop-dispatch";
import { parseEnvelopeLine } from "../src/runtime/subagent-envelope";
import type { ExecutableHost } from "../src/runtime/subagent-launcher";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { FakeHostLoopHost } from "./helpers/fake-host-loop-host";

// --- The planted thetas ------------------------------------------------------

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * The inline-body acceptance theta: PROMPT mode, an extension tool in `tools:`,
 * and the code-side call to it INSIDE a `subagent fn` inline body. The body's
 * `?` unwraps the tool's Ok; the outer `?` unwraps the FN-6 boundary Result, so
 * the theta's final value is the tool text.
 */
const PARENT_FNCALL = theta(
  "---",
  "mode: prompt",
  "tools: my_tool",
  "---",
  "subagent fn probe() {",
  '  my_tool({ op: "write", n: 7 })?',
  "}",
  "probe()?",
);

/** The child-leg twin: `mode: subagent`, driven under the subagent-root regime. */
const CHILD_FNCALL = theta(
  "---",
  "mode: subagent",
  "tools: my_tool",
  "---",
  "subagent fn probe() {",
  '  my_tool({ op: "write", n: 7 })?',
  "}",
  "probe()?",
);

const MY_TOOL_SCHEMA = {
  type: "object",
  properties: { op: { type: "string" }, n: { type: "number" } },
  required: ["op"],
} as const;

// --- Fake parent host (parent leg; mirrors prompt-mode-extension-tool-reach-e2e) --

/**
 * The fake PARENT host: serves the shipped composition root's load pass (the
 * discovery/admission `pi` + `ctx` surfaces) AND simulates the user session's
 * host agent loop for the composition-built host-loop dispatch — the shared
 * fabricated-turn core (`FakeHostLoopHost`), with only the parent-leg load-pass
 * surfaces added. The loop it wraps IS the process's backing host session the
 * inline body's dispatch must land in.
 */
class FakeParentHost {
  readonly loop: FakeHostLoopHost;
  readonly notifications: string[] = [];
  readonly notes: string[] = [];

  constructor(readonly cwd: string) {
    this.loop = new FakeHostLoopHost((name, args) => ({
      content: [{ type: "text", text: `RAN:${name}:${JSON.stringify(args)}` }],
      isError: false,
    }));
  }

  get executorCalls(): readonly { name: string; args: unknown }[] {
    return this.loop.executorCalls;
  }

  get currentModelId(): string {
    return this.loop.currentModelId;
  }

  get activeTools(): readonly string[] {
    return this.loop.activeTools;
  }

  get pi(): ExtensionAPI {
    const loop = this.loop;
    return {
      getFlag: (): undefined => undefined,
      getCommands: (): readonly unknown[] => [],
      sendMessage: (message: { content?: unknown }): void => {
        if (typeof message.content === "string") {
          this.notes.push(message.content);
        }
      },
      registerMessageRenderer: (): void => {},
      getActiveTools: (): string[] => loop.getActiveTools(),
      setActiveTools: (names: string[]): void => loop.setActiveTools(names),
      // The extension-registered tool the mode-independent admission reads.
      getAllTools: (): readonly unknown[] => [
        {
          name: "my_tool",
          parameters: MY_TOOL_SCHEMA,
          sourceInfo: { scope: "user" },
        },
      ],
      registerProvider: (name: string, config: { streamSimple: unknown }): void =>
        loop.registerProvider(name, config),
      unregisterProvider: (name: string): void => loop.unregisterProvider(name),
      setModel: (model: Model<Api>): Promise<boolean> => loop.setModel(model),
      sendUserMessage: (content: string): void => loop.sendUserMessage(content),
      on: (event: string, handler: () => void): void => loop.on(event, handler),
    } as unknown as ExtensionAPI;
  }

  get ctx(): ExtensionContext {
    const host = this;
    const loop = this.loop;
    return {
      cwd: this.cwd,
      hasUI: true,
      get model(): Model<Api> {
        return loop.currentModel;
      },
      isIdle: (): boolean => loop.isIdle(),
      modelRegistry: {
        getAvailable: (): readonly unknown[] => [],
        find: (provider: string, id: string): Model<Api> | undefined =>
          loop.findRegisteredModel(provider, id),
      },
      sessionManager: {
        getEntries: (): readonly { type: string; message?: Record<string, unknown> }[] =>
          [...loop.entries],
        getLeafId: (): undefined => undefined,
      },
      ui: {
        notify: (message: string): void => {
          host.notifications.push(message);
        },
      },
    } as unknown as ExtensionContext;
  }

  /** The per-dispatch `ExtensionCommandContext` a slash dispatch would carry. */
  runCtx(): ExtensionCommandContext {
    const loop = this.loop;
    return {
      signal: undefined,
      cwd: this.cwd,
      get model(): Model<Api> {
        return loop.currentModel;
      },
      isIdle: (): boolean => loop.isIdle(),
      waitForIdle: (): Promise<void> => Promise.resolve(),
      modelRegistry: {
        getAvailable: (): readonly unknown[] => [],
        find: (provider: string, id: string): Model<Api> | undefined =>
          loop.findRegisteredModel(provider, id),
      },
      sessionManager: {
        getEntries: (): readonly { type: string; message?: Record<string, unknown> }[] =>
          [...loop.entries],
        getLeafId: (): undefined => undefined,
      },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionCommandContext;
  }
}

// --- Parent leg: load + dispatch through the shipped composition root ---------

let parentDir: string;
let parentHost: FakeParentHost;
let parentFixtures: readonly ThetaFixture[];

beforeAll(async () => {
  parentDir = mkdtempSync(join(tmpdir(), "theta-subfn-exttool-parent-"));
  const dir = join(parentDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "fncall.theta"), PARENT_FNCALL, "utf8");
  parentHost = new FakeParentHost(parentDir);
  parentFixtures = await discoverAndComposeFixtures(parentHost.pi, parentHost.ctx);
});

afterAll(() => {
  rmSync(parentDir, { recursive: true, force: true });
});

describe("PIC-64 inline-body context (parent leg) — a prompt-mode theta whose extension-tool code call sits inside a `subagent fn` body", () => {
  it("REGISTERS with zero diagnostics when the host-loop surfaces are present (the inline body is NOT a no-rung context)", () => {
    expect(
      parentFixtures.map((f) => f.slashName),
      "PIC-64: the inline `subagent fn` body dispatches through the process's " +
        "backing host session, so the theta must register when the parent " +
        "host-loop rung is establishable. Notifications: " +
        JSON.stringify(parentHost.notifications),
    ).toContain("fncall");
    // Zero diagnostics: no error toast fired (unknown-tool, unreachable, parse,
    // …) and no load-refusal note reached the note channel.
    expect(parentHost.notifications).toEqual([]);
    expect(parentHost.notes.join("\n")).not.toContain(EXTENSION_TOOL_UNREACHABLE_CODE);
    expect(parentHost.notes.join("\n")).not.toContain("theta/load");
    expect(parentHost.notes.join("\n")).not.toContain("theta/parse");
  });

  it("dispatching drives the tool through the PARENT's backing host session with verbatim args, then restores the model and active-set snapshot", async () => {
    const fixture = parentFixtures.find((f) => f.slashName === "fncall");
    expect(fixture, "the fncall fixture must have registered").toBeDefined();

    await (fixture as ThetaFixture).run("", parentHost.runCtx());

    // The USER-session host loop executed the tool exactly once, with the
    // code-supplied arguments verbatim (zero model tokens — the bridge authored
    // the `tool_use`); the inline body's FN-6 isolation did not reroute or
    // suppress the dispatch.
    expect(parentHost.executorCalls).toEqual([
      { name: "my_tool", args: { op: "write", n: 7 } },
    ]);
    // Ops sequence in the PARENT's session (PIC-64 (a)–(f)): install [tool] →
    // switch to the bridge → send (settled armed before it) → settled → restore.
    const op = parentHost.loop.op;
    const iSetActive = op.indexOf("setActiveTools:[my_tool]");
    const iSetBridge = op.indexOf(`setModel:${BRIDGE_MODEL_ID}`);
    const iSend = op.indexOf("send");
    const iSettled = op.indexOf("settled");
    const iRestoreModel = op.lastIndexOf("setModel:real-model");
    expect(iSetActive).toBeGreaterThanOrEqual(0);
    expect(iSetActive).toBeLessThan(iSetBridge);
    expect(iSetBridge).toBeLessThan(iSend);
    expect(iSend).toBeLessThan(iSettled);
    expect(iSettled).toBeLessThan(iRestoreModel);
    // The bridge model is NOT left installed on the user's session…
    expect(parentHost.currentModelId).toBe("real-model");
    // …and the ambient active set is restored to its pre-dispatch snapshot.
    expect(parentHost.activeTools).toEqual(["ambient-a", "ambient-b"]);
  });
});

// --- Child leg: the subagent-root regime backs the same inline-body dispatch --

/** A trivially-wired diagnostic sink + resolving `model:` matcher for the parse. */
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

/** Parse a `.theta` source string through the production parser. */
function parseChildTheta(src: string): ThetaDocument {
  return parseThetaDocument(
    { path: "worker.theta", bytes: new TextEncoder().encode(src) },
    parseDeps(),
  );
}

class RecordingCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: new RecordingCheckpoint(),
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator: { compile: () => ({ validate: () => ({ ok: true as const }) }) },
  } as unknown as RuntimeRoot;
}

function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI;
}

function childCtx(): ExtensionCommandContext {
  return {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
    // The child's own (empty) host session — the regime drives against it.
    sessionManager: { getEntries: () => [], getLeafId: () => undefined },
  } as unknown as ExtensionCommandContext;
}

describe("PIC-64 inline-body context (child leg) — the subagent-root regime's own host session backs the inline body's dispatch", () => {
  it("the body's extension-tool call dispatches through the CHILD's backing host session (real host-loop wiring), restores it, and the tool text crosses the FN-6 boundary into the PIC-59 envelope", async () => {
    const parsed = parseChildTheta(CHILD_FNCALL);
    expect(
      parsed.diagnostics.filter((d) => d.severity === "error"),
      "the child-leg fixture theta must parse cleanly",
    ).toEqual([]);

    // The CHILD's backing host session: the same shared fabricated-turn core,
    // behind the REAL `createProductionHostLoopDispatch` wiring the composition
    // root ships (PIC-64 (a)–(f)).
    const loop = new FakeHostLoopHost((name, args) => ({
      content: [{ type: "text", text: `RAN:${name}:${JSON.stringify(args)}` }],
      isError: false,
    }));
    const lines: string[] = [];
    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootDouble(),
      modelRegistry: {
        getAvailable: () => [{ id: "claude-test", provider: "anthropic" }],
      } as unknown as ModelRegistry,
      subagentParentEnv: {},
      // The ACTIVE subagent-root regime: this process IS the spawned child.
      subagentRootRegime: { active: true, slug: "worker" },
      emitResultEnvelope: (line: string) => lines.push(line),
      hostLoopDispatch: createProductionHostLoopDispatch(loop.host()),
    } as ProductionProducerInput);

    // The frozen callable-set snapshot holds `my_tool` as an execute-less
    // extension entry (the public API strips `execute`), so the code-side call
    // classifies as extension-shaped and routes through the PIC-64 ladder.
    const thetaInput = {
      slashName: "worker",
      sourcePath: "/theta/worker.theta",
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      callableSet: {
        entries: new Map([
          ["my_tool", { kind: "pi-tool", toolDefinition: { toolName: "my_tool" } }],
        ]),
      },
    } as unknown as ThetaCompositionInput;
    expect(
      deps.isSubagentRootFor?.(thetaInput),
      "the regime marks this process as the root child for the theta",
    ).toBe(true);

    await deps.driveSubagentRootRegime!({
      theta: thetaInput,
      args: "",
      ctx: childCtx(),
      thetaAbort: new AbortController(),
    });

    // The CHILD-session host loop executed the tool once, args verbatim.
    expect(loop.executorCalls).toEqual([{ name: "my_tool", args: { op: "write", n: 7 } }]);
    // Ops sequence in the child's session, with the model + active-set snapshot
    // restored (never left on the bridge).
    const op = loop.op;
    const iSetActive = op.indexOf("setActiveTools:[my_tool]");
    const iSetBridge = op.indexOf(`setModel:${BRIDGE_MODEL_ID}`);
    const iSend = op.indexOf("send");
    const iSettled = op.indexOf("settled");
    const iRestoreModel = op.lastIndexOf("setModel:real-model");
    expect(iSetActive).toBeGreaterThanOrEqual(0);
    expect(iSetActive).toBeLessThan(iSetBridge);
    expect(iSetBridge).toBeLessThan(iSend);
    expect(iSend).toBeLessThan(iSettled);
    expect(iSettled).toBeLessThan(iRestoreModel);
    expect(loop.currentModelId).toBe("real-model");
    expect(loop.activeTools).toEqual(["ambient-a", "ambient-b"]);

    // FN-6 return + PIC-59: the tool text is the body's final value, crosses
    // the subagent-fn boundary as the Ok payload, and lands in the envelope.
    expect(lines).toHaveLength(1);
    const envelope = parseEnvelopeLine(lines[0]!.trimEnd());
    expect(envelope.kind).toBe("ok");
    if (envelope.kind === "ok") {
      expect(envelope.value).toBe(`RAN:my_tool:${JSON.stringify({ op: "write", n: 7 })}`);
    }
  });
});

// --- No-rung host: the refusal survives, keyed on rung availability alone -----

/** An executable host whose rung 1 resolves (a runnable entry point exists). */
function resolvingHost(): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}

describe("PIC-64 rung 3 — a surfaces-absent host still refuses the inline-body code call fail-closed", () => {
  let noRungDir: string;

  beforeAll(() => {
    noRungDir = mkdtempSync(join(tmpdir(), "theta-subfn-exttool-norung-"));
    const dir = join(noRungDir, ".pi", "theta");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "fncall.theta"), PARENT_FNCALL, "utf8");
  });

  afterAll(() => {
    rmSync(noRungDir, { recursive: true, force: true });
  });

  it("refuses with theta/load/extension-tool-unreachable naming the tool (the walk covers `subagent fn` bodies; no silent registration)", async () => {
    const noteContent: string[] = [];
    // A host WITHOUT the host-loop dispatch Pi surfaces (no registerProvider /
    // unregisterProvider / setModel): `probeHostLoopSurfaces` fails, no rung is
    // establishable, and the ladder is fail-closed.
    const pi = {
      getFlag: (): undefined => undefined,
      getCommands: (): readonly unknown[] => [],
      sendMessage: (message: { content?: unknown }): void => {
        if (typeof message.content === "string") {
          noteContent.push(message.content);
        }
      },
      sendUserMessage: (): void => {},
      getActiveTools: (): readonly string[] => [],
      setActiveTools: (): void => {},
      getAllTools: (): readonly unknown[] => [
        { name: "my_tool", parameters: MY_TOOL_SCHEMA, sourceInfo: { scope: "user" } },
      ],
      registerMessageRenderer: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: noRungDir,
      hasUI: true,
      model: { id: "claude-test", provider: "anthropic", api: "anthropic-messages" },
      isIdle: (): boolean => true,
      modelRegistry: {
        getAvailable: (): readonly unknown[] => [
          { id: "claude-test", provider: "anthropic", api: "anthropic-messages" },
        ],
        find: (): undefined => undefined,
      },
      sessionManager: { getEntries: (): readonly unknown[] => [] },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionContext;

    const wiring = await composeExtensionInstance(pi, ctx, {
      subagentExecutableHost: resolvingHost(),
    });

    expect(
      wiring.thetas.map((t) => t.slashName),
      "with NO establishable rung the inline-body code call must refuse to " +
        "register — notes: " + JSON.stringify(noteContent),
    ).not.toContain("fncall");
    // The refusal is the pinned fail-closed rung-3 diagnostic, attributed to the
    // refusing theta (one line carrying the file, the code, and the tool name) —
    // NOT an admission unknown-tool (the registry name resolves mode-independently).
    const refusalLines = noteContent
      .flatMap((note) => note.split("\n"))
      .filter(
        (line) =>
          line.includes("fncall.theta") &&
          line.includes(EXTENSION_TOOL_UNREACHABLE_CODE),
      );
    expect(
      refusalLines.length,
      "fncall.theta itself must refuse with the extension-tool-unreachable code — " +
        "notes: " + JSON.stringify(noteContent),
    ).toBeGreaterThan(0);
    expect(refusalLines.join("\n")).toContain("my_tool");
    expect(noteContent.join("\n")).not.toContain("unknown Pi tool 'my_tool'");
  });
});
