// Bug 0479 — a present frontmatter `model:` is validated at load and then
// ignored at every dispatch: a subagent child is launched with the parent's
// SESSION model (`ctx.model`, production-theta-producer.ts:2400) instead of the
// theta's, and a prompt-mode theta's free-phase `@` turns run on the session
// model too (the turn is `pi.sendUserMessage` into the shared session). Only
// the off-session forced respond turn resolves `frontmatter.model`.
//
// docs/bugs/0479-frontmatter-model-ignored-session-model-drives-every-turn.md.
// Spec: frontmatter-fields-a.md (`model` "applies to every query"),
// subagent.md PIC-62 (the marshalled reference is the theta's resolved model),
// tool-registration-lifetime.md #pic-17-model-window / #pic-8-model (the
// prompt-mode swap/restore window and its restore-failure protocol),
// code-registry-runtime.md `theta/runtime/model-restore-failed`.
//
// Two surfaces, both driven through the REAL producer
// (`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`),
// offline / provider-free:
//   (A) SUBAGENT LAUNCH — a caller body's `invoke("./child.theta")` reaches
//       `spawnSubagentConversation`; the fake launcher records the child argv
//       (`tests/helpers/call-with-clause-harness.ts`, `fake-json-child.ts`).
//   (B) PROMPT-MODE FREE PHASE — the one-query theta drives the REAL
//       `LivePromptQueryModel` over the b0372 instant-settle session double;
//       a recording `pi.setModel` observes the window.
//
// RED at the fork (754145b4): A1 marshals `claude-test` (the session model);
// B1/B4/B6 observe zero `setModel` calls.
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { parse, rootDouble } from "./helpers/scripted-live-session-harness";
import {
  SYSTEM_NOTE_CHANNEL,
  type SystemNoteChannelDeps,
} from "../src/extension/system-note-channel";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { QueryError } from "../src/runtime/query-error";
import type { Expr, ThetaBody } from "../src/parser/theta-document";
import {
  bodyWithInvoke,
  driveCaller,
  driveCtx,
  invokeStmtWithClause,
  subagentCallee,
  trivialSubagentBody,
} from "./helpers/call-with-clause-harness";

// ===========================================================================
// Shared fixtures
// ===========================================================================

/** A registry model double — the shape `matchAvailableModel` and the launcher read. */
interface ModelDouble {
  readonly id: string;
  readonly provider: string;
  readonly api: string;
  readonly strictCapable: boolean;
}

/** The invoking session's own model (what `ctx.model` reports). */
const SESSION_MODEL: ModelDouble = {
  id: "claude-test",
  provider: "anthropic",
  api: "anthropic-messages",
  strictCapable: true,
};
/** The theta's pinned model — same provider, different id, so only the id tells them apart. */
const PINNED_MODEL: ModelDouble = {
  id: "claude-pinned",
  provider: "anthropic",
  api: "anthropic-messages",
  strictCapable: true,
};
const PINNED_REF = `${PINNED_MODEL.provider}/${PINNED_MODEL.id}`;

function registryOf(...models: readonly ModelDouble[]): ModelRegistry {
  return {
    getAvailable: (): readonly ModelDouble[] => [...models],
    find: (provider: string, id: string): ModelDouble | undefined =>
      models.find((m) => m.provider === provider && m.id === id),
  } as unknown as ModelRegistry;
}

/** `--provider <p> --model <id>` as the child argv carries it (subagent-launcher.ts `assembleChildArgv`). */
function marshalledModel(args: readonly string[]): { provider: string; model: string } {
  const p = args.indexOf("--provider");
  const m = args.indexOf("--model");
  expect(p, `argv carries --provider: ${JSON.stringify(args)}`).toBeGreaterThanOrEqual(0);
  expect(m, `argv carries --model: ${JSON.stringify(args)}`).toBeGreaterThanOrEqual(0);
  return { provider: String(args[p + 1]), model: String(args[m + 1]) };
}

// ===========================================================================
// (A) SUBAGENT LAUNCH — PIC-62: the marshalled reference is the theta's model.
// ===========================================================================

const CALLER_CWD = "/work/project";
const CHILD_LITERAL = "./child.theta";

/**
 * A caller body whose TAIL is the invoke expression, so the callee's terminal
 * `Result` — `Err(invoke_infra …)` on a refused spawn — is the body's own final
 * value (a bare invoke STATEMENT discards its `Result`).
 */
function bodyWithInvokeTail(path: string): ThetaBody {
  const { invoke } = invokeStmtWithClause(path) as unknown as { readonly invoke: Expr };
  return { statements: [], tail: invoke };
}

function pinnedCallee(modelRef: string): ReturnType<typeof subagentCallee> {
  return {
    sourcePath: "/thetadir/child.theta",
    frontmatter: { mode: "subagent", model: modelRef } as unknown as ParsedFrontmatter,
    body: trivialSubagentBody(),
  };
}

describe("bug 0479 (A) — a subagent child launches with the THETA's model, not the session's (PIC-62)", () => {
  it("A1: callee `model: anthropic/claude-pinned` under a session running claude-test spawns with --model claude-pinned", async () => {
    const outcome = await driveCaller({
      callerBody: bodyWithInvoke(CHILD_LITERAL),
      callerCtx: driveCtx(CALLER_CWD),
      callees: new Map([[CHILD_LITERAL, pinnedCallee(PINNED_REF)]]),
      modelRegistry: registryOf(SESSION_MODEL, PINNED_MODEL),
    });
    expect(outcome.execution.outcome, `error: ${JSON.stringify(outcome.execution.error)}`).toBe("success");
    expect(outcome.spawns, "exactly one child spawned").toHaveLength(1);
    expect(marshalledModel(outcome.spawns[0]!.args)).toEqual({
      provider: PINNED_MODEL.provider,
      model: PINNED_MODEL.id,
    });
  });

  it("A2 (control): a callee without `model:` inherits the session model — the marshalled reference is ctx.model", async () => {
    const outcome = await driveCaller({
      callerBody: bodyWithInvoke(CHILD_LITERAL),
      callerCtx: driveCtx(CALLER_CWD),
      callees: new Map([[CHILD_LITERAL, subagentCallee("/thetadir/child.theta")]]),
      modelRegistry: registryOf(SESSION_MODEL, PINNED_MODEL),
    });
    expect(outcome.execution.outcome).toBe("success");
    expect(outcome.spawns).toHaveLength(1);
    expect(marshalledModel(outcome.spawns[0]!.args)).toEqual({
      provider: SESSION_MODEL.provider,
      model: SESSION_MODEL.id,
    });
  });

  it("A3: a present `model:` that no longer resolves at dispatch refuses the spawn (subagent_model_unresolved) — never a silent session-model substitution", async () => {
    const outcome = await driveCaller({
      callerBody: bodyWithInvokeTail(CHILD_LITERAL),
      callerCtx: driveCtx(CALLER_CWD),
      callees: new Map([[CHILD_LITERAL, pinnedCallee("anthropic/claude-vanished")]]),
      // The registry holds the session model only: the pin resolved at load
      // (elsewhere) but is gone at dispatch.
      modelRegistry: registryOf(SESSION_MODEL),
    });
    expect(outcome.spawns, "no child may launch on a substituted model").toHaveLength(0);
    expect(outcome.execution.outcome).toBe("success");
    const terminal = outcome.execution.result.value as unknown as {
      readonly ok: boolean;
      readonly error: QueryError & { readonly cause?: string };
    };
    expect(terminal.ok, `terminal Result: ${JSON.stringify(terminal)}`).toBe(false);
    expect(terminal.error.kind).toBe("invoke_infra");
    expect(terminal.error.cause).toBe("subagent_model_unresolved");
  });
});

// ===========================================================================
// (B) PROMPT-MODE FREE PHASE — PIC-17 model window over the live drive.
// ===========================================================================

const QUERY_REPLY = "604";
const QUERY_SNAPSHOT = ["ambient-x", "ambient-y"];
const MODEL_RESTORE_FAILED = "theta/runtime/model-restore-failed";
/** PIC-8-model (c): the verbatim template with `<name>` substituted for the probe theta. */
const MODEL_RESTORE_NOTE_VERBATIM =
  "theta: failed to restore the session model after /probe; the user session may have an unexpected model active. Use /model to reset.";

function oneQueryTheta(modelLine: string | undefined): string {
  return ["---", "mode: prompt", ...(modelLine === undefined ? [] : [modelLine]), "---", "let v = @`Ping`?", "v", ""].join(
    "\n",
  );
}

interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

interface RecordedNote {
  readonly content: string;
  readonly display: boolean;
}

/**
 * The instant-settle user-session double (the b0372 shape): `sendUserMessage`
 * commits the user entry AND the reply in the same tick, so the drive's fast
 * path binds the reply without `isIdle()` ever reading false. It also tracks
 * the session's CURRENT model so a `setModel` swap is observable both as a
 * call log and as the model the reply is attributed to.
 */
class InstantSettleSession {
  readonly entries: SessionEntryDouble[] = [];
  readonly notes: RecordedNote[] = [];
  /** Every `pi.setModel` call, in order (the window's swap-in and restore). */
  readonly setModelCalls: ModelDouble[] = [];
  /** The model each driven turn ran under (the session model at send time). */
  readonly turnModels: string[] = [];
  currentModel: ModelDouble;

  constructor(
    readonly reply: string,
    initialModel: ModelDouble,
    /** Scripted `setModel` answers per call; `true` once exhausted. `"throw"` throws. */
    private readonly setModelScript: readonly (boolean | "throw")[] = [],
  ) {
    this.currentModel = initialModel;
  }

  sendUserMessage(text: string): void {
    this.turnModels.push(`${this.currentModel.provider}/${this.currentModel.id}`);
    this.#appendUser(text);
    this.#appendAssistant(this.reply);
  }

  setModel(model: ModelDouble): Promise<boolean> {
    const n = this.setModelCalls.length;
    this.setModelCalls.push(model);
    const scripted = this.setModelScript[n] ?? true;
    if (scripted === "throw") {
      return Promise.reject(new Error(`setModel rejected (scripted call ${n})`));
    }
    if (scripted) {
      this.currentModel = model;
    }
    return Promise.resolve(scripted);
  }

  isIdle(): boolean {
    return true;
  }

  sendMessage(message: { customType?: string; content?: string; display?: boolean }): void {
    if (message.customType === SYSTEM_NOTE_CHANNEL) {
      this.notes.push({ content: String(message.content ?? ""), display: message.display === true });
    }
  }

  #appendUser(text: string): void {
    this.#append({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
  }

  #appendAssistant(text: string): void {
    this.#append({
      role: "assistant",
      content: [{ type: "text", text }],
      api: this.currentModel.api,
      provider: this.currentModel.provider,
      model: this.currentModel.id,
      stopReason: "stop",
      timestamp: 0,
    });
  }

  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
}

function piDouble(session: InstantSettleSession): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => [...QUERY_SNAPSHOT],
    setActiveTools: (): void => {},
    setModel: (model: ModelDouble): Promise<boolean> => session.setModel(model),
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (message: { customType?: string; content?: string; display?: boolean }): void =>
      session.sendMessage(message),
  } as unknown as ExtensionAPI;
}

function ctxDouble(session: InstantSettleSession): ExtensionCommandContext {
  return {
    // A live getter: the window's step-1a snapshot reads the CURRENT session
    // model, and after a swap the host would report the swapped model here.
    get model(): ModelDouble {
      return session.currentModel;
    },
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

interface QueryDriveResult {
  readonly execution: BodyExecution;
  readonly session: InstantSettleSession;
  readonly diagnostics: Diagnostic[];
  readonly caught: unknown;
}

async function driveQuery(input: {
  readonly modelLine: string | undefined;
  readonly setModelScript?: readonly (boolean | "throw")[];
  readonly registry?: ModelRegistry;
}): Promise<QueryDriveResult> {
  const doc = parse(oneQueryTheta(input.modelLine));
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const session = new InstantSettleSession(QUERY_REPLY, SESSION_MODEL, input.setModelScript ?? []);
  const diagnostics: Diagnostic[] = [];
  const systemNoteChannel: SystemNoteChannelDeps = {
    pi: {
      sendMessage: (message): void => {
        if (message.customType === SYSTEM_NOTE_CHANNEL) {
          session.notes.push({ content: String(message.content ?? ""), display: message.display === true });
        }
      },
    },
    ui: { notify: (): void => {} },
    emitDiagnostic: (d): void => {
      diagnostics.push(d);
    },
  };
  const deps = createProductionProducerDeps({
    pi: piDouble(session),
    root: rootDouble(),
    modelRegistry: input.registry ?? registryOf(SESSION_MODEL, PINNED_MODEL),
    emitDiagnostic: (d): void => {
      diagnostics.push(d);
    },
    systemNoteChannel,
  });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble(session) });
  expect(binding.drivenAgainst, "the harness must bind the LIVE prompt-mode drive").toBe("prompt-user-session");
  let execution: BodyExecution | undefined;
  let caught: unknown;
  try {
    execution = await executeBody(theta.body, binding.executeDeps);
  } catch (thrown) {
    caught = thrown;
  }
  return { execution: execution as BodyExecution, session, diagnostics, caught };
}

const PINNED_LINE = `model: "${PINNED_REF}"`;
const SESSION_LINE = `model: "${SESSION_MODEL.provider}/${SESSION_MODEL.id}"`;

describe("bug 0479 (B) — a prompt-mode free-phase turn runs under the theta's `model:` (PIC-17 model window)", () => {
  it("B1: a differing `model:` swaps the session model in before the send and restores it after; the turn ran on the pin and the reply binds", async () => {
    const r = await driveQuery({ modelLine: PINNED_LINE });
    expect(r.caught, `unexpected throw: ${String(r.caught)}`).toBeUndefined();
    expect(r.execution.outcome, `error: ${JSON.stringify(r.execution?.error)}`).toBe("success");
    expect(r.execution.result.value).toBe(QUERY_REPLY);
    // The turn was issued while the session ran the PINNED model …
    expect(r.session.turnModels).toEqual([PINNED_REF]);
    // … via exactly one swap-in and one restore, in that order.
    expect(r.session.setModelCalls.map((m) => `${m.provider}/${m.id}`)).toEqual([
      PINNED_REF,
      `${SESSION_MODEL.provider}/${SESSION_MODEL.id}`,
    ]);
    // The user session is back on its own model.
    expect(r.session.currentModel).toEqual(SESSION_MODEL);
    expect(r.diagnostics.some((d) => d.code === MODEL_RESTORE_FAILED)).toBe(false);
  });

  it("B2: a `model:` equal to the session model makes NO setModel call (the window is inert)", async () => {
    const r = await driveQuery({ modelLine: SESSION_LINE });
    expect(r.execution.outcome, `error: ${JSON.stringify(r.execution?.error)}`).toBe("success");
    expect(r.execution.result.value).toBe(QUERY_REPLY);
    expect(r.session.setModelCalls).toEqual([]);
    expect(r.session.turnModels).toEqual([`${SESSION_MODEL.provider}/${SESSION_MODEL.id}`]);
  });

  it("B3 (control): no `model:` inherits the session model with NO setModel call", async () => {
    const r = await driveQuery({ modelLine: undefined });
    expect(r.execution.outcome, `error: ${JSON.stringify(r.execution?.error)}`).toBe("success");
    expect(r.execution.result.value).toBe(QUERY_REPLY);
    expect(r.session.setModelCalls).toEqual([]);
  });

  it("B4: the host declining the swap-in (setModel → false) refuses the query BEFORE any turn with a transport Err naming the pinned model's api", async () => {
    const r = await driveQuery({ modelLine: PINNED_LINE, setModelScript: [false] });
    expect(r.caught, `unexpected throw: ${String(r.caught)}`).toBeUndefined();
    // No turn was issued — no provider spend on the wrong model.
    expect(r.session.turnModels).toEqual([]);
    expect(r.execution.outcome).toBe("fail");
    const error = r.execution.error as unknown as QueryError & { readonly provider?: string; readonly message?: string };
    expect(error.kind).toBe("transport");
    expect(error.provider).toBe(PINNED_MODEL.api);
    expect(error.message ?? "").toContain(PINNED_REF);
    // Nothing to restore: the swap never took effect.
    expect(r.session.setModelCalls).toHaveLength(1);
    expect(r.session.currentModel).toEqual(SESSION_MODEL);
  });

  it("B5: a restore that fails once is re-attempted once and succeeds — no diagnostic, no note", async () => {
    // Call 0 = swap-in (ok), call 1 = restore (declined), call 2 = re-attempt (ok).
    const r = await driveQuery({ modelLine: PINNED_LINE, setModelScript: [true, false, true] });
    expect(r.caught, `unexpected throw: ${String(r.caught)}`).toBeUndefined();
    expect(r.execution.outcome, `error: ${JSON.stringify(r.execution?.error)}`).toBe("success");
    expect(r.execution.result.value).toBe(QUERY_REPLY);
    expect(r.session.setModelCalls).toHaveLength(3);
    expect(r.session.currentModel).toEqual(SESSION_MODEL);
    expect(r.diagnostics.some((d) => d.code === MODEL_RESTORE_FAILED)).toBe(false);
    expect(r.session.notes.filter((n) => n.content === MODEL_RESTORE_NOTE_VERBATIM)).toEqual([]);
  });

  it("B6: a restore that fails twice fires model-restore-failed (E, hint = the snapshot reference) + the verbatim display note, and the reply still binds unmasked", async () => {
    // Call 0 = swap-in (ok), call 1 = restore (throws), call 2 = re-attempt (declined).
    const r = await driveQuery({ modelLine: PINNED_LINE, setModelScript: [true, "throw", false] });
    expect(r.caught, `the restore failure must be diagnosed and swallowed, not propagated: ${String(r.caught)}`).toBeUndefined();
    expect(r.execution.outcome, `error: ${JSON.stringify(r.execution?.error)}`).toBe("success");
    expect(r.execution.result.value).toBe(QUERY_REPLY);
    // Exactly one re-attempt: swap-in + restore + one retry.
    expect(r.session.setModelCalls).toHaveLength(3);
    const diag = r.diagnostics.find((d) => d.code === MODEL_RESTORE_FAILED);
    expect(diag, `diagnostics: ${JSON.stringify(r.diagnostics.map((d) => d.code))}`).toBeDefined();
    expect(diag?.severity).toBe("error");
    expect(diag?.message).toBe("failed to restore session model after /probe: pi.setModel returned false");
    expect(diag?.hint).toBe(`${SESSION_MODEL.provider}/${SESSION_MODEL.id}`);
    const note = r.session.notes.find((n) => n.display === true && n.content === MODEL_RESTORE_NOTE_VERBATIM);
    expect(note, `notes: ${JSON.stringify(r.session.notes)}`).toBeDefined();
    // The session was left on the pin — exactly what the note tells the operator.
    expect(r.session.currentModel).toEqual(PINNED_MODEL);
  });

  it("B7: a present `model:` that no longer resolves at dispatch refuses the query BEFORE any turn (provider 'unknown', no setModel, no send) — never a run on the session model", async () => {
    const r = await driveQuery({
      modelLine: 'model: "anthropic/claude-vanished"',
      // The registry holds the session model only: the pin resolved at load
      // (the parse-time matcher double admits anything) but is gone at dispatch.
      registry: registryOf(SESSION_MODEL),
    });
    expect(r.caught, `unexpected throw: ${String(r.caught)}`).toBeUndefined();
    expect(r.session.turnModels, "no turn may run on a substituted model").toEqual([]);
    expect(r.session.setModelCalls).toEqual([]);
    expect(r.execution.outcome).toBe("fail");
    const error = r.execution.error as unknown as QueryError & { readonly provider?: string; readonly message?: string };
    expect(error.kind).toBe("transport");
    expect(error.provider, "the fixed sentinel: no model drove the turn").toBe("unknown");
    expect(error.message ?? "").toContain("no resolved model");
    expect(error.message ?? "").toContain("anthropic/claude-vanished");
  });
});
