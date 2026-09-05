import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
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
import { isEnumValue, schemaTagOf, type ThetaValue } from "../src/runtime/value";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { FileSystem } from "../src/seams/file-system";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0449 — an unknown variant on an enum reached through an `export … from`
// RE-EXPORT CHAIN aborts the drive at runtime as `NullMemberAccessPanic: null
// member access: .Nope`, a panic whose subject is wrong twice: it asserts a
// null target where the enum is bound and materialised (the C3 control proves
// the chain delivers), and it never names the variant that is the actual fault.
//
// The class is the deferred half of bug 0430. 0430 (fixed 0.423.0) moved the
// DIRECT-import unknown-variant reference to a LOAD-pass refusal
// (`checkImportedEnumVariantAccess`, src/extension/invoke-static-checks.ts,
// keyed on the DIRECTLY-resolved library's own `EnumDecl.variants`), but the
// registry row states the re-export withhold verbatim
// (docs/spec_topics/diagnostics/code-registry-parse.md:114: "a specifier
// reached only through a re-export chain draws no variant verdict, a stated
// withhold"). So the chain-reached reference registers and reaches the runtime,
// where the async executor's enum short-circuit
// (src/runtime/statement-executor.ts:1106–1120) reads
// `env.resolveEnumVariant(...)`'s `undefined` (:1111) as "not an enum access",
// falls through to evaluate the enum NAME as a value (:1120), gets `null` from
// the pure host's non-`local` ident safety net, and
// `evaluateMemberAccess(null, field)` panics
// (src/runtime/runtime-panics.ts:359). `resolveEnumVariant`
// (src/runtime/lexical-environment.ts:780) collapses "unregistered enum" and
// "unknown variant on a registered enum" into one `undefined`, which is the
// information loss the fall-through mistakes.
//
// SETTLED §Fix — Option 1 (runtime belt, now primary): narrow the async
// executor's enum short-circuit so a non-`local` ident naming a REGISTERED enum
// whose variant MISSES fails LOUDLY naming the enum and variant (per 0185's
// adjudication the natural carrier is the `unknown-variant` code/message TEXT on
// the runtime failure channel, no new code), instead of falling through to the
// value read. The split of `resolveEnumVariant`'s collapsed `undefined` must
// leave 0185's params witnesses (tests/params-default-*.test.ts) UNMOVED — best
// done ADDITIVELY (a new `isRegisteredEnum(name)` method, `resolveEnumVariant`
// unchanged). Whether to carry a `theta/parse/*` code on the RUNTIME failure
// channel (DIAG-2) is the fixer's to adjudicate; this witness is therefore
// CARRIER-AGNOSTIC on the framing — it pins the owed message TEXT (the enum and
// the variant, and the ABSENCE of the lying "null member access") rather than a
// specific code or note prefix.
//
// THE INVARIANT THIS FILE ENCODES: a laundered (chain-reached) unknown variant
// on a registered enum must fail with a message that names the enum and the
// variant, never the fabricated-null panic. C1/C2 owe that shape (RED today,
// where the message is the null panic); C3 fences that a VALID variant through
// the same chain still delivers (the class is EXACTLY the unknown variant, and
// the belt does not over-refuse); C4 fences that the DIRECT class is already
// handled statically (0430's LOAD refusal), so the belt is for the chain class
// only.
//
// TIER — unit, offline, deterministic, provider-free. Every cell settles inside
// one `parseThetaDocument` over a string, one shipped `checkThetaImports` over
// an in-memory `FileSystem` double (only `readdir` / `readBytes` exercised,
// every other member rejecting so an unexpected call reds), and one shipped
// `executeBody` bound through `createProductionProducerDeps(...)
// .bindPromptConversation` — the `measure()` harness shape
// tests/reexport-chain-resolution.test.ts establishes. The runtime terminal is
// the whole subject, so it must run the real executor; an integration tier
// would add a discovery round trip to a decision the load pass has already made
// and could not reach the runtime panic more sharply, and a live tier would add
// a provider to a decision no model participates in — no model reads a variant
// name against an enum's registered set. `resolvePiTool` would resolve ANY name
// and the callable set is a frozen empty snapshot, so an ambient host-tool
// execution would surface as the sentinel `"AMBIENT"` rather than be mistaken
// for success.
//
// NO SILENT SKIPPING (CLAUDE.md): nothing here early-returns or branches on the
// environment. A missing registry row (the DIAG-4 oracle for the owed message),
// a frontmatter that did not parse, and a chain that did not materialise the
// enum each FAIL LOUDLY naming the unmet precondition, so no assertion is
// measured vacuously.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4). The
// unknown-variant message is READ from the closed registry rather than
// hand-copied, so a reworded template reds by naming the registry, not by a
// bare string mismatch. `theta/parse/unknown-variant`'s template is
// `unknown variant '<variant>' on enum '<enum>'`
// (docs/spec_topics/diagnostics/code-registry-parse.md:114).
// ===========================================================================

/**
 * The code whose *Message* TEXT the fix reuses on the runtime failure channel
 * (0185's no-new-code adjudication). It is the same reference the same-file and
 * direct-import spellings already draw at parse / load.
 */
const UNKNOWN_VARIANT_CODE = "theta/parse/unknown-variant";

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

/**
 * A registry row's normative *Message* template (DIAG-4), read rather than
 * restated. FAILS LOUDLY naming the sharded page when the row is absent, so
 * registry drift can never degrade an assertion into a comparison against
 * `undefined`.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `PRECONDITION (DIAG-4): docs/spec_topics/diagnostics/code-registry-parse.md must carry a Message cell for ${code} — it is this file's oracle for the owed runtime message, so an absent cell is an unmet precondition, not a skip`,
  ).toBeDefined();
  return template as string;
}

/**
 * The unknown-variant message for one variant of one enum. Both replacements
 * are functions so a `$` in either name can never read as a `String.replace`
 * substitution pattern.
 */
function unknownVariantMessage(variant: string, enumName: string): string {
  return registryMessageOf(UNKNOWN_VARIANT_CODE)
    .replace("<variant>", () => variant)
    .replace("<enum>", () => enumName);
}

// ===========================================================================
// Parse driver, the in-memory `.thetalib` filesystem double, and the runtime
// measurement — the `measure()` harness of
// tests/reexport-chain-resolution.test.ts, copied to the helpers this file
// needs. It parses `/proj/app.theta`, runs the real `checkThetaImports` over an
// in-memory `FileSystem`, then runs the real `executeBody` through the
// production producer deps, capturing the run as
// `{ outcome, value, schemaTag?, enumBranded? }`; a throw is captured as a
// VALUE (`<ErrorName>: <message>`) so the runtime terminal is comparable and
// the red prints it.
// ===========================================================================

/** The importing `.theta` frontmatter every fixture shares (model sonnet, mode prompt). */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

function parseApp(body: string): ThetaDocument {
  return parseThetaDocument(
    { path: "/proj/app.theta", bytes: new TextEncoder().encode(`${APP_FRONTMATTER}\n${body}`) },
    parseDeps(),
  );
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
      const content = Object.prototype.hasOwnProperty.call(files, path) ? files[path] : undefined;
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

/** The observable of one runtime row: the settled final value with its brands, or `<name>: <message>`. */
interface RuntimeOutcome {
  readonly outcome: "value" | "throw";
  readonly value: unknown;
  readonly schemaTag?: string;
  readonly enumBranded?: true;
}

/** One measured row: the importing theta's parse, the load pass, and the run. */
interface Measured {
  readonly appParseCodes: string[];
  readonly diagLines: string[];
  readonly materialised: string[];
  readonly runtime: RuntimeOutcome;
}

async function measure(appBody: string, libs: Record<string, string>): Promise<Measured> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `PRECONDITION: the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
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
  // The `.then(ok, err)` rejection arm — not a broad `catch` — is the pipeline's
  // sanctioned boundary pattern and is what turns a runtime panic into a
  // comparable value.
  const runtime = await executeBody(app.body, binding.executeDeps).then(
    (execution): RuntimeOutcome => {
      const value = execution.result.value;
      const tag = value === undefined ? undefined : schemaTagOf(value as ThetaValue);
      const enumBranded = value !== undefined && isEnumValue(value as ThetaValue);
      return {
        outcome: "value",
        value: value === undefined ? null : (JSON.parse(JSON.stringify(value)) as unknown),
        ...(tag !== undefined ? { schemaTag: tag } : {}),
        ...(enumBranded ? { enumBranded: true as const } : {}),
      };
    },
    (err: unknown): RuntimeOutcome => ({
      outcome: "throw",
      value: `${(err as Error).name}: ${(err as Error).message}`,
    }),
  );

  return {
    appParseCodes: app.diagnostics.map((d) => d.code),
    diagLines: check.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    materialised: check.imports.map((m) => `${m.kind} ${m.name}`),
    runtime,
  };
}

// ===========================================================================
// Fixtures. `lib` DECLARES the enum; `mid` re-exports it and declares nothing.
// The declaration is single-line, mirroring the direct-class siblings
// (tests/b0430-*.test.ts, tests/b0448-*.test.ts).
// ===========================================================================

const ENUM_DECL = "enum Sev { Low }\n";
const ENUM_DECL_WIRE = 'enum Sev { Low = "low" }\n';
const MID_PLAIN = 'export { Sev } from "./lib.thetalib"\n';
const MID_RENAMED = 'export { Sev as Level } from "./lib.thetalib"\n';

// ===========================================================================
// C1 — plain chain. RED today: the chain withholds statically (0430 fence), the
// enum materialises, and the unknown variant aborts at runtime as the null
// panic. The assertions encode the OWED POST-FIX shape, so they red today
// against exactly that panic and green once the belt names the enum and variant.
// ===========================================================================

describe("bug 0449 (C1) — a plain re-export chain unknown variant fails naming the enum and variant", () => {
  it("C1-plain-chain: `Sev.Nope` through `export { Sev } from` fails loudly, not with a fabricated null panic", async () => {
    const row = await measure('import { Sev } from "./mid.thetalib"\nlet x = Sev.Nope\nx\n', {
      "/proj/mid.thetalib": MID_PLAIN,
      "/proj/lib.thetalib": ENUM_DECL,
    });
    // The static tier is 0430's stated withhold: parse and load both silent.
    expect(
      row.appParseCodes,
      `C1 — the FS-free parser cannot see the lib's variant set, so the app parses clean. ACTUAL: ${JSON.stringify(row.appParseCodes)}`,
    ).toEqual([]);
    expect(
      row.diagLines,
      `C1 — the re-export chain draws no variant verdict at load (code-registry-parse.md:114's stated withhold), so the reference reaches the runtime. ACTUAL: ${JSON.stringify(row.diagLines)}`,
    ).toEqual([]);
    // Anti-vacuity: the chain must DELIVER the enum, or the runtime terminal
    // below measures an unresolved import rather than an unknown variant on a
    // bound enum.
    expect(
      row.materialised,
      `C1 — the chain must materialise the enum (bug 0101's chain resolution, fixed 0.141.0), so the runtime fault is a variant on a BOUND enum, not a missing binding. ACTUAL: ${JSON.stringify(row.materialised)}`,
    ).toEqual(["enum Sev"]);

    // PRE-FIX PIN (the RED witness, documented): at HEAD `row.runtime` is EXACTLY
    //   { outcome: "throw", value: "NullMemberAccessPanic: null member access: .Nope" }
    // — a panic that names a null (there is none: C3 proves the enum is bound)
    // and never names the variant `Nope`. The assertions below encode the OWED
    // POST-FIX shape, so they red today against that value (it CONTAINS "null
    // member access" and OMITS "Sev") and green once the belt reuses the
    // unknown-variant message text on the runtime failure channel.
    expect(row.runtime.outcome, `C1 — the unknown variant must still FAIL loudly (drive aborts), never flow onward`).toBe(
      "throw",
    );
    const message = String(row.runtime.value);
    expect(
      message,
      `C1 — the lying "null member access" panic misstates the mechanism (the enum is bound, not null); the belt must not reach it. ACTUAL: ${JSON.stringify(message)}`,
    ).not.toContain("null member access");
    expect(
      message,
      `C1 — the failure must NAME the enum whose variant is wrong. ACTUAL: ${JSON.stringify(message)}`,
    ).toContain("Sev");
    expect(
      message,
      `C1 — the failure must NAME the variant that is the actual fault. ACTUAL: ${JSON.stringify(message)}`,
    ).toContain("Nope");
    expect(
      message,
      `C1 — 0185's no-new-code adjudication: the carrier is the unknown-variant message TEXT (${JSON.stringify(
        unknownVariantMessage("Nope", "Sev"),
      )}) on the runtime failure channel. ACTUAL: ${JSON.stringify(message)}`,
    ).toContain(unknownVariantMessage("Nope", "Sev"));
  });
});

// ===========================================================================
// C2 — renamed chain. RED today, same terminal. The message must render the
// ACCESS-SITE enum spelling `Level` (0430's `<enum>` renders the member-target
// local spelling, the `as`-alias where one is written), never the library's own
// declared name `Sev` — that text appears nowhere on the offending line.
// ===========================================================================

describe("bug 0449 (C2) — a renamed re-export chain renders the access-site spelling", () => {
  it("C2-renamed-chain: `Level.Nope` through `export { Sev as Level } from` names `Level`, not `Sev`", async () => {
    const row = await measure('import { Level } from "./mid.thetalib"\nlet x = Level.Nope\nx\n', {
      "/proj/mid.thetalib": MID_RENAMED,
      "/proj/lib.thetalib": ENUM_DECL,
    });
    expect(row.appParseCodes, `C2 — the app parses clean. ACTUAL: ${JSON.stringify(row.appParseCodes)}`).toEqual([]);
    expect(
      row.diagLines,
      `C2 — the renamed chain also withholds statically. ACTUAL: ${JSON.stringify(row.diagLines)}`,
    ).toEqual([]);
    // The binding materialises under the LOCAL (alias) name — proof the chain
    // delivered and the access site denotes the imported enum.
    expect(
      row.materialised,
      `C2 — the chain materialises the enum under the alias, so the fault is a variant on a BOUND enum. ACTUAL: ${JSON.stringify(row.materialised)}`,
    ).toEqual(["enum Level"]);

    // PRE-FIX PIN (the RED witness, documented): at HEAD `row.runtime` is EXACTLY
    //   { outcome: "throw", value: "NullMemberAccessPanic: null member access: .Nope" }
    // The assertions below encode the owed post-fix shape and red today against
    // it (it CONTAINS "null member access" and OMITS "Level").
    expect(row.runtime.outcome, `C2 — the unknown variant must still FAIL loudly`).toBe("throw");
    const message = String(row.runtime.value);
    expect(
      message,
      `C2 — the belt must not reach the fabricated-null panic. ACTUAL: ${JSON.stringify(message)}`,
    ).not.toContain("null member access");
    expect(
      message,
      `C2 — the message renders the MEMBER-TARGET local spelling, the alias `+`Level, never the library's declared name `+`Sev (which appears nowhere on the offending line). ACTUAL: ${JSON.stringify(message)}`,
    ).not.toContain("Sev");
    expect(
      message,
      `C2 — the carrier is the unknown-variant message TEXT rendered with the access-site spelling (${JSON.stringify(
        unknownVariantMessage("Nope", "Level"),
      )}). ACTUAL: ${JSON.stringify(message)}`,
    ).toContain(unknownVariantMessage("Nope", "Level"));
  });
});

// ===========================================================================
// C3 — control: a VALID variant through the same chain. GREEN before AND after.
// The class is EXACTLY the unknown variant: a declared variant through the same
// `mid` still evaluates to its wire value, branded as an enum (0305/0306 chain
// semantics). A fix that over-refused this would red here.
// ===========================================================================

describe("bug 0449 (C3) — a valid variant through the chain still delivers (over-refusal guard)", () => {
  it("C3-valid-variant: `Sev.Low` through the chain evaluates to its wire value, enum-branded", async () => {
    const row = await measure('import { Sev } from "./mid.thetalib"\nlet x = Sev.Low\nx\n', {
      "/proj/mid.thetalib": MID_PLAIN,
      "/proj/lib.thetalib": ENUM_DECL_WIRE,
    });
    expect(
      row.materialised,
      `C3 — the chain materialises the enum. ACTUAL: ${JSON.stringify(row.materialised)}`,
    ).toEqual(["enum Sev"]);
    // The chain materialisation is sound; the belt must leave a DECLARED variant
    // untouched, so the defect is exactly the UNKNOWN variant.
    expect(
      row.runtime,
      `C3 — a declared variant through the chain evaluates to its wire value ("low"), branded as an enum (0305/0306). ACTUAL: ${JSON.stringify(row.runtime)}`,
    ).toEqual({ outcome: "value", value: "low", enumBranded: true });
  });
});

// ===========================================================================
// C4 — control: the DIRECT-import spelling of the same typo. GREEN before AND
// after. 0430's fix draws `theta/parse/unknown-variant` at the LOAD pass for a
// directly-imported enum, so the theta does not register — the direct class is
// already handled statically and the runtime belt is for the chain/laundered
// class only. (This cell is about the static tier; it asserts the load
// diagnostic, not the runtime.)
// ===========================================================================

describe("bug 0449 (C4) — the direct-import spelling is already refused statically", () => {
  it("C4-direct-import: `Sev.Nope` on a directly-imported enum draws unknown-variant at the load pass", async () => {
    const row = await measure('import { Sev } from "./lib.thetalib"\nlet x = Sev.Nope\nx\n', {
      "/proj/lib.thetalib": ENUM_DECL,
    });
    // Parse defers on the imported name (FS-free parser holds no variant set);
    // the verdict is the LOAD pass's to draw.
    expect(
      row.appParseCodes,
      `C4 — parse stays silent on the imported reference. ACTUAL: ${JSON.stringify(row.appParseCodes)}`,
    ).toEqual([]);
    expect(
      row.materialised,
      `C4 — the direct import materialises the enum with its variant set, so the load-pass member walk is reachable. ACTUAL: ${JSON.stringify(row.materialised)}`,
    ).toEqual(["enum Sev"]);
    // 0430's LOAD refusal: the DIRECT class is drawn statically, so the theta
    // does not register and the runtime belt never has to reach it — the belt is
    // for the chain class C1/C2 alone.
    expect(
      row.diagLines,
      `C4 — the direct import draws 0430's `+`theta/parse/unknown-variant at the LOAD pass, byte-identical to the same-file message. ACTUAL: ${JSON.stringify(row.diagLines)}`,
    ).toEqual([`error ${UNKNOWN_VARIANT_CODE}: ${unknownVariantMessage("Nope", "Sev")}`]);
  });
});
