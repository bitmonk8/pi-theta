import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { checkThetaImports } from "../src/extension/import-static-checks";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import type { MaterializedImport } from "../src/runtime/lexical-environment";
import { executeBody } from "../src/runtime/statement-executor";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import { type ThetaValue } from "../src/runtime/value";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { FileSystem } from "../src/seams/file-system";
import { parseDeps } from "./helpers/e2e-s1";

// Enum value identity is the DECLARING declaration, not the resolution-site
// local name. runtime-value-model.md:13 pins the interpreter-private tag as
// identifying "the declaring enum"; :29 keys equality on "the declaring-enum
// tag and the wire value". Two operands that are variants of ONE `enum Sev`
// declaration therefore carry the same tag and compare `==` true however each
// side is spelled at its access site. imports.md:37-43 sharpens the re-export
// route: an importing specifier naming a re-export's alias "binds that
// declaration under its local name, exactly as a direct import of the same
// declaration would" — so a value reached through `export { Sev as Level }`
// must be interchangeable with one reached by a direct `import { Sev }` of the
// same declaration.
//
// The seam mints the tag from the LOCAL binding name at the access site, not
// the declaring declaration: `materializeSymbol`
// (src/extension/import-static-checks.ts) carries `{ name: local, kind, variants }`
// with no declaring-file or declared-name identity, `buildEnvironment`
// registers each imported enum under its local name only
// (src/runtime/lexical-environment.ts), and `resolveEnumVariant` mints
// `makeEnumValue(enumName, …)` from the name the expression spelled. Two
// aliases of one declaration → two tags → equality (src/runtime/value.ts)
// compares those strings and yields `false`. D1 and D2 witness that false
// where :13/:29/:37-43 require true; D3 pins that the fix must key on
// declaration identity (declaring path + name), not name alone, so two
// DIFFERENT declarations stay false.
//
// TIER: unit, offline, deterministic, provider-free. The whole class settles
// inside one `parseThetaDocument` over a string, one `checkThetaImports` over
// an in-memory `FileSystem` double, and one `executeBody` bound through
// `createProductionProducerDeps` — the seam that mints the tag and the seam
// that compares tags are both reachable in-process, so an integration or live
// tier would add a provider to a decision no model participates in.

/** The importing `.theta` frontmatter every fixture shares. */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}

function parseApp(body: string): ThetaDocument {
  return parse(`${APP_FRONTMATTER}\n${body}`, "/proj/app.theta");
}

function fakeThetaLibFs(files: Record<string, string>): FileSystem {
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

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** One measured row: the load pass and the settled runtime value in both forms. */
interface Ran {
  readonly appParseCodes: string[];
  readonly diagLines: string[];
  readonly materialised: string[];
  /**
   * The JSON projection of the settled value. Each cell body evaluates an enum
   * `==` enum comparison, so this is the JSON boolean the equality produced —
   * the observable the rows assert.
   */
  readonly wire: unknown;
  /** The settled value object itself. */
  readonly raw: ThetaValue | undefined;
}

/**
 * Parse `/proj/app.theta`, run the real `checkThetaImports` over `libs`, then
 * run the real `executeBody` with whatever the load pass materialised.
 *
 * `resolvePiTool` would resolve any name to an "AMBIENT" sentinel and the
 * callable set is a frozen empty snapshot, so an ambient host-tool execution
 * would surface rather than be mistaken for a resolved import — no row here
 * consults it.
 */
async function run(appBody: string, libs: Record<string, string>): Promise<Ran> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `frontmatter must parse or the load pass reads nothing; parse diagnostics: ${JSON.stringify(
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
    modelRegistry: {} as unknown as ModelRegistry,
    resolvePiTool: (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (): Promise<AgentToolResultEnvelope> =>
        Promise.resolve({ content: [{ type: "text", text: "AMBIENT" }] }),
    }),
  });
  const theta: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
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
  const execution = await executeBody(app.body, binding.executeDeps);
  const value = execution.result.value;

  return {
    appParseCodes: app.diagnostics.map((d) => d.code),
    diagLines: check.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    materialised: check.imports.map((m) => `${m.kind} ${m.name}`),
    wire: value === undefined ? null : (JSON.parse(JSON.stringify(value)) as unknown),
    raw: value as ThetaValue | undefined,
  };
}

// The load pass must accept a well-formed import — the source lib declares the
// symbol and the path resolves — so a non-empty diagnostics list is an unmet
// precondition, not the symptom under test. Failing here loudly keeps a
// resolution regression from masquerading as the identity defect.
function expectCleanLoad(row: Ran, label: string, expectedMaterialised: string[]): void {
  expect(row.appParseCodes, `${label}: the importing file parses clean`).toEqual([]);
  expect(
    row.diagLines,
    `${label}: a well-formed enum import is legal at every gate; the load pass must report nothing`,
  ).toEqual([]);
  expect(
    row.materialised,
    `${label}: imports.md §Visibility exports the declaration, so each import must materialise under its local name`,
  ).toEqual(expectedMaterialised);
}

describe("bug 0305 — enum value identity is the declaring declaration, not the access-site name", () => {
  it("D1 RED (want true): two aliases of one declaration compare `==` true", async () => {
    // `import { Sev as A, Sev as B }` binds ONE declaration under two names.
    // runtime-value-model.md:13 keys the tag on "the declaring enum"; :29
    // compares "the declaring-enum tag and the wire value". Both operands are
    // the SAME `enum Sev` variant `Low`, so the tag and the wire agree and
    // `A.Low == B.Low` is true. The seam mints the tag from the access-site
    // name, so it yields false today — the witness is that false where true
    // is required.
    const row = await run(
      'import { Sev as A, Sev as B } from "./lib.thetalib"\nlet x = A.Low == B.Low\nx',
      { "/proj/lib.thetalib": "enum Sev { Low, High }" },
    );
    expectCleanLoad(row, "D1 two aliases", ["enum A", "enum B"]);
    expect(
      row.wire,
      "runtime-value-model.md:13,:29 — both operands are variants of the one declaring `enum Sev`; same tag, same wire, so `A.Low == B.Low` is true",
    ).toBe(true);
  });

  it("D1b CONTROL (green now and after): one binding compares equal to itself", async () => {
    // Absolute pin, not a comparison against D1: a single un-aliased binding
    // gives both operands the same access-site name, so the tag agrees under
    // any minting scheme. Green today and green after the fix — it proves D1's
    // red is the two-name divergence, not a general enum-equality break.
    const row = await run(
      'import { Sev } from "./lib.thetalib"\nlet x = Sev.Low == Sev.Low\nx',
      { "/proj/lib.thetalib": "enum Sev { Low, High }" },
    );
    expectCleanLoad(row, "D1b single binding", ["enum Sev"]);
    expect(
      row.wire,
      "runtime-value-model.md:29 — one binding, same tag and wire on both sides, so `Sev.Low == Sev.Low` is true",
    ).toBe(true);
  });

  it("D2 RED (want true): direct import vs re-export rename of one declaration compare `==` true", async () => {
    // `mid.thetalib` re-exports `base`'s `Sev` as `Level`. imports.md:37-43:
    // an importing specifier naming the re-export's downstream alias "binds
    // that declaration under its local name, exactly as a direct import of the
    // same declaration would" — so `Level.Low` and a directly-imported
    // `Sev.Low` are variants of the ONE `enum Sev` declaration and compare
    // true per runtime-value-model.md:13,:29. The seam mints one tag "Sev"
    // and one tag "Level", so it yields false today.
    const row = await run(
      'import { Sev } from "./base.thetalib"\nimport { Level } from "./mid.thetalib"\nlet x = Sev.Low == Level.Low\nx',
      {
        "/proj/base.thetalib": "enum Sev { Low, High }",
        "/proj/mid.thetalib": 'export { Sev as Level } from "./base.thetalib"\n',
      },
    );
    expectCleanLoad(row, "D2 direct-vs-reexport", ["enum Sev", "enum Level"]);
    expect(
      row.wire,
      "imports.md:37-43 + runtime-value-model.md:13,:29 — the re-export binds the same declaration as a direct import, so `Sev.Low == Level.Low` is true",
    ).toBe(true);
  });

  it("D3 CONTROL (green now and after — MUST stay false): two DIFFERENT declarations compare `==` false", async () => {
    // Two separate `enum Sev` declarations in two libs. Per
    // runtime-value-model.md:13,:29 these have distinct declaring enums, so
    // `SA.Low == SB.Low` is false — correct today and correct after the fix.
    // This pins the fix direction: identity must key on declaration identity
    // (declaring path + name), not name alone; a "compare wire strings only"
    // fix would wrongly flip this to true.
    const row = await run(
      'import { Sev as SA } from "./liba.thetalib"\nimport { Sev as SB } from "./libb.thetalib"\nlet x = SA.Low == SB.Low\nx',
      {
        "/proj/liba.thetalib": "enum Sev { Low, High }",
        "/proj/libb.thetalib": "enum Sev { Low, High }",
      },
    );
    expectCleanLoad(row, "D3 two declarations", ["enum SA", "enum SB"]);
    expect(
      row.wire,
      "runtime-value-model.md:13,:29 — two distinct declaring enums, so `SA.Low == SB.Low` is false; the fix must key on declaration identity, not name",
    ).toBe(false);
  });
});
