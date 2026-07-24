// SUBAG-2 (model-callable `.theta`) under RFC-0005 — the callable set crosses the
// process boundary as the child's `--tools` allowlist + a marshalled content
// hash, not as an in-process `customTools` `defineTool`.
//
// This file pins two halves:
//
//   (A) the extracted, deterministic model-driven core `lowerModelDrivenThetaCall`
//       — the object-arg → positional mapping in `params:` DECLARATION ORDER,
//       the ceiling-#4 model-arg depth block (before any spawn), the `Result`
//       lowering (Ok → text, Err → `isError`), the tool-calls.md:30 setup-throw
//       translation, the `HostFatal` re-raise (NOCEIL-3), and re-entrancy. This
//       remains a pure, deterministic seam (the code-side `.theta`-callable
//       lowering) independent of the process boundary.
//   (B) the RFC-0005 launch contract through the REAL `spawnSubagentConversation`
//       over a fake process launcher: the `.theta` callable name appears in the
//       child's `--tools` allowlist (subagent.md #subagent-tools-allowlist-
//       suppression) and its transitive-closure content hash is marshalled to
//       the child via the `PI_THETA_SUBAGENT_CALLABLE_HASHES` env carrier
//       (#subagent-theta-callable-hash). No executable customTool crosses the
//       boundary; the former model `tool_use`-through-`#driveCallee` parent-side
//       dispatch is retired — the child's own model owns those tool calls
//       (PIC-42).
//
// Spec: tool-calls.md (SHARED callable set; :30 setup-throw), hard-ceilings
// ceiling #4 (model-driven row), pi-integration-contract/subagent.md
// (#subagent-launch-contract, #subagent-theta-callable-hash, PIC-42).

import { afterEach, describe, expect, it, vi } from "vitest";

// RFC-0005 re-base: the subagent bind spawns a child `pi` process, so the (B)
// integration suite drives the REAL `launchSubagentChild` over a fake process
// launcher and asserts the LAUNCH CONTRACT — the `--tools` allowlist entry for
// the `.theta` callable + the marshalled content-hash env carrier
// (`PI_THETA_SUBAGENT_CALLABLE_HASHES`) — in place of the retired in-process
// `customTools`-on-`createAgentSession` mechanism (subagent.md
// #subagent-launch-contract / #subagent-theta-callable-hash).
import {
  fakeExecutableHost,
  makeFakeJsonChildLauncher,
} from "./helpers/fake-json-child";
import { SUBAGENT_CALLABLE_HASHES_ENV } from "../src/runtime/subagent-callable-hash";

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
  createProductionProducerDeps,
  lowerModelDrivenThetaCall,
  type ModelDrivenThetaCall,
} from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
  ThetaProducerDeps,
} from "../src/extension/theta-composition-producer";
import { executeBody } from "../src/runtime/statement-executor";
import { parseExpressionSource } from "../src/parser/theta-document";
import { makeErr, makeOk, type ThetaValue, type ResultValue } from "../src/runtime/value";
import { HostFatal } from "../src/runtime/runtime-panics";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import type { CallableSetSnapshot } from "../src/parser/callable-set";
import type { ThetaBody } from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  InvokeInfraCauseError,
  type InvokeInfraCause,
} from "../src/runtime/query-error";
import { SUBAGENT_MODEL_UNRESOLVED_CODE } from "../src/runtime/subagent-isolation";

// =============================================================================
// (A) The deterministic model-driven core — scripted collaborators, no SDK.
// =============================================================================

/** A `ModelDrivenThetaCall` recording the positional `argValues` it was driven with. */
function recordingSpec(
  paramOrder: readonly string[],
  drive: (argValues: readonly ThetaValue[]) => Promise<ResultValue>,
): { spec: ModelDrivenThetaCall; driven: { argValues: readonly ThetaValue[] }[]; setupThrows: unknown[] } {
  const driven: { argValues: readonly ThetaValue[] }[] = [];
  const setupThrows: unknown[] = [];
  const spec: ModelDrivenThetaCall = {
    paramOrder,
    driveCallee: (argValues) => {
      driven.push({ argValues });
      return drive(argValues);
    },
    onSetupThrow: (thrown) => {
      setupThrows.push(thrown);
      const message = (thrown as { message?: unknown }).message;
      return {
        text: `theta callee aborted with internal error: ${String(message)}`,
        isError: true,
      };
    },
  };
  return { spec, driven, setupThrows };
}

describe("SUBAG-2 (A) — lowerModelDrivenThetaCall model-driven core", () => {
  const signal = new AbortController().signal;

  it("maps the model's object arguments to positional argValues in params DECLARATION ORDER (Ok → text)", async () => {
    const { spec, driven } = recordingSpec(["first", "second", "third"], () =>
      Promise.resolve(makeOk("DONE")),
    );
    // The model emits the fields in a DIFFERENT order than declared.
    const lowered = await lowerModelDrivenThetaCall(
      { third: "C", first: "A", second: "B" },
      spec,
      signal,
    );
    expect(driven).toHaveLength(1);
    expect(driven[0]!.argValues).toEqual(["A", "B", "C"]);
    expect(lowered).toEqual({ text: "DONE", isError: false });
  });

  it("binds a missing model argument to null (declaration order preserved)", async () => {
    const { spec, driven } = recordingSpec(["a", "b"], () => Promise.resolve(makeOk("X")));
    await lowerModelDrivenThetaCall({ a: "A" }, spec, signal);
    expect(driven[0]!.argValues).toEqual(["A", null]);
  });

  it("lowers an Ok(non-string) value to its JSON form", async () => {
    const { spec } = recordingSpec(["p"], () => Promise.resolve(makeOk({ k: 1, v: [true] })));
    const lowered = await lowerModelDrivenThetaCall({ p: 0 }, spec, signal);
    expect(lowered).toEqual({ text: '{"k":1,"v":[true]}', isError: false });
  });

  it("lowers an Err(Result) to an isError tool-result carrying the error message", async () => {
    const err = makeErr({ kind: "invoke_callee", message: "callee said no" } as unknown as ThetaValue);
    const { spec } = recordingSpec(["p"], () => Promise.resolve(err));
    const lowered = await lowerModelDrivenThetaCall({ p: 1 }, spec, signal);
    expect(lowered.isError).toBe(true);
    expect(lowered.text).toBe("callee said no");
  });

  it("blocks a depth-6 model argument by ceiling #4 BEFORE the callee spawns", async () => {
    const { spec, driven } = recordingSpec(["deep"], () => Promise.resolve(makeOk("never")));
    // `{ deep: { a: { b: { c: { d: { e: 1 } } } } } }` — the argument document is
    // depth 6 (object → deep → a → b → c → d), exceeding the ≤5 cap.
    const depth6 = { deep: { a: { b: { c: { d: { e: 1 } } } } } };
    const lowered = await lowerModelDrivenThetaCall(depth6, spec, signal);
    expect(lowered.isError).toBe(true);
    expect(lowered.text).toContain("depth");
    // CIO-3: the callee is NEVER driven on a depth breach.
    expect(driven).toHaveLength(0);
  });

  it("translates a non-HostFatal setup/body throw via onSetupThrow (isError, callee never re-raised)", async () => {
    const { spec, setupThrows } = recordingSpec(["p"], () =>
      Promise.reject(new Error("spawn setup exploded")),
    );
    const lowered = await lowerModelDrivenThetaCall({ p: 1 }, spec, signal);
    expect(setupThrows).toHaveLength(1);
    expect((setupThrows[0] as Error).message).toBe("spawn setup exploded");
    expect(lowered.isError).toBe(true);
    expect(lowered.text).toContain("internal error: spawn setup exploded");
  });

  it("re-raises a HostFatal (NOCEIL-3) and does NOT route it through onSetupThrow", async () => {
    const { spec, setupThrows } = recordingSpec(["p"], () =>
      Promise.reject(new HostFatal("fatal host condition")),
    );
    await expect(lowerModelDrivenThetaCall({ p: 1 }, spec, signal)).rejects.toBeInstanceOf(
      HostFatal,
    );
    expect(setupThrows).toHaveLength(0);
  });

  it("is re-entrant: two concurrent calls dispatch through independent collaborators without cross-talk", async () => {
    // Each call resolves its own callee value after a microtask hop, so the two
    // are genuinely interleaved on the event loop.
    const specA = recordingSpec(["x"], (args) =>
      Promise.resolve().then(() => makeOk(`A:${String(args[0])}`)),
    );
    const specB = recordingSpec(["x"], (args) =>
      Promise.resolve().then(() => makeOk(`B:${String(args[0])}`)),
    );
    const [a, b] = await Promise.all([
      lowerModelDrivenThetaCall({ x: "1" }, specA.spec, signal),
      lowerModelDrivenThetaCall({ x: "2" }, specB.spec, signal),
    ]);
    expect(a).toEqual({ text: "A:1", isError: false });
    expect(b).toEqual({ text: "B:2", isError: false });
    expect(specA.driven[0]!.argValues).toEqual(["1"]);
    expect(specB.driven[0]!.argValues).toEqual(["2"]);
  });
});

// =============================================================================
// (B) Integration through the REAL spawnSubagentConversation (SDK mocked).
// =============================================================================

class RecordingCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootDouble(checkpoint?: Checkpoint): RuntimeRoot {
  return {
    checkpoint: checkpoint ?? new RecordingCheckpoint(),
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    // The model pre-flight (`queryChildResolvedModel`) + child teardown time on
    // the injected `Clock`; wire the ambient timers so the seams resolve.
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  } as unknown as RuntimeRoot;
}

function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {} } as unknown as ExtensionAPI;
}

const USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function textReply(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: USAGE,
    stopReason: "stop",
    timestamp: 0,
  };
}

function toolCallReply(name: string, id: string, args: Record<string, unknown>): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name, arguments: args }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: USAGE,
    stopReason: "toolUse",
    timestamp: 0,
  };
}

/**
 * A parent subagent theta whose callable set exposes one `.theta` callee. Defaults
 * to a bare-basename `child` → `./child.theta`; pass `presentedName` / `calleePath`
 * to model a renamed (`as foo`) or hyphenated (`./my-tool.theta` → `my_tool`)
 * entry (Gap-2). The frozen entry carries the authoritative `calleePath` exactly
 * as `resolveCallableSet` records it from the `tools:` `spec`.
 */
function parentTheta(
  body: ThetaBody,
  opts?: { readonly presentedName?: string; readonly calleePath?: string },
): ThetaCompositionInput {
  const presentedName = opts?.presentedName ?? "child";
  const calleePath = opts?.calleePath ?? "./child.theta";
  const entries = new Map([
    [
      presentedName,
      {
        kind: "theta" as const,
        mode: "subagent" as const,
        calleePath,
        callee: undefined,
        // #subagent-theta-callable-hash: the LOAD-TIME transitive-closure hash
        // the resolution snapshot captured (deterministic, keyed on the callee
        // path). The launch marshals THIS stored value — never a fresh
        // spawn-time re-read — so the launch-contract assertions witness it.
        closureHash: `sha256:${calleePath}`,
      },
    ],
  ]);
  const callableSet: CallableSetSnapshot = { entries };
  const frontmatter = {
    mode: "subagent",
    tools: [calleePath === `./${presentedName}.theta` ? calleePath : `${calleePath} as ${presentedName}`],
  } as unknown as ParsedFrontmatter;
  return {
    slashName: "parent",
    sourcePath: "/theta/parent.theta",
    frontmatter,
    body,
    callableSet,
  } as unknown as ThetaCompositionInput;
}

/**
 * The child subagent callee `parseCallee` resolves — params (a, b) + a body. The
 * default body is the literal `"CHILD-DONE"` (an `Ok` final value); pass
 * `tailSource` to inject a panicking body (Gap-1), e.g. `"[][0]"` (an index
 * out-of-bounds `ThetaPanic` in the callee subtree).
 */
function childCallee(opts?: { readonly tailSource?: string }): ThetaCompositionInput {
  const frontmatter = {
    mode: "subagent",
    description: "Echo child",
    params: {
      loweredSchema: {
        type: "object",
        properties: { a: { type: "string" }, b: { type: "string" } },
        required: ["a", "b"],
      },
      defaultedFields: [],
      fields: [
        { wireName: "a", type: "string", hasDefault: false },
        { wireName: "b", type: "string", hasDefault: false },
      ],
    },
  } as unknown as ParsedFrontmatter;
  return {
    slashName: "child",
    sourcePath: "/theta/child.theta",
    frontmatter,
    body: {
      statements: [],
      tail: parseExpressionSource(opts?.tailSource ?? '"CHILD-DONE"'),
    },
  } as unknown as ThetaCompositionInput;
}

function queryBody(): ThetaBody {
  return {
    statements: [],
    tail: {
      kind: "query",
      schema: null,
      template: "do the thing",
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } },
    },
  } as unknown as ThetaBody;
}

function makeParentDeps(
  parseCalleeSpy: { calls: string[] },
  opts?: {
    readonly pi?: ExtensionAPI;
    readonly checkpoint?: Checkpoint;
    readonly childTailSource?: string;
    readonly emitDiagnostic?: (diagnostic: Diagnostic) => void;
  },
): { deps: ThetaProducerDeps; launcher: ReturnType<typeof makeFakeJsonChildLauncher> } {
  const launcher = makeFakeJsonChildLauncher();
  const deps = createProductionProducerDeps({
    pi: opts?.pi ?? noopPi(),
    root: rootDouble(opts?.checkpoint),
    modelRegistry: {
      getApiKeyAndHeaders: () => Promise.resolve({ ok: false }),
    } as unknown as ModelRegistry,
    parseCallee: (_caller: string | undefined, calleePath: string) => {
      parseCalleeSpy.calls.push(calleePath);
      const childOpts =
        opts?.childTailSource !== undefined ? { tailSource: opts.childTailSource } : undefined;
      return Promise.resolve(childCallee(childOpts));
    },
    subagentSpawn: launcher.spawn,
    subagentExecutableHost: fakeExecutableHost(),
    subagentParentEnv: {},
    subagentParentPid: 4242,
    ...(opts?.emitDiagnostic !== undefined ? { emitDiagnostic: opts.emitDiagnostic } : {}),
  });
  return { deps, launcher };
}

function parentBindInput(theta: ThetaCompositionInput): ConversationBindInput {
  const ctx = {
    // A resolved `Model`-like handle; the fake child reports the matching model
    // so the PIC-40 inherited-model pre-flight passes.
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
  } as unknown as ExtensionCommandContext;
  return { theta, args: "", ctx, thetaAbort: new AbortController() };
}

/** The child `--tools` allowlist from a recorded fake spawn's argv. */
function toolsAllowlist(args: readonly string[]): readonly string[] {
  const idx = args.indexOf("--tools");
  if (idx < 0 || idx + 1 >= args.length) {
    return [];
  }
  return (args[idx + 1] as string).split(",").filter((name) => name.length > 0);
}

/** The marshalled callable-hash map from a recorded fake spawn's env carrier. */
function marshalledHashes(env: Record<string, string | undefined>): Record<string, string> {
  const raw = env[SUBAGENT_CALLABLE_HASHES_ENV];
  return raw === undefined ? {} : (JSON.parse(raw) as Record<string, string>);
}

describe("SUBAG-2 (B) — RFC-0005 launch contract: `.theta` callable → `--tools` allowlist + marshalled hash", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("the `.theta` callable appears in the child's `--tools` allowlist (no executable customTool crosses the boundary)", async () => {
    const { deps, launcher } = makeParentDeps({ calls: [] });
    await deps.spawnSubagentConversation(parentBindInput(parentTheta(queryBody())));

    // subagent.md #subagent-launch-contract / #subagent-tools-allowlist-suppression:
    // exactly one child spawned, with the `.theta` callable name in `--tools`.
    expect(launcher.spawns).toHaveLength(1);
    const spawn = launcher.spawns[0]!;
    expect(toolsAllowlist(spawn.args)).toContain("child");
    // The child resolves the `.theta` by name against its OWN registry; no
    // `customTools` / `defineTool` executable definition crosses the boundary.
    expect(spawn.args).not.toContain("--no-tools");
  });

  it("marshals the `.theta` callable's transitive-closure content hash via the env carrier (not argv)", async () => {
    const { deps, launcher } = makeParentDeps({ calls: [] });
    await deps.spawnSubagentConversation(parentBindInput(parentTheta(queryBody())));

    // #subagent-theta-callable-hash: the child verifies each hash after its own
    // parse; the parent marshals it on the env carrier keyed by presented name.
    const hashes = marshalledHashes(launcher.spawns[0]!.env);
    expect(hashes["child"]).toBe("sha256:./child.theta");
    // The hash rides on env, NOT argv (kept off the visible command line / `--tools`).
    expect(launcher.spawns[0]!.args.join(" ")).not.toContain("sha256:");
  });

  it("an empty callable set maps to `--no-tools` (empty ≠ omission)", async () => {
    const { deps, launcher } = makeParentDeps({ calls: [] });
    const theta = {
      slashName: "bare",
      sourcePath: "/theta/bare.theta",
      frontmatter: { mode: "subagent" },
      body: queryBody(),
      callableSet: { entries: new Map() },
    } as unknown as ThetaCompositionInput;
    await deps.spawnSubagentConversation(parentBindInput(theta));

    // subagent.md #subagent-tools-allowlist-suppression: `tools: []` maps to
    // `--no-tools` (empty ≠ omission — omission would re-enable Pi's built-ins).
    expect(launcher.spawns[0]!.args).toContain("--no-tools");
    expect(launcher.spawns[0]!.args).not.toContain("--tools");
  });
});

describe("Gap-2 (B) — renamed / hyphenated `.theta` callees carry their real path into the launch contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a RENAMED entry `./child.theta as helper` is allowlisted as `helper` and hash-keyed by its presented name", async () => {
    const parseCalleeSpy = { calls: [] as string[] };
    const { deps, launcher } = makeParentDeps(parseCalleeSpy);
    const theta = parentTheta(queryBody(), { presentedName: "helper", calleePath: "./child.theta" });
    await deps.spawnSubagentConversation(parentBindInput(theta));

    // Presented under the renamed name in `--tools`, dispatchable to the REAL
    // callee path (`./child.theta`), never `./helper.theta`.
    expect(toolsAllowlist(launcher.spawns[0]!.args)).toContain("helper");
    // The hash is keyed by the presented name but computed over the REAL callee
    // path (`./child.theta`), never a `./helper.theta` basename re-derivation.
    expect(marshalledHashes(launcher.spawns[0]!.env)["helper"]).toBe("sha256:./child.theta");
    void parseCalleeSpy;
  });

  it("a HYPHENATED entry `./my-tool.theta` is allowlisted as `my_tool` and hash-keyed by its presented name", async () => {
    const parseCalleeSpy = { calls: [] as string[] };
    const { deps, launcher } = makeParentDeps(parseCalleeSpy);
    const theta = parentTheta(queryBody(), { presentedName: "my_tool", calleePath: "./my-tool.theta" });
    await deps.spawnSubagentConversation(parentBindInput(theta));

    expect(toolsAllowlist(launcher.spawns[0]!.args)).toContain("my_tool");
    // The hyphenated real path is read from the snapshot's `calleePath`, NOT the
    // basename re-derivation `./my_tool.theta`.
    expect(marshalledHashes(launcher.spawns[0]!.env)["my_tool"]).toBe("sha256:./my-tool.theta");
    void parseCalleeSpy;
  });
});

describe("#subagent-theta-callable-hash — the LOAD-captured hash is marshalled, not a fresh spawn-time re-read", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marshals the STORED load-time closure hash even when the on-disk source diverged after load", async () => {
    const { deps, launcher } = makeParentDeps({ calls: [] });
    // The frozen callable-set entry carries the hash captured at LOAD
    // (`parentTheta` stores `sha256:./child.theta`). Simulate an edit AFTER load
    // but BEFORE spawn by overwriting the on-disk bytes the callee would now
    // hash to — the launch MUST still marshal the stored load-time value, so the
    // child's own recompute-and-compare detects the divergence and refuses.
    const theta = parentTheta(queryBody());
    const loadTimeEntry = theta.callableSet!.entries.get("child")!;
    // Sanity: the stored hash is the load-captured value.
    expect((loadTimeEntry as { closureHash?: string }).closureHash).toBe(
      "sha256:./child.theta",
    );
    await deps.spawnSubagentConversation(parentBindInput(theta));

    // The marshalled hash is the STORED load value, NOT a value recomputed from
    // current disk bytes at spawn (the producer holds no spawn-time hash
    // resolver, so recomputation is structurally impossible — which is what
    // preserves the load-to-spawn divergence detection).
    expect(marshalledHashes(launcher.spawns[0]!.env)["child"]).toBe(
      "sha256:./child.theta",
    );
  });

  it("an entry that captured NO load-time hash marshals no carrier for it", async () => {
    const { deps, launcher } = makeParentDeps({ calls: [] });
    // A callable-set entry with no `closureHash` (the closure root was unreadable
    // at load) marshals no hash — the launch never fabricates one at spawn.
    const entries = new Map([
      [
        "child",
        { kind: "theta" as const, mode: "subagent" as const, calleePath: "./child.theta", callee: undefined },
      ],
    ]);
    const theta = {
      slashName: "parent",
      sourcePath: "/theta/parent.theta",
      frontmatter: { mode: "subagent", tools: ["./child.theta"] } as unknown as ParsedFrontmatter,
      body: queryBody(),
      callableSet: { entries } as CallableSetSnapshot,
    } as unknown as ThetaCompositionInput;
    await deps.spawnSubagentConversation(parentBindInput(theta));

    expect(marshalledHashes(launcher.spawns[0]!.env)["child"]).toBeUndefined();
  });
});

describe("PIC-40 — pre-spawn model guard on the REAL production spawn path", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a modelless invocation refuses the child spawn: no launch, pinned diagnostic emitted, invoke_infra cause surfaced", async () => {
    const emitted: Diagnostic[] = [];
    const { deps, launcher } = makeParentDeps(
      { calls: [] },
      { emitDiagnostic: (d): void => void emitted.push(d) },
    );
    // Drive the REAL `spawnSubagentConversation` with NO resolved model
    // (`ctx.model === undefined`) — the former dead `guardedSubagentSpawn` seam's
    // obligation, now witnessed on the production path.
    const ctx = {
      model: undefined,
      cwd: "/tmp",
      signal: undefined,
    } as unknown as ExtensionCommandContext;
    const bindInput = {
      theta: parentTheta(queryBody()),
      args: "",
      ctx,
      thetaAbort: new AbortController(),
    } as unknown as ConversationBindInput;

    let cause: InvokeInfraCause | undefined;
    await expect(
      deps.spawnSubagentConversation(bindInput).catch((e: unknown) => {
        if (e instanceof InvokeInfraCauseError) {
          cause = e.invokeInfraCause;
        }
        throw e;
      }),
    ).rejects.toBeInstanceOf(InvokeInfraCauseError);

    // PIC-40 obligation 1: the runtime MUST NOT spawn the child.
    expect(launcher.spawns).toHaveLength(0);
    // The pinned diagnostic is emitted on the production path.
    expect(emitted.map((d) => d.code)).toContain(SUBAGENT_MODEL_UNRESOLVED_CODE);
    // The precise invoke_infra cause is surfaced (not the default internal_error).
    expect(cause).toBe("subagent_model_unresolved");
  });
});
