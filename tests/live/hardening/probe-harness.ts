// Hardening probe harness (test-support; Pi never loads it).
//
// Boots the SHIPPED theta extension (through the real `extensions/index.ts`
// entry) against a REAL live `AgentSession`, plants `.theta`/`.thetalib` files on the
// real filesystem so the real discovery walk reads them, injects a capturing
// `uiContext` so discovery/parse diagnostics (routed through `ctx.ui.notify`)
// are observable, and drives real slash invocations against a LIVE model.
//
// This is the faithful "real extension in real life" surface used by the
// hardening subagents. It is NOT a unit-test double: the model turns are real.
// Keep probes token-bounded — prefer deterministic observation channels:
//   * `registeredNames` — which slash commands the real discovery+parse+compose
//     pipeline registered (observes discovery/validity/collision outcomes with
//     ZERO model turns).
//   * `diagnostics`     — every `ctx.ui.notify(message, type)` the load phase
//     emitted. NOTE (V4e + bug 0013): the shipped load path
//     (`composeExtensionInstance`) routes ALL load-phase diagnostics
//     (discovery / settings / binder-model / parse) onto the
//     `theta-system-note` channel — errors per-diagnostic via the pre-eval
//     router, warnings as per-group batch notes — NOT through
//     `ctx.ui.notify`. So `diagnostics` is normally EMPTY at load time; both
//     severities land on the load-phase `systemNotes` field below.
//   * `systemNotes`     — the LOAD-PHASE `theta-system-note` channel entries
//     (load/parse/settings/binder diagnostics of BOTH severities — probes must
//     discriminate by message content, not assume error-severity) appended
//     during bind / session_start, before any drive. Read off the in-memory
//     SessionManager (deterministic; no dependence on event timing).
//   * per-drive `userTexts` — the exact user-turn text the theta CODE computed
//     and sent to the model (deterministic; reveals control-flow / expression /
//     stdlib evaluation without depending on the model's reply).
//   * per-drive `toolCalls` — code-driven tool calls with their computed args
//     (deterministic).
//   * per-drive `assistantText` — the streamed model reply (stochastic; only
//     assert on it when the theta pins the reply with a deterministic sentinel
//     instruction).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "vitest";
import {
  DefaultResourceLoader,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  createAgentSession,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_PARENT_PID_ENV,
} from "../../../src/runtime/subagent-launcher";

export const SHIPPED_EXTENSION_ENTRY = fileURLToPath(
  new URL("../../../extensions/index.ts", import.meta.url),
);

// #subagent-child-pins — the probe harness is an IN-PROCESS vitest host, not a
// real `pi` process, so the RFC-0006 subagent-child launch machinery would
// otherwise mis-resolve both of its ambient inputs:
//   • executable — rung 1 of the two-rung ladder
//     (production-subagent-host.ts `createExecutableHost`) reads
//     `process.argv[1]`, which under vitest is VITEST's entry script; every
//     `invoke("./x.theta")` of a subagent-mode theta would spawn
//     `node <vitest-entry> … -p "/x"` and die instantly as `invoke_infra`.
//     Point argv[1] at the real pi CLI entry so rung 1 resolves the child the
//     way a real `pi` parent does.
//   • extension identity — without the #subagent-extension-pin env (bug 0002
//     defect 2) the child relies on ambient extension discovery and can bind a
//     stale globally-installed theta build (or none at all) instead of THIS
//     working tree. Pin every spawned child to the tree under test, exactly as
//     the H9a acceptance harness does for its `pi -p` processes.
// Both mutations are process-global but vitest isolates each test FILE in its
// own worker process, so they scope to probe-harness importers.
process.argv[1] = fileURLToPath(
  new URL(
    "../../../node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
    import.meta.url,
  ),
);
process.env[SUBAGENT_EXTENSION_PIN_ENV] = fileURLToPath(
  new URL("../../../extensions", import.meta.url),
);
// The control plane is authenticated (subagent.md
// #subagent-control-plane-authentication): without the parent-pid carriage
// naming this process's real parent, `readParentEnv` strips the pin above and
// every spawned child falls back to ambient discovery (bug 0002 defect 2).
process.env[SUBAGENT_PARENT_PID_ENV] = String(process.ppid);

export function failLoudly(message: string): never {
  assert.fail(message);
  throw new Error(message);
}

export interface ResolvedProvider {
  readonly modelRuntime: ModelRuntime;
  readonly modelRegistry: ModelRegistry;
  readonly model: unknown;
  readonly modelId: string;
}

// The provider handle stays synchronous so the ~33 module-scope
// `const provider = requireLiveProvider();` call sites are unchanged; the async
// credential/model resolution is memoized behind `resolved` and awaited only by
// the async consumers (`runProbe`, and the one `modelId` reader). Fail-loud on a
// missing provider surfaces when `resolved` is awaited — never a silent skip.
export interface LiveProvider {
  readonly resolved: Promise<ResolvedProvider>;
}

async function resolveLiveProvider(): Promise<ResolvedProvider> {
  // 0.80.x: `ModelRegistry.create` is gone and `AuthStorage` is no longer a
  // public root export. Build the canonical `ModelRuntime` (its default
  // credential store reads the operator's `agentDir/auth.json`), wrap it in the
  // synchronous `ModelRegistry` facade, and `refresh()` before the synchronous
  // `getAvailable()` read. `ModelRuntime` is what `createAgentSession` now takes
  // to supply credentials (the `authStorage`/`modelRegistry` options were removed).
  const modelRuntime = await ModelRuntime.create();
  const modelRegistry = new ModelRegistry(modelRuntime);
  await modelRegistry.refresh();
  const available = modelRegistry.getAvailable();
  if (available.length === 0) {
    failLoudly(
      "live-host precondition unmet: no live provider/model is configured " +
        "(ModelRegistry.getAvailable() is empty). Configure a provider and " +
        "credentials; this harness never silently skips.",
    );
  }
  const idOf = (m: unknown): string => (m as { id?: string }).id ?? "";
  const model =
    available.find((m) => idOf(m) === "claude-sonnet-5") ??
    available.find((m) => idOf(m).includes("sonnet")) ??
    available[0];
  if (model === undefined) failLoudly("no resolvable live model");
  return { modelRuntime, modelRegistry, model, modelId: idOf(model) };
}

/** Resolve the configured live provider/model; fail loudly if none (never a silent skip). */
export function requireLiveProvider(): LiveProvider {
  // Kick off resolution eagerly and memoize so every `runProbe` shares one runtime.
  const resolved = resolveLiveProvider();
  // Avoid an unhandled-rejection warning before the first `await options.provider.resolved`.
  resolved.catch(() => undefined);
  return { resolved };
}

/** A file to plant before discovery runs. */
export interface PlantedFile {
  /** Discovery source. `project` → <cwd>/.pi/theta/. `cli` → a --theta dir. `rel` → relative to cwd (for .thetalib imports / nested dirs). */
  readonly source: "project" | "cli" | "rel";
  /** Path relative to the source root, e.g. "foo.theta" or "shared/x.thetalib". Stem must be a valid slash name for a registrable .theta. */
  readonly path: string;
  readonly text: string;
}

export interface Diagnostic {
  readonly message: string;
  readonly type: "info" | "warning" | "error";
}

export interface ProbeTurn {
  readonly invocation: string;
  /** Exact user-turn text(s) the theta code sent to the model (deterministic). */
  readonly userTexts: readonly string[];
  /** Streamed assistant reply text (stochastic). */
  readonly assistantText: string;
  /** Code-driven tool calls with computed args (deterministic). */
  readonly toolCalls: readonly { name: string; args: unknown }[];
  /**
   * `theta-system-note` channel entries emitted during this invocation (the
   * SLSH-1 no-params overflow note, binder failure notes, …). Read
   * deterministically off the in-memory `SessionManager` entries after the
   * drive settles, so the note is observable independent of event timing.
   */
  readonly systemNotes: readonly string[];
  /** Any error thrown while driving this invocation. */
  readonly error?: string | undefined;
}

/** The recorded turn at `index` (default 0), failing loudly when absent (never a silent skip). */
export function turnAt(probe: ProbeResult, index = 0): ProbeTurn {
  const turn = probe.turns[index];
  if (turn === undefined) {
    throw new Error(
      `probe recorded no turn at index ${index} (turns=${probe.turns.length})`,
    );
  }
  return turn;
}

export interface ProbeResult {
  readonly registeredNames: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
  /**
   * LOAD-PHASE `theta-system-note` channel entries (V4e + bug 0013): the
   * load/parse/settings/binder-model diagnostics the shipped
   * `composeExtensionInstance` pass routed onto the channel during bind /
   * session_start, before any drive — error-severity pre-eval notes AND
   * warning-severity batch notes alike. Snapshotted off the in-memory
   * SessionManager after `registeredNames` is computed. Per-drive notes stay on
   * `turn.systemNotes`.
   */
  readonly systemNotes: readonly string[];
  readonly turns: readonly ProbeTurn[];
  dispose(): Promise<void>;
}

/**
 * Extract the `theta-system-note` channel contents from a slice of in-memory
 * SessionManager entries (their `content`, string or text-part array).
 */
function collectSystemNotes(
  entries: readonly unknown[],
): readonly string[] {
  const notes: string[] = [];
  for (const entry of entries) {
    const e = entry as { customType?: string; content?: unknown };
    if (e.customType !== "theta-system-note") continue;
    if (typeof e.content === "string") notes.push(e.content);
    else if (Array.isArray(e.content)) {
      for (const part of e.content) {
        const t = (part as { text?: string }).text;
        if (typeof t === "string") notes.push(t);
      }
    }
  }
  return notes;
}

/**
 * Extract the user-turn text(s) from a slice of in-memory SessionManager
 * entries — the settled transcript source of truth for what the theta code
 * sent to the model. A user turn is a `type:"message"` entry whose
 * `message.role === "user"`; its `content` is a string or a `TextContent[]`.
 *
 * This mirrors `collectSystemNotes` (deterministic read off the settled
 * transcript after `await session.prompt(...)` resolves) rather than the racy
 * `agent_end` event subscription: the final `@`-query user message is committed
 * to the transcript by the time `prompt()` resolves, so slicing the entries
 * appended during THIS drive always sees it — independent of event timing.
 */
function collectUserTexts(
  entries: readonly unknown[],
): readonly string[] {
  const texts: string[] = [];
  for (const entry of entries) {
    const e = entry as { type?: string; message?: { role?: string; content?: unknown } };
    if (e.type !== "message" || e.message?.role !== "user") continue;
    const content = e.message.content;
    if (typeof content === "string") texts.push(content);
    else if (Array.isArray(content)) {
      for (const part of content) {
        const t = (part as { text?: string }).text;
        if (typeof t === "string") texts.push(t);
      }
    }
  }
  return texts;
}

/**
 * Boot the shipped extension over a fresh temp workspace, plant `files`, wire
 * `--theta` sources, capture load-phase diagnostics, and drive each `invocation`
 * in `drives` in order against the live model. Returns everything observable.
 */
export async function runProbe(options: {
  readonly provider: LiveProvider;
  readonly files: readonly PlantedFile[];
  /** Slash invocations to drive in order, e.g. "/foo hello world". Empty → registration/diagnostics only (no tokens). */
  readonly drives?: readonly string[];
  /** Extra settings.json content to write under <cwd>/.pi/settings.json. */
  readonly projectSettings?: unknown;
}): Promise<ProbeResult> {
  const { provider, files, drives = [], projectSettings } = options;
  const resolvedProvider = await provider.resolved;
  const cwd = mkdtempSync(join(tmpdir(), "theta-harden-"));
  const cliDirs = new Map<string, string>();
  const cleanup: string[] = [cwd];

  for (const f of files) {
    let base: string;
    if (f.source === "project") {
      base = join(cwd, ".pi", "theta");
    } else if (f.source === "rel") {
      base = cwd;
    } else {
      // one shared cli dir per probe
      if (!cliDirs.has("_cli")) {
        const d = mkdtempSync(join(tmpdir(), "theta-harden-cli-"));
        cliDirs.set("_cli", d);
        cleanup.push(d);
      }
      base = cliDirs.get("_cli")!;
    }
    const full = join(base, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.text, "utf8");
  }
  if (projectSettings !== undefined) {
    mkdirSync(join(cwd, ".pi"), { recursive: true });
    writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify(projectSettings, null, 2), "utf8");
  }

  const agentDir = getAgentDir();
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    additionalExtensionPaths: [SHIPPED_EXTENSION_ENTRY],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();

  const sessionManager = SessionManager.inMemory(cwd);
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime: resolvedProvider.modelRuntime,
    model: resolvedProvider.model as never,
    resourceLoader,
    sessionManager,
  });

  const diagnostics: Diagnostic[] = [];
  const runner = session.extensionRunner;
  const cliDir = cliDirs.get("_cli");
  if (cliDir !== undefined) runner.setFlagValue("theta", cliDir);

  // Inject a capturing uiContext so load-phase `ctx.ui.notify` diagnostics are observable.
  const capturingUi = {
    notify(message: string, type: "info" | "warning" | "error" = "info"): void {
      diagnostics.push({ message, type });
    },
  };
  await session.bindExtensions({ uiContext: capturingUi as never });

  const registeredNames = runner.getRegisteredCommands().map((c) => c.name);

  // Snapshot the LOAD-PHASE `theta-system-note` entries: every load diagnostic
  // (discovery / settings / binder-model; error notes AND warning batch notes —
  // V4e + bug 0013) the bind / session_start compose pass routed onto the
  // channel, read off the in-memory SessionManager AFTER `registeredNames` is
  // computed but BEFORE any drive runs, so it captures only load-time notes
  // (per-drive notes live on `turn.systemNotes`). See the header note.
  const systemNotes = collectSystemNotes(sessionManager.getEntries());

  const turns: ProbeTurn[] = [];
  for (const invocation of drives) {
    const toolCalls: { name: string; args: unknown }[] = [];
    let assistantText = "";
    // `assistantText` (stochastic streamed reply) and `toolCalls` are captured
    // from the live event stream. `userTexts` is NOT captured here — the
    // `agent_end` `event.messages` read raced with `prompt()` resolution /
    // `unsub()`, so the final `@`-query user message could be dropped. It is
    // now read off the settled transcript below (see `collectUserTexts`).
    const unsub = session.subscribe((event: AgentSessionEvent) => {
      if (event.type === "message_update") {
        const inner = event.assistantMessageEvent;
        if (inner.type === "text_delta") assistantText += inner.delta;
      } else if (event.type === "tool_execution_start") {
        toolCalls.push({ name: event.toolName, args: event.args });
      }
    });
    const notesBefore = sessionManager.getEntries().length;
    let error: string | undefined;
    try {
      await session.prompt(invocation);
    } catch (e) {
      error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    } finally {
      unsub();
    }
    // Read the entries appended during THIS drive off the in-memory session
    // manager (deterministic; no dependence on event timing). Slice from
    // `notesBefore` so a turn only sees its own appended entries.
    const appended = sessionManager.getEntries().slice(notesBefore);
    const userTexts = collectUserTexts(appended);
    const systemNotes = collectSystemNotes(appended);
    turns.push({ invocation, userTexts, assistantText, toolCalls, systemNotes, error });
  }

  return {
    registeredNames,
    diagnostics,
    systemNotes,
    turns,
    dispose: async (): Promise<void> => {
      // FAITHFULNESS (models real-Pi teardown ordering). Real Pi emits
      // `session_shutdown` (via the agent-session runtime's `teardownCurrent`)
      // BEFORE `AgentSession.dispose()`, so the shipped theta extension's
      // graceful `session_shutdown` handler runs while the ctx is still active:
      // it closes the chokidar discovery/settings watcher and (PIC-57) marks the
      // reload debouncer torn-down + awaits the bounded `whenIdle` quiesce.
      // `AgentSession.dispose()` itself is synchronous and ONLY calls
      // `ExtensionRunner.invalidate(...)` — it does NOT emit `session_shutdown`.
      // So without driving the emit here, the file watcher leaks per probe and
      // the subsequent `rmSync` of the watched temp dir fires a debounced
      // rebuild against the already-invalidated ctx → the recurring stderr
      // noise (`registry-swap-failed` / `stale after session replacement` /
      // `system-note delivery failed`). Emit-then-dispose-then-rmSync models the
      // faithful ordering and quiesces the watcher first.
      //
      // `session.extensionRunner.emit(...)` is the reachable public trigger:
      // `session_shutdown` is NOT excluded from the runner's generic
      // `RunnerEmitEvent` union (only events with a dedicated `emitXxx()` are),
      // and `emit()` AWAITS each registered handler — including the theta
      // handler's returned `runSessionShutdown` promise, so sub-step 4's bounded
      // `whenIdle` completes before we dispose. (The standalone
      // `emitSessionShutdownEvent(runner, event)` helper is NOT re-exported from
      // the package root and its deep import is blocked by the exports map, so
      // it is not a reachable API.)
      try {
        await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      } catch { // allow-broad-catch: test-harness teardown — prefer the faithful graceful emit, but never leave a probe undisposed if it is unavailable
        // Fall through to dispose + cleanup below regardless.
      }
      session.dispose();
      for (const p of cleanup) rmSync(p, { recursive: true, force: true });
      await Promise.resolve();
    },
  };
}
