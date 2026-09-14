// A shared "drive the real `checkThetaImports` over an in-memory `.thetalib`
// tree" load harness (PTQ-0232), extended with a "materialise the import,
// then bind the importing body for `executeBody`" driver (PTQ-0315).
//
// WHY THIS FILE EXISTS. tests/b0333-transitive-lib-reexport-edge.test.ts,
// tests/b0334-reexport-multisource-collision.test.ts and
// tests/b0335-own-import-shadows-own-declaration.test.ts each independently
// redeclared the same three-piece bundle: a `fakeThetaLibFs` double that
// derives a directory listing from a flat path→content map and serves only
// `readdir`/`readBytes`, a three-field `LoadResult` shape, and an `async`
// driver that parses the importing theta (against a shared frontmatter),
// asserts the parse succeeded, drives the real `checkThetaImports`, and
// reshapes its output. This module centralises that bundle so the three
// files import it rather than redeclare it.
//
// tests/b0303-imported-fn-body-declaring-scope.test.ts,
// tests/b0305-enum-alias-identity.test.ts and
// tests/b0306-imported-enum-wire-values.test.ts each went one step further and
// independently redeclared a second bundle on top: the same parse +
// `checkThetaImports` sequence, then a `createProductionProducerDeps(...)
// .bindPromptConversation` build over a frozen empty callable set, ready for
// the caller's own `executeBody` call. `bindImportedBody` below centralises
// that sequence; each of the three files' own `run()`/`measure()` is now a
// thin wrapper supplying the one or two things that vary (the `modelRegistry`
// stub, whether a thrown panic is captured as a value) and shaping the
// settled outcome into its own local return shape. `expectCleanImportLoad`
// centralises the three-assertion "parses clean, load pass silent,
// materialised the expected names" precondition shape those same three files
// each declared their own near-identical wrapper for.
//
// tests/b0361-case-variant-import-dir-identity.test.ts independently
// redeclared that same parse/check/bind sequence a fourth time because its
// defect reproduces only over a REAL filesystem, which `bindImportedBody`'s
// hardcoded in-memory `fakeThetaLibFs` cannot drive.
// `bindImportedBodyOverFs` below generalises the sequence over a
// caller-supplied `sourcePath` and `FileSystem`; `bindImportedBody` is now the
// `fakeThetaLibFs`-at-`/proj/app.theta` specialisation of it (PTQ-0347).
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.

import { expect } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import { checkThetaImports, type ThetaImportCheck } from "../../src/extension/import-static-checks";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../../src/extension/production-theta-producer";
import type {
  BodyExecutingConversationBinding,
  ConversationBindInput,
  ThetaCompositionInput,
} from "../../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../../src/parser/frontmatter";
import { parseThetaDocument, type ThetaDocument } from "../../src/parser/theta-document";
import type { MaterializedImport } from "../../src/runtime/lexical-environment";
import type { AgentToolResultEnvelope } from "../../src/runtime/tool-call-execute";
import type { RuntimeRoot } from "../../src/runtime-root";
import type { Checkpoint } from "../../src/seams/checkpoint";
import type { FileSystem } from "../../src/seams/file-system";
import { parseDeps } from "./e2e-s1";

/** The importing `.theta` frontmatter every fixture in this family shares. */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

/**
 * An in-memory `.thetalib` filesystem double: `readdir` / `readBytes` answer
 * from a flat path→content map (a directory listing is derived from the map's
 * own keys); every other `FileSystem` member rejects loudly so an unexpected
 * call reds rather than returning a silent default.
 */
export function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}

/** The reshaped result of one `checkThetaImports` load over a fake `.thetalib` tree. */
export interface LoadResult {
  readonly appParseCodes: string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly diagLines: string[];
}

/**
 * Parse `/proj/app.theta` (given only its body — the shared frontmatter above
 * is prepended) and run the real `checkThetaImports` over `libs`, returning
 * the load pass's diagnostics rendered as `severity code: message`.
 *
 * The importing theta's frontmatter is asserted to parse — if it did not the
 * load pass would read nothing and a later red would be a harness fault rather
 * than the missing diagnostic under witness.
 */
export async function loadThetaLibDiags(
  appBody: string,
  libs: Record<string, string>,
): Promise<LoadResult> {
  const app = parseThetaDocument(
    { path: "/proj/app.theta", bytes: new TextEncoder().encode(`${APP_FRONTMATTER}\n${appBody}`) },
    parseDeps(),
  );
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return {
    appParseCodes: app.diagnostics.map((d) => d.code),
    diagnostics: check.diagnostics,
    diagLines: check.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
  };
}

/** A no-op `Checkpoint`: `bindImportedBody`'s cells checkpoint nothing observable. */
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** `resolvePiTool` resolves any name to an "AMBIENT" sentinel — no caller here consults it. */
function ambientResolvePiTool(name: string): PiToolDispatch {
  return {
    toolName: name,
    execute: (): Promise<AgentToolResultEnvelope> =>
      Promise.resolve({ content: [{ type: "text", text: "AMBIENT" }] }),
  };
}

/** The pieces `bindImportedBody` assembles: the parsed importer, the load pass, and the bound conversation. */
export interface ImportedBodyBinding {
  readonly app: ThetaDocument;
  readonly check: ThetaImportCheck;
  readonly binding: BodyExecutingConversationBinding;
}

/**
 * Parse the importing theta at `sourcePath` (its body only — the shared
 * frontmatter above is prepended), run the real `checkThetaImports` over
 * `fs`, then bind the real `executeBody` deps through
 * `createProductionProducerDeps(...).bindPromptConversation` with a frozen
 * empty callable set — the shared "materialise a `.thetalib` import, then
 * execute the importing body" driver that recurred byte-for-byte (or
 * near-identically) across tests/b0303-imported-fn-body-declaring-scope.test.ts,
 * tests/b0305-enum-alias-identity.test.ts and
 * tests/b0306-imported-enum-wire-values.test.ts (PTQ-0315), generalised over
 * the filesystem the load pass is driven over so
 * tests/b0361-case-variant-import-dir-identity.test.ts can drive it over a
 * REAL `PiFileSystem` instead of the in-memory `fakeThetaLibFs` double
 * (PTQ-0347). The caller drives `executeBody(app.body, binding.executeDeps)`
 * itself and shapes the settled value — that shaping (and whether a thrown
 * panic is captured as a value) is where callers' own needs diverge.
 *
 * The callable set is a frozen empty snapshot and `resolvePiTool` resolves any
 * name to an "AMBIENT" sentinel, so an ambient host-tool execution would
 * surface rather than be mistaken for a resolved import — no caller consults
 * it. `modelRegistry` is caller-supplied: `evalSubagentFnCall`'s in-process
 * session switch reads `getAvailable` to resolve a spawned session's model, so
 * a caller driving a `subagent fn` cell must populate it; a caller with no
 * such cell passes an empty stub (`{}` cast to `ModelRegistry`).
 */
export async function bindImportedBodyOverFs(
  appBody: string,
  sourcePath: string,
  fs: FileSystem,
  modelRegistry: ModelRegistry,
): Promise<ImportedBodyBinding> {
  const app = parseThetaDocument(
    { path: sourcePath, bytes: new TextEncoder().encode(`${APP_FRONTMATTER}\n${appBody}`) },
    parseDeps(),
  );
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath,
    frontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs,
    parseDeps: parseDeps(),
  });
  const imports: readonly MaterializedImport[] = check.imports;

  const deps = createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: {
      checkpoint: NOOP_CHECKPOINT,
      idSource: {
        newInvocationId: (): string => "inv-1",
        newToolCallId: (): string => "tc-1",
      },
    } as unknown as RuntimeRoot,
    modelRegistry,
    resolvePiTool: ambientResolvePiTool,
  });
  const theta: ThetaCompositionInput = {
    slashName: "app",
    sourcePath,
    frontmatter,
    body: app.body,
    callableSet: Object.freeze({ entries: new Map() }),
    ...(imports.length > 0 ? { imports } : {}),
  } as ThetaCompositionInput;
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = deps.bindPromptConversation(bindInput);
  return { app, check, binding };
}

/**
 * `bindImportedBodyOverFs` specialised over the in-memory `fakeThetaLibFs`
 * double at the fixed `/proj/app.theta` source path — the shape
 * tests/b0303-imported-fn-body-declaring-scope.test.ts,
 * tests/b0305-enum-alias-identity.test.ts and
 * tests/b0306-imported-enum-wire-values.test.ts share (PTQ-0315).
 */
export async function bindImportedBody(
  appBody: string,
  libs: Record<string, string>,
  modelRegistry: ModelRegistry,
): Promise<ImportedBodyBinding> {
  return bindImportedBodyOverFs(appBody, "/proj/app.theta", fakeThetaLibFs(libs), modelRegistry);
}

/** The three-field shape `expectCleanImportLoad` checks: parse codes, load diagnostics, materialised imports. */
export interface CleanLoadRow {
  readonly appParseCodes: readonly string[];
  readonly diagLines: readonly string[];
  readonly materialised: readonly string[];
}

/**
 * Assert the shared precondition every `bindImportedBody` cell shares: the
 * importing theta parses clean, the load pass reports nothing, and the import
 * materialised the expected local names. Asserted BEFORE the runtime value so
 * a load regression reds as an unmet precondition, not as the defect under
 * test. `diagMessage` / `materialisedMessage` carry each caller's own spec
 * citation — the failure prose is bug-specific even though the
 * three-assertion shape is not.
 */
export function expectCleanImportLoad(
  row: CleanLoadRow,
  label: string,
  diagMessage: string,
  materialisedMessage: string,
  expectedMaterialised: readonly string[],
): void {
  expect(row.appParseCodes, `${label}: the importing file parses clean`).toEqual([]);
  expect(row.diagLines, `${label}: ${diagMessage}`).toEqual([]);
  expect(row.materialised, `${label}: ${materialisedMessage}`).toEqual(expectedMaterialised);
}
