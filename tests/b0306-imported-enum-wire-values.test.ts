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
import { makeEnumValue, valuesEqual, type ThetaValue } from "../src/runtime/value";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { FileSystem } from "../src/seams/file-system";
import { parseDeps } from "./helpers/e2e-s1";

// The wire string a variant access evaluates to must be the value the
// declaration pins, whatever route reaches the declaration. schemas.md:97 gives
// the rule with no imported-vs-local qualifier: `Enum.Variant` "evaluates to the
// variant's underlying string value (the explicit RHS, or the variant name
// verbatim when no RHS is given)". `Sev.Low` against `enum Sev { Low = "low" }`
// has an explicit RHS, so "low" is the wire and "Low" is the no-RHS fallback
// applied where an RHS exists. imports.md:27 §Visibility exports the
// declaration itself, so an imported declaration owes the same wire as the same
// declaration in-file.
//
// The materialisation seam drops the explicit-RHS record: the enum arm of
// `materializeSymbol` (src/extension/import-static-checks.ts:240) narrows to
// `{ name, kind: "enum", variants }`, `MaterializedImport`
// (src/runtime/lexical-environment.ts:142) carries variant names only, and the
// import arm of `buildEnvironment` rebuilds the wire map with
// `buildVariantWireMap(imp.variants ?? [], undefined)`
// (src/runtime/lexical-environment.ts:449) whose `values?.[name] ?? name`
// fallback substitutes the name. Every row below asserts the fixed wire "low";
// each is red against the seam as it stands.
// TIER: unit, offline, deterministic, provider-free. The whole class settles
// inside one `parseThetaDocument` over a string, one `checkThetaImports` over an
// in-memory `FileSystem` double, and one `executeBody` bound through
// `createProductionProducerDeps` — the seam that drops the values and the seam
// that reads the map are both reachable in-process, so an integration or live
// tier would add a provider to a decision no model participates in.

/** The importing `.theta` frontmatter every fixture shares. */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

/** The declaring lib body: a wire-code enum whose variants carry explicit RHS. */
const ENUM_LIB = 'enum Sev { Low = "low", High = "high" }';

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
   * The JSON projection of the settled value — for an enum value the bare wire
   * string (runtime-value-model.md:13: `JSON.stringify` of an enum value yields
   * the bare wire string), which is the wire observable the rows assert.
   */
  readonly wire: unknown;
  /** The settled value object itself, for the wire-half equality row. */
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
// resolution regression from masquerading as the wire defect.
function expectCleanImport(row: Ran, label: string): void {
  expect(row.appParseCodes, `${label}: the importing file parses clean`).toEqual([]);
  expect(
    row.diagLines,
    `${label}: a well-formed enum import is legal at every gate; the load pass must report nothing`,
  ).toEqual([]);
  expect(
    row.materialised,
    `${label}: imports.md:27 §Visibility exports the declaration, so the enum must materialise under its local name`,
  ).toEqual(["enum Sev"]);
}

describe("bug 0306 — an imported enum carries its explicit wire values", () => {
  it("RED (row 1): an imported `Sev.Low` evaluates to the declared wire, equal to the same-file control", async () => {
    // The same-file control is an ABSOLUTE PIN, not a comparison: the same-file
    // arm of `buildEnvironment` threads `reg.values`, so this is green today and
    // proves the import row cannot pass by both spellings being equally broken.
    const control = await run(`${ENUM_LIB}\nlet x = Sev.Low\nx`, {});
    expect(
      control.materialised,
      "same-file control declares no import",
    ).toEqual([]);
    expect(
      control.wire,
      'schemas.md:97 — `Sev.Low`\'s explicit RHS is "low"; the same-file declaration is the wire the import must match',
    ).toBe("low");

    const row = await run(
      'import { Sev } from "./lib.thetalib"\nlet x = Sev.Low\nx',
      { "/proj/lib.thetalib": ENUM_LIB },
    );
    expectCleanImport(row, "row 1 imported");
    expect(
      row.wire,
      'schemas.md:97 — the imported `Sev.Low` evaluates to its explicit RHS "low", not the no-RHS fallback "Low"',
    ).toBe("low");
    expect(
      row.wire,
      "imports.md:27 — the imported declaration owes the same wire as the same declaration in-file",
    ).toBe(control.wire);
  });

  it("RED (row 2): an `as`-aliased import does not change the wire", async () => {
    // The alias renames the binding, not the wire: the explicit RHS is a
    // property of the declaration, which the alias does not touch.
    const row = await run(
      'import { Sev as S } from "./lib.thetalib"\nlet x = S.Low\nx',
      { "/proj/lib.thetalib": ENUM_LIB },
    );
    expect(row.appParseCodes, "row 2: the importing file parses clean").toEqual([]);
    expect(
      row.diagLines,
      "row 2: a well-formed aliased import is legal at every gate",
    ).toEqual([]);
    expect(
      row.materialised,
      "row 2: the enum materialises under its alias `S`",
    ).toEqual(["enum S"]);
    expect(
      row.wire,
      'schemas.md:97 — the aliased `S.Low` evaluates to its explicit RHS "low"; the alias renames the binding, not the wire',
    ).toBe("low");
  });

  it("RED (row 3): a re-export-chain import carries the same wire values", async () => {
    // 0101's `materializeChain` leaf must carry the same values record the
    // direct materialisation would: re-exporting a declaration re-exports its
    // wire values, not its name alone.
    const row = await run(
      'import { Sev } from "./mid.thetalib"\nlet x = Sev.Low\nx',
      {
        "/proj/mid.thetalib": 'export { Sev } from "./lib.thetalib"\n',
        "/proj/lib.thetalib": ENUM_LIB,
      },
    );
    expectCleanImport(row, "row 3 re-export");
    expect(
      row.wire,
      'schemas.md:97 — `Sev.Low` reached through a re-export evaluates to its explicit RHS "low"',
    ).toBe("low");
  });

  it("RED (row 4): the imported `Sev.Low` is wire-equal to an inbound-shaped `\"low\"`", async () => {
    // TAG-INDEPENDENT — this row witnesses the WIRE half of enum identity alone,
    // never the tag half (sibling candidate 04 owns the tag half). Bug 0305
    // Route A re-keyed the imported `Sev.Low` tag from the bare local name to
    // the declaring-declaration key `enumDeclaringKey(resolvedPath, "Sev")`
    // ("/proj/lib.thetalib#Sev" here); `inbound` is hand-built to carry that
    // SAME declaring key, simulating what the inbound-retag sidecar mints for
    // a value validated against this declaration. So `valuesEqual`'s
    // `tagA === tagB && String(a) === String(b)` (src/runtime/value.ts:503)
    // reduces to the wire comparison — both tags already agree, and the row
    // flips only on the wire fix. Reading the tag through `valuesEqual` rather
    // than `schemaTagOf` is deliberate: `schemaTagOf` reads the schema brand,
    // not the enum tag, and returns undefined for an enum value.
    const row = await run(
      'import { Sev } from "./lib.thetalib"\nlet x = Sev.Low\nx',
      { "/proj/lib.thetalib": ENUM_LIB },
    );
    expectCleanImport(row, "row 4 imported");
    expect(
      row.raw,
      "row 4: the run must settle on a value to compare",
    ).toBeDefined();
    const inbound = makeEnumValue("/proj/lib.thetalib#Sev", "low");
    expect(
      valuesEqual(row.raw as ThetaValue, inbound),
      'runtime-value-model.md:29 — the wire half of enum equality: an imported `Sev.Low` (declaring-key tag "/proj/lib.thetalib#Sev", bug 0305) must equal an inbound value validated to wire "low" against the same declaration (same declaring-key tag); with both tags equal the comparison is the wire comparison',
    ).toBe(true);
  });
});
