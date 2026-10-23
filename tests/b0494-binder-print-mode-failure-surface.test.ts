// Bug 0494: test-only contract authorized by this run's exact-scoped human decision.
// Real factory -> discovery/composition -> registered slash -> BinderRunner ->
// interpreter. Only off-session provider replies and host/process seams are
// scripted. OS stderr/exit, CLI registration and credentials are covered by the
// paired H9a test, not proved by this deterministic composition matrix.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { RuntimeRoot } from "../src/runtime-root";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import { parseDoc } from "./helpers/e2e-s1";
import { createThetaExtension } from "../src/extension/factory";
import { composeExtensionInstance } from "../src/extension/production-composition";
import { SYSTEM_NOTE_CHANNEL } from "../src/extension/system-note-channel";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";
import { binderUnsupportedApiMessage } from "../src/binder/forced-tool-choice";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";
import { disposeWorkspace, plantThetaWorkspace, theta } from "./helpers/production-load-harness";
import { restoreAmbientControlPlane, scrubAmbientControlPlane, type AmbientControlPlaneSnapshot } from "./helpers/ambient-control-plane-scrub";
import { DEEP_CHAIN_BODY, DEPTH_6_ARGS } from "./helpers/scripted-live-session-harness";

const script = vi.hoisted(() => ({ calls: 0, envelope: undefined as unknown, malformed: false }));
vi.mock("@earendil-works/pi-ai/compat", async (original) => ({
  ...await original<Record<string, unknown>>(),
  complete: async (_model: unknown, context: { tools: { name: string }[] }) => {
    script.calls += 1;
    return {
      role: "assistant", timestamp: 0, stopReason: script.malformed ? "stop" : "toolUse",
      content: script.malformed ? [{ type: "text", text: "no envelope" }] : [{
        type: "toolCall", id: "binder-call", name: context.tools[0]!.name,
        arguments: { envelope: script.envelope },
      }],
    };
  },
}));

type Ending = "needs_info" | "ambiguous" | "malformed" | "transport" | "ajv_args" | "cancelled" | "unsafe";
type Control = "ok" | "absent" | "empty" | "single";
type Mode = "print" | "json" | "tui" | "rpc";
interface Note {
  customType: string;
  content: string;
  details?: { event?: Record<string, unknown>; diagnostics?: { code: string }[] };
}
const ENDINGS: readonly Ending[] = ["needs_info", "ambiguous", "malformed", "transport", "ajv_args", "cancelled", "unsafe"];
const MODEL = { id: "binder-model", provider: "openai", api: "openai-responses", strictCapable: true };
const BODY_NAME = "B0494-BODY-RAN";
const BODY = `session_name("${BODY_NAME}")?`;
let workspace: string;
let ambient: AmbientControlPlaneSnapshot | undefined;

function source(extra: string[], body = BODY): string {
  return theta("---", "mode: prompt", "tools: session_name", "bind_echo: false", ...extra, "---", body);
}
beforeAll(() => {
  ambient = scrubAmbientControlPlane();
  workspace = plantThetaWorkspace("theta-b0494-composition-", [
    { stem: "binder", text: source(["bind_model: binder-model", "bind_context: session", "params:", "  topic: string", "  audience: string"]) },
    { stem: "deep", text: source(["bind_model: binder-model", "params:", "  p: L1"], `${DEEP_CHAIN_BODY}\n${BODY}`) },
    { stem: "absent", text: source([]) },
    { stem: "empty", text: source(["params: {}"] ) },
    { stem: "single", text: source(["params:", "  topic: string"]) },
    // Root regime is active but /worker is never dispatched by these cells.
    { stem: "worker", text: theta("---", "mode: subagent", "---", '"ok"') },
  ], "{}");
});
afterAll(() => {
  disposeWorkspace(workspace);
  if (ambient !== undefined) restoreAmbientControlPlane(ambient);
});

async function drive(mode: Mode, ending: Ending | Control, initialExitCode?: number, child = false) {
  script.calls = 0;
  script.malformed = ending === "malformed";
  script.envelope = ending === "needs_info" ? { kind: "needs_info", message: "which topic?" }
    : ending === "ambiguous" ? { kind: "ambiguous", message: "which audience?", candidates: null }
    : { kind: "ok", args: ending === "ajv_args" ? DEPTH_6_ARGS : { topic: "a", audience: "b" } };
  const notes: Note[] = [];
  const effects: string[] = [];
  const stderr: string[] = [];
  const bodyNames: string[] = [];
  let exitCode: number | undefined = initialExitCode;
  let sessionName = "";
  let dispatching = false;
  const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => unknown }>();
  const starts: ((event: unknown, ctx: ExtensionContext) => unknown)[] = [];
  const pi = {
    registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {}, appendEntry: () => {},
    registerCommand: (name: string, command: unknown) => { commands.set(name, command as { handler: never }); },
    on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => { if (event === "session_start") starts.push(handler); },
    getFlag: () => undefined,
    getCommands: () => [...commands.keys()].map((name) => ({ name, source: "extension" })),
    getAllTools: () => [], getActiveTools: () => [], setActiveTools: () => {},
    setSessionName: (name: string) => { sessionName = name; bodyNames.push(name); },
    getSessionName: () => sessionName,
    sendMessage: (note: Note) => {
      if (dispatching && note.customType === SYSTEM_NOTE_CHANNEL) { notes.push(note); effects.push(`note:${note.content}`); }
    },
    sendUserMessage: () => { throw new Error("precondition: no provider turn allowed in composition matrix"); },
  } as unknown as ExtensionAPI;
  const model = ending === "transport" ? { ...MODEL, api: "google-generative-ai" } : MODEL;
  const modelRegistry = { getAvailable: () => [model], getApiKeyAndHeaders: async () => ({ ok: true }) };
  const ctx = { cwd: workspace, mode, hasUI: mode === "tui" || mode === "rpc", modelRegistry, ui: { notify: () => {} } } as unknown as ExtensionContext;
  createThetaExtension({
    fixtures: [],
    ...(child ? { isSubagentChild: true } : {}),
    composeInstance: (api, context, ownNames, entries, latch) => composeExtensionInstance(api, context, {
      clock: new FakeClock(), fileWatcher: new FakeFileWatcher(), emitResultEnvelope: () => {},
      ...(child ? { subagentControlPlane: { env: { [SUBAGENT_ROOT_ENV_MARKER]: "worker" }, entry: { kind: "theta" as const } } } : {}),
      printModeFailureProcess: {
        writeStderr: (text) => { stderr.push(text); effects.push(`mirror:${text}`); },
        readExitCode: () => exitCode,
        writeExitCode: (code) => { exitCode = code; effects.push(`exit:${code}`); },
      },
    }, undefined, ownNames, entries, latch),
  })(pi);
  for (const start of starts) await start({ type: "session_start" }, ctx);
  const stem = ending === "ajv_args" ? "deep" : ["absent", "empty", "single"].includes(ending) ? ending : "binder";
  const command = commands.get(stem);
  expect(command, `precondition: /${stem} must register`).toBeDefined();
  const abort = new AbortController();
  if (ending === "cancelled") abort.abort();
  const unsafeEntries = [{
    type: "custom_message", id: "e1", parentId: null, timestamp: "2024-01-01T00:00:00.000Z",
    customType: "weird]type", content: "body", display: true,
  }];
  const entries = ending === "unsafe" ? unsafeEntries : [];
  dispatching = true;
  await command!.handler(ending === "single" ? "topic" : "", {
    ...ctx, model, signal: abort.signal,
    sessionManager: { getEntries: () => entries, getLeafId: () => entries[0]?.id, getBranch: () => entries },
  } as unknown as ExtensionCommandContext);
  return { notes, effects, stderr, exitCode, bodyNames, calls: script.calls, stem };
}

function expectedNote(ending: Ending, stem: string): string {
  const suffix: Record<Ending, string> = {
    needs_info: "argument binding needs more info — which topic?",
    ambiguous: "ambiguous arguments — which audience?",
    malformed: "argument binding failed — could not parse arguments",
    // The existing binder template caps the complete line at 120 code points.
    transport: "argument binder unavailable (google-generative-ai: no measured forced-tool-choice mapping for this provi…",
    ajv_args: "argument binding produced invalid args — /p/a/b/c/d JSON document depth exceeds 5",
    cancelled: "argument binding cancelled",
    unsafe: "custom-message type is not transcript-safe: 'weird]type'",
  };
  return `theta /${stem}: ${suffix[ending]}`;
}
function assertPremise(out: Awaited<ReturnType<typeof drive>>, ending: Ending) {
  expect(out.notes).toHaveLength(1);
  expect(out.notes[0]!.content).toBe(expectedNote(ending, out.stem));
  expect(out.bodyNames, "binder short circuit must prevent body execution").toEqual([]);
  expect(out.calls).toBe(ending === "malformed" ? 2 : ["transport", "cancelled", "unsafe"].includes(ending) ? 0 : 1);
  if (ending === "unsafe") {
    expect(out.notes[0]!.details?.diagnostics?.map((d) => d.code)).toEqual(["theta/runtime/custom-type-unsafe"]);
    expect(out.notes[0]!.details).not.toHaveProperty("event");
  } else {
    expect(out.notes[0]!.details?.event).toMatchObject({ kind: ending, theta: `/${out.stem}` });
    expect(out.notes[0]!.details?.event?.invocation_id).toEqual(expect.any(String));
    if (ending === "transport") expect(out.notes[0]!.details?.event?.message).toBe(binderUnsupportedApiMessage());
  }
}

describe("bug 0494 — binder print-mode failure surface through production composition", () => {
  for (const mode of ["print", "json"] as const) for (const ending of ENDINGS) {
    it(`${mode} × ${ending}: same note to stderr and exit 1 after note delivery`, async () => {
      const out = await drive(mode, ending);
      assertPremise(out, ending);
      const content = out.notes[0]!.content;
      expect.soft(out.stderr, `B0494 ${mode} ${ending}: missing binder stderr surface`).toEqual([`${content}\n`]);
      expect.soft(out.exitCode, `B0494 ${mode} ${ending}: binder failure must set exit 1`).toBe(1);
      expect.soft(out.effects, "note delivery precedes mirror and failure marking").toEqual([`note:${content}`, `mirror:${content}\n`, "exit:1"]);
    });
  }
  for (const mode of ["tui", "rpc"] as const) for (const ending of ENDINGS) {
    it(`CONTROL ${mode} × ${ending}: transcript only`, async () => {
      const out = await drive(mode, ending);
      assertPremise(out, ending);
      expect(out.stderr).toEqual([]);
      expect(out.exitCode).toBeUndefined();
    });
  }
  for (const ending of ENDINGS) it(`CONTROL active child root × ${ending}: no process surface`, async () => {
    const out = await drive("json", ending, undefined, true);
    assertPremise(out, ending);
    expect(out.stderr).toEqual([]);
    expect(out.exitCode).toBeUndefined();
  });
  for (const mode of ["print", "json"] as const) for (const ending of ["ok", "absent", "empty", "single"] as const) {
    it(`CONTROL ${mode} × ${ending}: body genuinely runs without failure surface`, async () => {
      const out = await drive(mode, ending);
      expect(out.bodyNames).toEqual([BODY_NAME]);
      expect(out.notes).toEqual([]);
      expect(out.calls).toBe(ending === "ok" ? 1 : 0);
      expect(out.stderr).toEqual([]);
      expect(out.exitCode).toBeUndefined();
    });
  }
  it("preserves a pre-existing exit 3 but still mirrors the binder note", async () => {
    const out = await drive("print", "transport", 3);
    assertPremise(out, "transport");
    expect.soft(out.stderr, "B0494 never-lower control must still mirror").toEqual([`${out.notes[0]!.content}\n`]);
    expect(out.exitCode).toBe(3);
  });
});

// Focused DIAGNOSE additions. The frozen composition assertions above are
// unchanged. Drive the public production runBinder entry directly, keeping its
// real BinderRunner, event-stamp guard and sendSystemNote fallback. No discovery,
// interpreter or OS process is involved in this unit isolation. All failure
// stimuli are pre-dispatch and must make zero provider calls.
type UnitBranch = "normal" | "ticketless" | "stamp-failure" | "send-failure" | "unsafe" | "unsafe-send-failure";
const UNIT_BRANCHES: readonly UnitBranch[] = ["normal", "ticketless", "stamp-failure", "send-failure", "unsafe", "unsafe-send-failure"];
const UNIT_STAMP_ERROR = "B0494 unit clock refused";
const UNIT_SEND_ERROR = "B0494 unit host send refused";

async function isolateBinder(branch: UnitBranch, surface: boolean, overflow = false) {
  script.calls = 0;
  const unsafe = branch === "unsafe" || branch === "unsafe-send-failure";
  const sendFailure = branch === "send-failure" || branch === "unsafe-send-failure";
  const model = unsafe ? MODEL : { ...MODEL, api: "google-generative-ai" };
  const document = parseDoc(theta("---", "mode: prompt", "bind_context: session",
    ...(overflow ? [] : ["params:", "  topic: string", "  audience: string"]), "---", "0"));
  expect(document.diagnostics.filter((d) => d.severity === "error"), "unit fixture must parse cleanly").toEqual([]);
  expect(document.frontmatter).not.toBeNull();
  const inputTheta: ThetaCompositionInput = {
    slashName: "binder", sourcePath: "b0494-unit.theta", frontmatter: document.frontmatter!,
    body: document.body, binderModel: "binder-model",
  };
  const effects: string[] = [];
  const attempts: Note[] = [];
  const diagnostics: Diagnostic[] = [];
  const surfaceCalls: string[] = [];
  let clockCalls = 0;
  const pi = { sendMessage: (note: Note) => {
    attempts.push(note);
    if (sendFailure) {
      effects.push(`send-refused:${note.content}`);
      throw new Error(UNIT_SEND_ERROR);
    }
    effects.push(`note:${note.content}`);
  } } as unknown as ExtensionAPI;
  const deps = createProductionProducerDeps({
    pi,
    root: {
      clock: { wallNow: () => {
        clockCalls += 1;
        if (branch === "stamp-failure") throw new Error(UNIT_STAMP_ERROR);
        return 1720000000000;
      } },
      tokenEstimator: { estimate: () => 1 },
    } as unknown as RuntimeRoot,
    modelRegistry: { getAvailable: () => [model] } as unknown as ModelRegistry,
    systemNoteChannel: {
      pi,
      ui: { notify: (content) => { effects.push(`notify:${content}`); } },
      emitDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
        effects.push(`diagnostic:${diagnostic.message}`);
      },
    },
    ...(surface ? { printModeFailureSurface: {
      mirrorLine: (content: string) => { surfaceCalls.push(`mirror:${content}`); effects.push(`mirror:${content}`); },
      markFailed: () => { surfaceCalls.push("failed"); effects.push("failed"); },
    } } : {}),
  });
  const entries = unsafe ? [{
    type: "custom_message", id: "e1", parentId: null, timestamp: "2024-01-01T00:00:00.000Z",
    customType: "weird]type", content: "body", display: true,
  }] : [];
  const result = await deps.runBinder({
    theta: inputTheta, args: overflow ? "extra" : "",
    ctx: { sessionManager: { getEntries: () => entries, getLeafId: () => entries[0]?.id } } as unknown as ExtensionCommandContext,
    ...(branch === "ticketless" ? {} : { invocationTicket: {
      theta: "binder", invocationId: "b0494-unit-invocation", finish: () => {}, settleDisposeBarrier: () => {},
    } }),
  });
  return { result, effects, attempts, diagnostics, surfaceCalls, clockCalls, providerCalls: script.calls };
}

function assertUnitDelivery(out: Awaited<ReturnType<typeof isolateBinder>>, branch: UnitBranch): string[] {
  const unsafe = branch === "unsafe" || branch === "unsafe-send-failure";
  const sendFailure = branch === "send-failure" || branch === "unsafe-send-failure";
  const content = expectedNote(unsafe ? "unsafe" : "transport", "binder");
  expect(out.result).toEqual({ bound: false });
  expect(out.providerCalls, "pre-dispatch refusal must never call the provider").toBe(0);
  expect(out.clockCalls, "fallback must not re-stamp; ticketless/group-B must not stamp").toBe(unsafe || branch === "ticketless" ? 0 : 1);
  expect(out.attempts).toHaveLength(branch === "stamp-failure" ? 0 : 1);
  if (branch !== "stamp-failure") {
    expect(out.attempts[0]!.content).toBe(content);
    if (unsafe) {
      expect(out.attempts[0]!.details?.diagnostics?.map((d) => d.code)).toEqual(["theta/runtime/custom-type-unsafe"]);
      expect(out.attempts[0]!.details).not.toHaveProperty("event");
    } else {
      expect(out.attempts[0]!.details).toEqual({ event: branch === "ticketless" ? {} : {
        kind: "transport", theta: "/binder", invocation_id: "b0494-unit-invocation",
        message: binderUnsupportedApiMessage(), occurred_at: 1720000000000,
      } });
    }
  }
  if (branch === "stamp-failure" || sendFailure) {
    expect(out.diagnostics).toEqual([{
      severity: "error", code: "theta/runtime/system-note-delivery-failed", message: content,
      hint: branch === "stamp-failure" ? UNIT_STAMP_ERROR : UNIT_SEND_ERROR,
    }]);
    return [...(sendFailure ? [`send-refused:${content}`] : []), `notify:${content}`, `diagnostic:${content}`];
  }
  expect(out.diagnostics).toEqual([]);
  return [`note:${content}`];
}

describe("B0494 UNIT — binder emitter branch isolation", () => {
  for (const branch of UNIT_BRANCHES) {
    it(`${branch}: delivers once then mirrors the same content and marks failed once`, async () => {
      const out = await isolateBinder(branch, true);
      const delivery = assertUnitDelivery(out, branch);
      const content = expectedNote(branch.startsWith("unsafe") ? "unsafe" : "transport", "binder");
      expect.soft(out.surfaceCalls, `B0494 UNIT ${branch}: missing mirror and markFailed`).toEqual([`mirror:${content}`, "failed"]);
      expect.soft(out.effects, `B0494 UNIT ${branch}: delivery or fallback must precede surface`).toEqual([...delivery, `mirror:${content}`, "failed"]);
    });
    it(`CONTROL ${branch}: absent surface preserves exactly the same note/fallback`, async () => {
      const out = await isolateBinder(branch, false);
      const delivery = assertUnitDelivery(out, branch);
      expect(out.surfaceCalls).toEqual([]);
      expect(out.effects).toEqual(delivery);
    });
  }
  it("CONTROL informational overflow: successful bypass emits its note but never the failure surface", async () => {
    const out = await isolateBinder("normal", true, true);
    const content = "theta /binder: ignoring extra arguments — this theta takes no parameters";
    expect(out.result).toEqual({ bound: true, args: {} });
    expect(out.providerCalls).toBe(0);
    expect(out.clockCalls).toBe(0);
    expect(out.attempts).toHaveLength(1);
    expect(out.attempts[0]!.content).toBe(content);
    expect(out.attempts[0]).not.toHaveProperty("details");
    expect(out.diagnostics).toEqual([]);
    expect(out.surfaceCalls).toEqual([]);
    expect(out.effects).toEqual([`note:${content}`]);
  });
});
