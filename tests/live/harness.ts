// H8a-T — live-host acceptance harness (test-support; Pi never loads it).
//
// This module boots a REAL `AgentSession` against a live provider/model and
// loads theta the way Pi loads it — through the shipped `extensions/index.ts`
// entry (which re-exports the `src/**` factory), NOT the `H4a` in-memory
// fixture-supply. It exists only to give the opt-in `npm run test:live` suite a
// live composition it can drive; it is excluded from the default `npm test`
// (see `config/vitest/vitest.live.config.ts`).
//
// The suite spends real tokens against a live model, so it is deliberately
// token-bounded: each test asserts its discovery→registration precondition
// BEFORE driving a model turn, so a discovery or registration regression reds
// with zero tokens rather than paying for a turn that cannot run.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
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
import type {
  AgentSession,
  AgentSessionEvent,
  ExtensionRunner,
  ResolvedCommand,
} from "@earendil-works/pi-coding-agent";
import {
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_PARENT_PID_ENV,
} from "../../src/runtime/subagent-launcher";

/** The shipped Pi extension entry — the way Pi loads theta (re-exports the `src/**` factory). */
export const SHIPPED_EXTENSION_ENTRY = fileURLToPath(
  new URL("../../extensions/index.ts", import.meta.url),
);

// #subagent-child-pins — this harness is an IN-PROCESS vitest host, not a real
// `pi` process, so the RFC-0006 subagent-child launch machinery (reached by the
// H8a-T subagent-mode drive through the shipped composition root's
// `createProductionSpawnFn`) would otherwise mis-resolve both of its ambient
// inputs, exactly as the hardening probe harness documents:
//   • executable — rung 1 of the two-rung ladder
//     (production-subagent-host.ts `createExecutableHost`) reads
//     `process.argv[1]`, which under vitest is VITEST's entry script; the
//     subagent-mode drive would spawn `node <vitest-entry> … -p "/<slug>"` and
//     die instantly as a fail-closed infra error. Point argv[1] at the real pi
//     CLI entry so rung 1 resolves the child the way a real `pi` parent does.
//   • extension identity — without the #subagent-extension-pin env (bug 0002
//     defect 2) the child relies on ambient extension discovery and can bind a
//     stale globally-installed theta build (or none at all) instead of THIS
//     working tree. Pin every spawned child to the tree under test, exactly as
//     the H9a acceptance harness and the hardening probe harness do.
// Both mutations are process-global but vitest isolates each test FILE in its
// own worker process, so they scope to this harness's importers.
process.argv[1] = fileURLToPath(
  new URL("../../node_modules/@earendil-works/pi-coding-agent/dist/cli.js", import.meta.url),
);
process.env[SUBAGENT_EXTENSION_PIN_ENV] = fileURLToPath(
  new URL("../../extensions", import.meta.url),
);
// The control plane is authenticated (subagent.md
// #subagent-control-plane-authentication): `readParentEnv` honours `PI_THETA_*`
// only when the parent-pid carriage names this process's real parent. A
// harness topping a chain authenticates its own pin the same way a real
// launcher authenticates a child's — without this line the pin above is
// silently stripped and every child falls back to ambient discovery.
process.env[SUBAGENT_PARENT_PID_ENV] = String(process.ppid);

/** A live model resolved from `getAvailable()`. */
export type LiveModel = ReturnType<ModelRegistry["getAvailable"]>[number];

/** Fail loudly (never a silent skip — *No silent test skipping*), narrowing to `never`. */
export function failLoudly(message: string): never {
  assert.fail(message);
  // `assert.fail` throws; the explicit throw guarantees the `never` return.
  throw new Error(message);
}

export interface LiveProvider {
  readonly modelRuntime: ModelRuntime;
  readonly modelRegistry: ModelRegistry;
  readonly model: LiveModel;
  readonly modelId: string;
}

/**
 * Resolve the live-host precondition: a configured, credentialed live
 * provider/model. When none is configured this **fails loudly** naming the
 * missing precondition (never a silent skip), per the leaf's *fails loudly when
 * its live-provider precondition is unmet*. Model selection is the ONE rule
 * every `npm run test:live` half shares (this resolver, the acceptance
 * harness, and the probe harness): prefer `claude-sonnet-5`, else the first
 * `sonnet` id, else the first available model.
 */
export async function requireLiveProvider(): Promise<LiveProvider> {
  // 0.80.x: `ModelRegistry.create` is gone and `AuthStorage` is no longer a
  // public root export. Build the canonical `ModelRuntime` (its default
  // `CredentialStore` reads the operator's `agentDir/auth.json`), wrap it in the
  // synchronous `ModelRegistry` facade, and `refresh()` before the synchronous
  // `getAvailable()` read. The `ModelRuntime` is what `createAgentSession` now
  // takes to supply credentials (no `authStorage` option).
  const modelRuntime = await ModelRuntime.create();
  const modelRegistry = new ModelRegistry(modelRuntime);
  await modelRegistry.refresh();
  const available = modelRegistry.getAvailable();
  if (available.length === 0) {
    failLoudly(
      "live-host precondition unmet: no live provider/model is configured " +
        "(ModelRegistry.getAvailable() is empty). Configure a provider and " +
        "credentials before running `npm run test:live`; this suite never " +
        "silently skips.",
    );
  }
  const preferredFirst = ["claude-sonnet-5"];
  const idOf = (m: LiveModel): string => (m as { id?: string }).id ?? "";
  const model =
    preferredFirst
      .map((id) => available.find((m) => idOf(m) === id))
      .find((m): m is LiveModel => m !== undefined) ??
    available.find((m): m is LiveModel => idOf(m).includes("sonnet")) ??
    available[0];
  if (model === undefined) {
    failLoudly("live-host precondition unmet: no resolvable live model.");
  }
  return { modelRuntime, modelRegistry, model, modelId: idOf(model) };
}

/** A `.theta` file to plant on disk before discovery runs. */
export interface PlantedTheta {
  /** Discovery source: the project `<cwd>/.pi/theta/` walk, or a `--theta <dir>` CLI source. */
  readonly source: "project" | "cli";
  /** The filename stem — the slash-command name discovery must register. */
  readonly stem: string;
  /** The `.theta` source text. */
  readonly text: string;
}

export interface LiveWorkspace {
  readonly cwd: string;
  /** Directories to hand to the `--theta` CLI source (one per planted `cli` theta's parent). */
  readonly cliThetaDirs: readonly string[];
  dispose(): void;
}

/**
 * Materialise a throwaway workspace and plant the `.theta` files on the real
 * filesystem so the real `V10a` discovery walk over the real `V8b` `PiFileSystem`
 * reads them (no in-memory fixture-supply).
 */
export function plantThetaWorkspace(thetas: readonly PlantedTheta[]): LiveWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-live-"));
  const projectThetaDir = join(cwd, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  const cliThetaDirs: string[] = [];
  for (const theta of thetas) {
    if (theta.source === "project") {
      writeFileSync(join(projectThetaDir, `${theta.stem}.theta`), theta.text, "utf8");
    } else {
      const cliDir = mkdtempSync(join(tmpdir(), "theta-live-cli-"));
      writeFileSync(join(cliDir, `${theta.stem}.theta`), theta.text, "utf8");
      cliThetaDirs.push(cliDir);
    }
  }
  return {
    cwd,
    cliThetaDirs,
    dispose(): void {
      rmSync(cwd, { recursive: true, force: true });
      for (const dir of cliThetaDirs) {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

export interface LiveExtensionHandle {
  readonly session: AgentSession;
  readonly runner: ExtensionRunner;
  /**
   * The in-memory `SessionManager` backing the session — the deterministic
   * settled-transcript read used to observe `theta-system-note` entries (the
   * SLSH-3 top-level err note, panic framings, …) independent of event timing.
   */
  readonly sessionManager: SessionManager;
  /** The slash command discovery registered under `stem`, or `undefined` if none. */
  command(stem: string): ResolvedCommand | undefined;
  /** Slash-command names the shipped extension registered after `session_start`. */
  registeredNames(): readonly string[];
  dispose(): Promise<void>;
}

/**
 * Boot a live `AgentSession` with ONLY the shipped extension (loaded through the
 * real `extensions/index.ts` entry), optionally wiring `--theta` CLI discovery
 * sources, then fire `session_start` so the extension runs its real
 * `resources_discover` walk and `pi.registerCommand` step. Returns a handle for
 * inspecting registered commands and driving live turns.
 */
export async function bootShippedExtension(options: {
  readonly workspace: LiveWorkspace;
  readonly provider: LiveProvider;
}): Promise<LiveExtensionHandle> {
  const { workspace, provider } = options;
  const agentDir = getAgentDir();
  const resourceLoader = new DefaultResourceLoader({
    cwd: workspace.cwd,
    agentDir,
    // Load theta the way Pi loads it — through the shipped entry — and ONLY it,
    // so no unrelated installed extension shares the flag/command namespace.
    additionalExtensionPaths: [SHIPPED_EXTENSION_ENTRY],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();

  const sessionManager = SessionManager.inMemory(workspace.cwd);
  const { session } = await createAgentSession({
    cwd: workspace.cwd,
    agentDir,
    // 0.80.x: credentials/auth reach the session through the `ModelRuntime`
    // (the `authStorage`/`modelRegistry` session options were removed).
    modelRuntime: provider.modelRuntime,
    model: provider.model,
    resourceLoader,
    sessionManager,
  });

  const runner = session.extensionRunner;
  // Wire the `--theta <dir>` CLI discovery source(s) before `session_start` fires
  // the discovery walk, so the walk is proven source-general.
  if (workspace.cliThetaDirs.length > 0) {
    // Multiple paths join with path.delimiter, never "," — the discovery
    // CLI-source convention (discovery-sources.md).
    runner.setFlagValue("theta", workspace.cliThetaDirs.join(delimiter));
  }
  // Fire `session_start` (and `resources_discover`): the shipped extension's
  // real registration step runs here.
  await session.bindExtensions({});

  return {
    session,
    runner,
    sessionManager,
    command: (stem: string) => runner.getCommand(stem),
    registeredNames: () => runner.getRegisteredCommands().map((c) => c.name),
    dispose: async (): Promise<void> => {
      // Bug 0018: a bare `AgentSession.dispose()` invalidates the extension
      // runtime WITHOUT emitting `session_shutdown` first (only the host's
      // replacement/quit paths emit it), so theta's step-4 teardown never runs
      // and an armed watcher outlives the runtime. Mirror the host's own
      // graceful path — `AgentSessionRuntime.dispose()` awaits
      // `emitSessionShutdownEvent(runner, { type: "session_shutdown",
      // reason: "quit" })` before `session.dispose()` — via the public
      // `ExtensionRunner.emit`, guarded like the host helper.
      if (runner.hasHandlers("session_shutdown")) {
        await runner.emit({ type: "session_shutdown", reason: "quit" });
      }
      session.dispose();
      await Promise.resolve();
    },
  };
}

/**
 * Drive one live turn by invoking a registered slash command and capture the
 * assistant's streamed text. Used by the prompt-mode / typed-query bullets AFTER
 * their discovery→registration precondition holds (post-`H8a`); in the current
 * red state the command is absent and the caller reds before reaching here.
 */
export async function driveSlashCaptureText(
  session: AgentSession,
  slashInvocation: string,
): Promise<string> {
  return (await driveSlash(session, slashInvocation)).text;
}

/** What one driven slash invocation made observable. */
export interface DrivenTurn {
  /** Streamed assistant text of the user session (stochastic). */
  readonly text: string;
  /**
   * Exact user-turn text(s) appended to the user session during THIS drive,
   * read off the settled in-memory `SessionManager` after `prompt()` resolves
   * (deterministic; no dependence on event timing). A prompt-mode `@`-query's
   * QRY-18 rendered template lands here — the free-phase turn of a TYPED query
   * included (`LivePromptQueryModel` issues it via `pi.sendUserMessage`; only
   * the forced respond turn is off-session) — so this is the outbound-render
   * observable: the exact text the theta CODE computed and sent, independent
   * of the model's reply. Mirrors the hardening probe harness's `userTexts`
   * channel.
   */
  readonly userTexts: readonly string[];
  /**
   * `theta-system-note` channel entries appended during THIS drive, read off
   * the settled in-memory `SessionManager` after `prompt()` resolves
   * (deterministic; no dependence on event timing). EVERY fail-closed ending
   * of a top-level drive lands here — the SLSH-3 err note
   * (`theta /<name> returned Err: …`), the cancelled note (`theta /<name>
   * cancelled`), and the panic framings (`theta /<name> aborted…`) — so a test
   * asserting their absence reds when the drive failed, even though `prompt()`
   * itself resolves (failures are surfaced as notes, not throws).
   */
  readonly systemNotes: readonly string[];
}

/**
 * Drive one live turn via a registered slash command and capture BOTH the
 * streamed assistant text and the `theta-system-note` entries the drive
 * appended. Used where the pass/fail observable is the note channel — e.g. the
 * subagent-mode drive, whose spawned transcript is private (no user-session
 * text streams), leaving the absence of a fail-closed note as the success
 * signal.
 */
export async function driveSlashCaptureTurn(
  handle: LiveExtensionHandle,
  slashInvocation: string,
): Promise<DrivenTurn> {
  const entriesBefore = handle.sessionManager.getEntries().length;
  const driven = await driveSlash(handle.session, slashInvocation);
  // Slice off only the entries THIS drive appended, then extract the
  // `theta-system-note` channel contents (string or text-part-array content)
  // and the user-turn texts (the deterministic outbound-render channel).
  const appended = handle.sessionManager.getEntries().slice(entriesBefore);
  return {
    text: driven.text,
    userTexts: collectUserTexts(appended),
    systemNotes: collectSystemNotes(appended),
  };
}

/**
 * Extract the user-turn text(s) from a slice of in-memory SessionManager
 * entries — the settled-transcript source of truth for what the theta code
 * sent to the model. A user turn is a `type:"message"` entry whose
 * `message.role === "user"`; its `content` is a string or a text-part array.
 * Mirrors the hardening probe harness's `collectUserTexts` (deterministic read
 * off the settled transcript after `await session.prompt(...)` resolves).
 */
function collectUserTexts(entries: readonly unknown[]): readonly string[] {
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
 * Extract the `theta-system-note` channel contents from a slice of in-memory
 * SessionManager entries (their `content`, string or text-part array). Mirrors
 * the hardening probe harness's reader of the same channel.
 */
function collectSystemNotes(entries: readonly unknown[]): readonly string[] {
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

async function driveSlash(
  session: AgentSession,
  slashInvocation: string,
): Promise<{ text: string }> {
  let text = "";
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "message_update") {
      const inner = event.assistantMessageEvent;
      if (inner.type === "text_delta") {
        text += inner.delta;
      }
    }
  });
  try {
    await session.prompt(slashInvocation);
  } finally {
    unsubscribe();
  }
  return { text };
}
