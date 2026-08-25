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
  /**
   * Additional Pi extension entries to load ALONGSIDE the shipped theta entry,
   * appended after `SHIPPED_EXTENSION_ENTRY` in `additionalExtensionPaths`.
   * Optional and additive: when absent the list is byte-identical to the
   * single-entry list every existing caller has always got, so no existing
   * H8a cell changes behaviour. Its one use is the input class that is
   * reachable only through a THIRD-PARTY extension's `pi.registerTool` —
   * a host registry name that is not lowercase-first, which no built-in and
   * no shipped theta tool can publish (bug 0108's live leg).
   */
  readonly extraExtensionPaths?: readonly string[];
}): Promise<LiveExtensionHandle> {
  const { workspace, provider } = options;
  const extraExtensionPaths = options.extraExtensionPaths ?? [];
  const agentDir = getAgentDir();
  const resourceLoader = new DefaultResourceLoader({
    cwd: workspace.cwd,
    agentDir,
    // Load theta the way Pi loads it — through the shipped entry — and ONLY it,
    // so no unrelated installed extension shares the flag/command namespace.
    additionalExtensionPaths: [SHIPPED_EXTENSION_ENTRY, ...extraExtensionPaths],
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
 *
 * SINGLE-TURN-ONLY. This keeps the `text_delta` event-stream path: it takes a
 * bare `AgentSession`, with no `SessionManager` handle to read a settled
 * transcript from, so it cannot close on a turn boundary the way
 * `driveSlashCaptureTurn` does. A drive that issues more than one on-session
 * model turn must use `driveSlashCaptureTurn` instead — bug 0287 is the
 * accumulator defect this shape has for a multi-turn drive: the stream can
 * settle after `unsubscribe()` fires and silently drop a later turn's text.
 * Routing this function's existing callers through a handle-taking form would
 * touch `tests/live/live-production-acceptance.test.ts`, which bug 0287's
 * §Fix holds byte-untouched (line count fixed at 14864).
 */
export async function driveSlashCaptureText(
  session: AgentSession,
  slashInvocation: string,
): Promise<string> {
  return (await driveSlash(session, slashInvocation)).text;
}

/** What one driven slash invocation made observable. */
export interface DrivenTurn {
  /**
   * Assistant text of the user session, one string per model turn (bug 0287's
   * §Fix items 1–2), joined in transcript order with no separator — the same
   * bare concatenation the prior `text_delta` accumulator produced for a
   * single turn, extended across turns because the source is now the settled
   * slice rather than a subscription window. Read off the settled in-memory
   * `SessionManager` after the drive's last turn settles (deterministic; no
   * dependence on event timing) via `collectAssistantTexts`, mirroring how
   * `userTexts` and `systemNotes` are already derived below.
   */
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
 * Drive one live turn via a registered slash command and capture the settled
 * transcript's assistant text, user turns and `theta-system-note` entries.
 * Used where the pass/fail observable is the note channel — e.g. the
 * subagent-mode drive, whose spawned transcript is private (no user-session
 * text streams), leaving the absence of a fail-closed note as the success
 * signal — and for any drive whose body issues more than one on-session model
 * turn (bug 0287: a whole-drive event accumulator can drop a later turn's
 * stream; reading the settled transcript once the LAST on-session query's reply
 * has landed — or a fail-closed note appended after it explains the absence —
 * cannot). See `lastTurnSettled` for exactly which shapes count as settled.
 */
export async function driveSlashCaptureTurn(
  handle: LiveExtensionHandle,
  slashInvocation: string,
): Promise<DrivenTurn> {
  const entriesBefore = handle.sessionManager.getEntries().length;
  await handle.session.prompt(slashInvocation);
  // `prompt()` resolving is not "the drive's last turn settled" (bug 0287): a
  // prompt-mode body's `@`-queries are dispatched fire-and-forget
  // (`pi.sendUserMessage` returns before the run it schedules installs its
  // active-run handle), so wait for the appended slice itself to carry the
  // last turn's reply before reading it.
  const appended = await waitForLastTurnSettled(
    handle.sessionManager,
    entriesBefore,
    slashInvocation,
  );
  return {
    text: collectAssistantTexts(appended).join(""),
    userTexts: collectUserTexts(appended),
    systemNotes: collectSystemNotes(appended),
  };
}

// Bug 0287 §Fix item 3 — bounded poll cadence and total wait for the appended
// slice to carry the drive's last turn. No per-turn settled/idle signal is
// exposed to this harness (`ctx.waitForIdle()` on the production side resolves
// immediately while no run is active, per bug 0287's root-cause read), so this
// polls a real macrotask timer over the entry slice instead of reusing one.
// 40ms sits inside the 25–50ms band that keeps a settled two-turn drive's wait
// a handful of ticks; the 375-iteration bound gives ~15s total, generously
// above the production start-poll's own bound (`TURN_START_POLL_BOUND = 1000`
// iterations at `POLL_INTERVAL_MS = 10` in `production-theta-producer.ts`, i.e.
// ~10s, not the 1000ms its iteration count alone suggests) while staying
// finite so a genuinely stuck drive fails loudly instead of hanging the suite.
const ASSISTANT_TURN_POLL_INTERVAL_MS = 40;
const ASSISTANT_TURN_POLL_BOUND = 375;

/**
 * Poll the appended `SessionManager` slice until `lastTurnSettled` accepts it —
 * the turn-complete condition bug 0287's §Fix item 3 requires. Expiry of the
 * bound fails loudly naming the unmet precondition, per AGENTS.md §"No silent
 * skipping": returning a silently short `text` instead is exactly the defect
 * this fix removes.
 */
async function waitForLastTurnSettled(
  sessionManager: SessionManager,
  entriesBefore: number,
  slashInvocation: string,
): Promise<readonly unknown[]> {
  for (let attempt = 0; attempt < ASSISTANT_TURN_POLL_BOUND; attempt++) {
    const appended = sessionManager.getEntries().slice(entriesBefore);
    if (lastTurnSettled(appended)) return appended;
    await new Promise<void>((resolve) =>
      setTimeout(resolve, ASSISTANT_TURN_POLL_INTERVAL_MS),
    );
  }
  const appended = sessionManager.getEntries().slice(entriesBefore);
  const userTurnCount = collectUserTexts(appended).length;
  const assistantTextCount = collectAssistantTexts(appended).length;
  const notePresent = collectSystemNotes(appended).length > 0;
  const boundMs = ASSISTANT_TURN_POLL_BOUND * ASSISTANT_TURN_POLL_INTERVAL_MS;
  failLoudly(
    `driveSlashCaptureTurn(${JSON.stringify(slashInvocation)}) precondition unmet: ` +
      `the appended transcript slice held ${userTurnCount} user turn(s), ` +
      `${assistantTextCount} assistant text part(s) and ` +
      `${notePresent ? "a" : "no"} theta-system-note entry, and the LAST user ` +
      `turn's reply never settled into the transcript within ${boundMs}ms ` +
      `(bug 0287).`,
  );
}

/**
 * Whether the appended slice may be read as the drive's settled transcript.
 * Accepts on any of three disjoint reasons:
 *
 * A. No user-role message entry at all. A slash invocation itself appends no
 *    user-role entry, so this is the real shape of a drive that never put a
 *    query on this session — a subagent-mode drive, whose spawned transcript is
 *    private, or a fail-closed drive that never sent. Such drives assert on
 *    `systemNotes`, so waiting out the bound would slow the suite for a
 *    property no caller observes.
 * B. Some assistant-role message entry AFTER the LAST user-role entry
 *    contributes a NON-EMPTY text part. Presence of an assistant entry alone is
 *    not enough: an assistant entry can be thinking-only or thinking+toolCall
 *    with no text part at all (`ThinkingContent` carries `thinking`, not
 *    `text`), and accepting one of those returns the EARLIER turn's reply as
 *    the drive's text — the divergence bug 0287 documents. Demanding real text
 *    is what makes the read turn-complete.
 * C. A `theta-system-note` entry appended AFTER the LAST user-role entry — the
 *    same post-last-user slice B scores. A fail-closed or cancelled ending
 *    EXPLAINS a missing reply, so such a drive must reach its cell's own
 *    assertions rather than wait out the bound and fail on the wait. The window
 *    is what keeps this from admitting a still-running turn: the SLSH-3 err
 *    note, the cancelled note and the panic framings are all emitted after the
 *    query's user entry, whereas the BND-1 bind echo (`Running /<name>: …`,
 *    `#emitBinderEchoNote` in `production-theta-producer.ts`) and the SLSH-1
 *    no-params overflow note precede the body and therefore every query it
 *    sends, so they can no longer short-circuit the wait for a `params:`-
 *    declaring theta's reply.
 */
function lastTurnSettled(entries: readonly unknown[]): boolean {
  let lastUserIndex = -1;
  for (let i = 0; i < entries.length; i++) {
    if (isMessageEntryWithRole(entries[i], "user")) lastUserIndex = i;
  }
  if (lastUserIndex === -1) return true;
  const afterLastUser = entries.slice(lastUserIndex + 1);
  if (collectAssistantTexts(afterLastUser).some((text) => text.length > 0)) {
    return true;
  }
  return collectSystemNotes(afterLastUser).length > 0;
}

/** Whether `entry` is a `type:"message"` entry whose `message.role` is `role`. */
function isMessageEntryWithRole(entry: unknown, role: string): boolean {
  const e = entry as { type?: string; message?: { role?: string } };
  return e.type === "message" && e.message?.role === role;
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
 * Extract the assistant-turn text(s) from a slice of in-memory SessionManager
 * entries — the settled-transcript source of truth `DrivenTurn.text` is
 * derived from (bug 0287). An assistant turn is a `type:"message"` entry whose
 * `message.role === "assistant"`; its `content` is a string or a text-part
 * array. Mirrors `collectUserTexts`'s walk and its deterministic-read claim:
 * read off the settled transcript after `await session.prompt(...)` resolves,
 * not off `text_delta` events, so a later turn cannot be lost to a subscription
 * window closing before its reply lands.
 */
export function collectAssistantTexts(
  entries: readonly unknown[],
): readonly string[] {
  const texts: string[] = [];
  for (const entry of entries) {
    const e = entry as {
      type?: string;
      message?: { role?: string; content?: unknown };
    };
    if (e.type !== "message" || e.message?.role !== "assistant") continue;
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
