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
// tests/b0448-imported-non-object-ctor.test.ts and
// tests/b0450-imported-enum-system-param.test.ts each independently redeclared
// just the `fakeThetaLibFs` double itself (PTQ-0393); both now import the
// export below instead.
//
// TIER: offline, deterministic, provider-free — also used for attribution
// guards before live acceptance tests cross the host boundary.

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
  type ProductionProducerInput,
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
import type { FileSystem } from "../../src/seams/file-system";
import { parseDeps, parseDoc } from "./e2e-s1";
import { SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT } from "./invoke-seam-scaffold";

/** The importing `.theta` frontmatter every fixture in this family shares. */
// Bug 0479: the pin names the registry double's qualified `provider/id` (equal
// to every caller's `ctx.model`), not its display name — the dispatch-time
// exact-match rule reads the id, so a display-name pin would refuse the turn.
const APP_FRONTMATTER = ["---", 'model: "anthropic/claude-sonnet-5"', "mode: prompt", "---"].join("\n");

/**
 * An in-memory `.thetalib` filesystem double: `readdir` / `readBytes` answer
 * from a flat path→content map (a directory listing is derived from the map's
 * own keys). Paths in `unreadable` are also listed, but `readBytes` rejects
 * them with an EACCES-shaped error (the listed-but-unreadable live witness).
 * Every other `FileSystem` member rejects loudly so an unexpected call reds
 * rather than returning a silent default.
 */
export function fakeThetaLibFs(
  files: Record<string, string>,
  unreadable: readonly string[] = [],
): FileSystem {
  const dirs = new Map<string, string[]>();
  const list = (path: string): void => {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  };
  for (const path of Object.keys(files)) list(path);
  for (const path of unreadable) list(path);
  const unreadableSet = new Set(unreadable);
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
      if (unreadableSet.has(path)) {
        return Promise.reject(
          Object.assign(new Error(`EACCES: permission denied, open '${path}'`), {
            code: "EACCES",
          }),
        );
      }
      const content = Object.prototype.hasOwnProperty.call(files, path)
        ? files[path]
        : undefined;
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}

/**
 * The load-pass diagnostic codes for one theta over an in-memory lib set — the
 * cross-file attribution channel `parseThetaDocument` alone cannot reach.
 */
export async function importCheckCodes(
  thetaText: string,
  thetaPath: string,
  libs: Record<string, string>,
): Promise<readonly string[]> {
  const app = parseDoc(thetaText, thetaPath);
  expect(
    app.frontmatter,
    `attribution: ${thetaPath} frontmatter must parse or the load pass reads nothing`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: thetaPath,
    frontmatter: app.frontmatter as ParsedFrontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return check.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

/** The reshaped result of one `checkThetaImports` load over a fake `.thetalib` tree. */
export interface LoadResult {
  readonly appParseCodes: string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly diagLines: string[];
  readonly materialised: string[];
  readonly rendered: string[];
}

/** Parse an importing `.theta` body under the shared prompt-mode frontmatter. */
export function parseImportingApp(body: string, sourcePath = "/proj/app.theta"): ThetaDocument {
  return parseThetaDocument(
    { path: sourcePath, bytes: new TextEncoder().encode(`${APP_FRONTMATTER}\n${body}`) },
    parseDeps(),
  );
}

/** Every diagnostic rendered `<severity> <code> <file>: <message>`. */
export function renderThetaLibDiags(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map(
    (d) => `${d.severity} ${d.code} ${d.file === undefined ? "-" : d.file}: ${d.message}`,
  );
}

/**
 * Parse `/proj/app.theta` (given only its body — the shared frontmatter above
 * is prepended) and run the real `checkThetaImports` over `libs`, returning
 * the materialised names and load diagnostics, with and without file names.
 * An already-parsed `/proj/app.theta` may be supplied so callers can assert
 * parse-tier diagnostics before driving the load pass over the same document.
 *
 * The importing theta's frontmatter is asserted to parse — if it did not the
 * load pass would read nothing and a later red would be a harness fault rather
 * than the missing diagnostic under witness.
 */
export async function loadThetaLibDiags(
  appBody: string | ThetaDocument,
  libs: Record<string, string>,
): Promise<LoadResult> {
  const app = typeof appBody === "string" ? parseImportingApp(appBody) : appBody;
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
    materialised: check.imports.map((m) => `${m.kind} ${m.name}`),
    rendered: renderThetaLibDiags(check.diagnostics),
  };
}

/** Assert that the library resolved and exported the symbol before checking a load-pass verdict. */
export function expectMaterialisedImport(
  result: LoadResult,
  expected: string,
  cell: string,
  reason: string,
): void {
  expect(
    result.materialised,
    `PRECONDITION (${cell}): the load pass must materialise \`${expected}\`; that is the proof ${reason}. Diagnostics: ${JSON.stringify(result.rendered)}`,
  ).toContain(expected);
}

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

/** Optional child-launch substrate for imported-body witnesses that cross a process boundary. */
export type ImportedBodyOverrides = Partial<Pick<
  ProductionProducerInput,
  "root" | "subagentSpawn" | "subagentExecutableHost" | "subagentParentEnv" | "subagentParentPid"
>> & {
  readonly ctx?: ExtensionCommandContext;
};

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
 * `subagentInboundInvokeDepth` seeds the shared invoke-chain counter for
 * cross-file depth witnesses; absent means the producer starts at zero.
 * `overrides` supplies the root, context and spawn substrate for child-launch
 * witnesses; omitted fields retain the inert defaults.
 */
export async function bindImportedBodyOverFs(
  appBody: string,
  sourcePath: string,
  fs: FileSystem,
  modelRegistry: ModelRegistry,
  subagentInboundInvokeDepth?: number,
  overrides: ImportedBodyOverrides = {},
): Promise<ImportedBodyBinding> {
  const app = parseImportingApp(appBody, sourcePath);
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

  const { ctx, ...producerOverrides } = overrides;
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
    ...(subagentInboundInvokeDepth !== undefined ? { subagentInboundInvokeDepth } : {}),
    ...producerOverrides,
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
    ctx: ctx ?? ({} as unknown as ExtensionCommandContext),
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
  subagentInboundInvokeDepth?: number,
  overrides: ImportedBodyOverrides = {},
): Promise<ImportedBodyBinding> {
  return bindImportedBodyOverFs(
    appBody,
    "/proj/app.theta",
    fakeThetaLibFs(libs),
    modelRegistry,
    subagentInboundInvokeDepth,
    overrides,
  );
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
