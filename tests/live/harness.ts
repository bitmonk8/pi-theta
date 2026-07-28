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
// token-bounded: the discovery→registration precondition reds BEFORE any model
// turn is driven (the shipped production composition root supplies no discovered
// fixtures, so no `.theta`-derived slash command registers), which is exactly the
// intended-reason red for this leaf.

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

/** The shipped Pi extension entry — the way Pi loads theta (re-exports the `src/**` factory). */
export const SHIPPED_EXTENSION_ENTRY = fileURLToPath(
  new URL("../../extensions/index.ts", import.meta.url),
);

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

  const { session } = await createAgentSession({
    cwd: workspace.cwd,
    agentDir,
    // 0.80.x: credentials/auth reach the session through the `ModelRuntime`
    // (the `authStorage`/`modelRegistry` session options were removed).
    modelRuntime: provider.modelRuntime,
    model: provider.model,
    resourceLoader,
    sessionManager: SessionManager.inMemory(workspace.cwd),
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
    command: (stem: string) => runner.getCommand(stem),
    registeredNames: () => runner.getRegisteredCommands().map((c) => c.name),
    dispose: async (): Promise<void> => {
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
  return text;
}
