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

// Bug 0101 — `export { greet } from "./base.thetalib"` is the only export
// spelling the language admits (bug 0058 refused the from-less form in 0.60.0,
// and bug 0100's 0.134.0 fix refused the production-excluded specifier-list
// spellings around it). Its whole published effect is to make another
// `.thetalib`'s symbol visible downstream. AT THE PRE-FIX BASELINE (af221903 /
// 0.134.0) it made the NAME visible and nothing else: `computeThetaLibExports`
// (src/parser/imports.ts) unions the re-exporting lib's declaration names with
// each re-export's `exported` name unconditionally, so the importing specifier
// passes `theta/parse/import-unknown-symbol`; `materializeSymbol`
// (src/extension/import-static-checks.ts) then searched the RE-EXPORTING lib's
// own top-level `fn` / `schema` / `enum` statements only and fell through to its
// `return undefined`, so `checkThetaImports` returned an empty `imports` list.
// And because `collectImports` collects `kind === "import"` only, the
// re-export's own `fromPath` (recorded by `extractThetaLibForms`, and at that
// baseline read by no `src/` consumer) was never resolved: not IMP-1-checked,
// not parsed for its own export set, not added to the cycle graph `walkThetaLib`
// builds. Citations into that module are by FUNCTION NAME throughout this file,
// because the fix moves its lines.
//
// (`fromPath` IS read post-fix — the re-export closure and `materializeChain`
// are its consumers — so the unread-field observation above is pre-fix state,
// not a standing property.)
//
// ROUTE: **A — resolve the re-export chain** (bug doc §Fix, adjudicated in-run;
// route B, withdrawing the `ExportDecl` production, is rejected — every bullet
// of §Expected describes route A's outcome and route B would withdraw the only
// export spelling the language admits).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/imports.md §"Unknown imported symbol" — the admitted set
//     is "a top-level declaration [or] a transitive re-export (`export … from`)
//     of the resolved `.thetalib` file". The word *transitive* states that the
//     export set is computed THROUGH the chain, which requires the chain to be
//     walked. The check passing and the binding existing are the two halves of
//     one contract.
//   - docs/reference/grammar.md §"Imports and re-exports" — `export`
//     "re-exports a symbol from another `.thetalib` file and creates no local
//     binding of its own; the downstream-visible name is the alias". A form
//     whose stated effect is to make another file's symbol visible downstream
//     is expected to deliver that file's symbol.
//   - imports.md IMP-1 — the resolver-failure contract, stated for a
//     `.thetalib` spec. A path literal in an `export … from` statement is a
//     `.thetalib` path in a `.thetalib` file and is subject to it.
//   - imports.md §Cycles — `theta/load/import-cycle` for cycles "between
//     `.thetalib` files".
//   - imports.md §Re-exports / grammar.md — "creates no local binding" governs
//     the RE-EXPORTING lib's own scope (`thetalibLocalBindings`,
//     src/parser/imports.ts:846; `collectIdentRoots`' import-only arm,
//     src/parser/theta-document.ts:4856–4864; `fnImportDecls`' import-only arm,
//     :5725–5733). Neither sentence says the IMPORTING file gets no binding, so
//     nothing here turns a re-exported name into a local binding of the
//     re-exporting lib.
//
// THE INVARIANT THIS FILE ENCODES: **a re-export delivers exactly what the
// direct import of the same declaration delivers.** Every row measures its
// DIRECT-IMPORT CONTROL in the same test and asserts equality, rather than
// hard-coding an outcome. That keeps the oracle on the spec sentence (the
// re-export makes another file's symbol visible) instead of on a guessed
// post-fix string, and it is reachable in both directions: green once the chain
// resolves, red while it does not.
//
// THE SHIPPED MECHANISM THESE CELLS RANGE OVER (design settled; the whole
// implementation is inside src/extension/import-static-checks.ts):
//   - `computeThetaLibExports` and `thetalibLocalBindings` are UNCHANGED, so the
//     syntactic export set keeps its two admitted sources and its one exclusion
//     and tests/export-visibility.test.ts stays green.
//   - Three ordered phases compute each `.thetalib`'s RESOLVED (transitive)
//     export set: collect the `export … from` closure of the resolved entry
//     libs, settle the LEAST FIXPOINT over that whole file set (each set seeded
//     with the lib's declarations, a re-export's `exported` name added whenever
//     its source lib's current set carries its `source`), and diagnose only
//     afterwards. A fixpoint over the file set, rather than a walk down one
//     chain, is what makes the answer independent of the entry lib as well as of
//     the import-statement order.
//   - Per re-export, EXACTLY ONE of two diagnostics, never both, sited on the
//     RE-EXPORTING lib: `theta/load/unresolvable-thetalib-path` when the
//     `.thetalib` `fromPath` does not resolve, or
//     `theta/parse/import-unknown-symbol` when it resolves and does not provide
//     the source name. A `fromPath` not ending in `.thetalib` is SKIPPED
//     (mirroring the import loop's extension skip at
//     the extension skip in `checkThetaImports`' import loop) — the parse-time
//     `theta/parse/import-non-thetalib-extension` is already the answer there,
//     and a from-less export's `fromPath: ""` is skipped by the same rule.
//   - Materialisation follows the chain, bounded by a visited-path set, binding
//     under the IMPORTING specifier's local name.
//   - The cycle graph's edge set widens to include `export … from` edges, so
//     `theta/load/import-cycle` is the code that fires on a re-export cycle; the
//     settled fixpoint of a pure re-export cycle provides nothing, so each
//     re-export in it ALSO draws `theta/parse/import-unknown-symbol`.
//   - Diagnostics land in the importing theta's `checkThetaImports(...)
//     .diagnostics` while `file:` names the re-exporting lib — the same
//     effective channel as the existing IMP-4 registration-error arm
//     (`isRegistrationError`, applied to each resolved lib's parse
//     diagnostics in `checkThetaImports`).
//
// TIER: **unit**, offline, deterministic, provider-free. Every claim settles
// inside one `parseThetaDocument` over a string, one `checkThetaImports` over an
// in-memory `FileSystem` double, or one `executeBody` bound through
// `createProductionProducerDeps(...).bindPromptConversation` — the harness shape
// tests/callable-set-runtime-enforcement.test.ts:137–149 uses. An integration
// tier would add a discovery round trip to a decision the load pass has already
// made and could not assert a binding's ABSENCE more sharply; a live tier would
// add a provider to a decision no model participates in — the runtime rows here
// carry a frozen EMPTY callable set and a `resolvePiTool` double that would
// resolve any name, so an ambient execution would be visible rather than
// mistaken for success.
//
// NO SILENT SKIPPING: the registry reads in group (a) FAIL LOUDLY naming the
// absent row and page rather than returning a placeholder, and each control's
// measurement is asserted against an absolute pin BEFORE the row is compared to
// it, so a broken control reds as a broken control rather than passing an
// equality vacuously. One cell pins its control's `materialised` only and not
// its runtime, because it is a FENCE rather than a witness: (e3), where the
// pure evaluator reads `null` for a materialised `fn` exactly as it does for an
// unresolved name. Cell (i) WAS such a fence (a lib-internal `import` was never
// materialised into the caller's environment, so its control failed
// identically); bug 0303 fixes the lib-body scope, so (i) is flipped to a
// witness with an absolute control pin (its own cell says so).
//
// RE-DERIVED AT HEAD af221903 / 0.134.0: every §Reproduction row of the bug doc
// reproduces unchanged. Bug 0100's refusals discharge NOTHING here — every
// fixture in this file is a fully specified, from-bearing `export { Name } from
// "./x.thetalib"` (or its `as`-aliased form), which 0100's fix pins explicitly
// admitted.

// ===========================================================================
// The registered codes and their normative messages (DIAG-2 / DIAG-4).
// ===========================================================================

/** The admission half of the contract; route A puts its `export … from` arm into service. */
const UNKNOWN_SYMBOL_CODE = "theta/parse/import-unknown-symbol";

/** IMP-1, which route A brings onto the export path. */
const UNRESOLVABLE_CODE = "theta/load/unresolvable-thetalib-path";

/** imports.md §Cycles, whose edge set route A widens (§Fix constraint 5). */
const CYCLE_CODE = "theta/load/import-cycle";

/** The one check that already reaches an export path, asserted UNCHANGED in group (g). */
const EXTENSION_CODE = "theta/parse/import-non-thetalib-extension";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/code-registry.test.ts reconciles.
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
 * A registered code's row.
 *
 * An absent row is an unmet precondition, so this FAILS LOUDLY naming the code
 * and the sharded page rather than returning `undefined` for a later comparison
 * to red on obscurely.
 */
function registryRow(code: string): RegistryRow {
  const row = REGISTRY.find((r) => r.code === code);
  expect(
    row,
    `no registry row for ${code} — DIAG-2 anchor: the Imports cluster of ` +
      `docs/spec_topics/diagnostics/code-registry-parse.md or ` +
      `code-registry-load.md must carry it, mirrored into ` +
      `docs/reference/diagnostics.md in the same commit`,
  ).toBeDefined();
  return row as RegistryRow;
}

/**
 * A registered code's normative *Message* template (DIAG-4), read from the
 * registry so no expected string in this file is written twice.
 */
function normativeMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `no Message cell for ${code} — DIAG-4 makes the Message column normative ` +
      `character-for-character, so an absent cell is an unmet precondition, not a skip`,
  ).toBeDefined();
  return template as string;
}

/** The unknown-symbol message rendered for one source name and one spec path. */
function unknownSymbolMessage(name: string, path: string): string {
  return normativeMessage(UNKNOWN_SYMBOL_CODE)
    .replace("<name>", name)
    .replace("<path>", path);
}

/** The IMP-1 message rendered for one spec path. */
function unresolvableMessage(path: string): string {
  return normativeMessage(UNRESOLVABLE_CODE).replace("<path>", path);
}

// ===========================================================================
// Parse drivers, the in-memory `.thetalib` filesystem double, and the load pass.
// The double's shape (only `readdir` / `readBytes` exercised, every other member
// rejecting so an unexpected call reds) is the one
// tests/subagent-fn.test.ts:1581–1616 and
// tests/import-export-from-clause-required.test.ts:246–281 use.
// ===========================================================================

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

/**
 * The observable of one runtime row: the settled final value with its schema
 * brand, or the thrown error's `name: message`.
 *
 * A throw is captured as a VALUE rather than allowed to escape so a row and its
 * direct-import control are comparable with one `toEqual`, and so the red prints
 * both sides.
 *
 * `value` is the JSON projection of the settled value, not the value object: an
 * enum runtime value is a BOXED string carrying a non-enumerable `ENUM_TAG`
 * (src/runtime/value.ts:135–144), which `toEqual` renders character-by-character
 * and never equates with a primitive. The two brands the bug doc measures are
 * read off separately, through the exported readers, so the projection stays
 * structural and the brand comparison stays explicit.
 */
interface RuntimeOutcome {
  readonly outcome: "value" | "throw";
  readonly value: unknown;
  readonly schemaTag?: string;
  readonly enumBranded?: true;
}

/** One measured row: the importing theta's parse, the load pass, and the run. */
interface Measured {
  readonly appParseCodes: string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly diagLines: string[];
  readonly materialised: string[];
  readonly runtime: RuntimeOutcome;
}

/**
 * Parse `/proj/app.theta`, run the real `checkThetaImports` over `libs`, then
 * run the real `executeBody` with whatever the load pass materialised.
 *
 * `resolvePiTool` would resolve ANY name and the callable set is a frozen empty
 * snapshot, so an ambient host-tool execution would surface as the sentinel
 * `"AMBIENT"` rather than be mistaken for a resolved import (the bug doc
 * §Reproduction measured that no row consults it).
 */
async function measure(appBody: string, libs: Record<string, string>): Promise<Measured> {
  const app = parseApp(appBody);
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
    diagnostics: check.diagnostics,
    diagLines: check.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    materialised: check.imports.map((m) => `${m.kind} ${m.name}`),
    runtime,
  };
}

/** The diagnostics carrying `code`, in emission order. */
function withCode(diagnostics: readonly Diagnostic[], code: string): Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

/**
 * Assert one measured row DELIVERS WHAT ITS DIRECT-IMPORT CONTROL DELIVERS.
 *
 * The control's own absolute pin is asserted first (by the caller), so this
 * comparison cannot pass because both sides are equally broken. `materialised`
 * is compared before `runtime` because the missing binding is the cause and the
 * runtime divergence is the symptom — the red should name the cause first.
 */
function expectDeliversLikeControl(label: string, row: Measured, control: Measured): void {
  expect(
    row.diagLines,
    `${label}: a well-formed re-export chain is legal input at every gate — the source lib declares the symbol and every path resolves — so the load pass must report nothing`,
  ).toEqual([]);
  expect(
    row.materialised,
    `${label}: imports.md §"Unknown imported symbol" admits a specifier naming "a transitive re-export (\`export … from\`) of the resolved \`.thetalib\` file", so the name the admission test admits is a name the environment binds. The direct import of the same declaration materialises ${JSON.stringify(
      control.materialised,
    )}; the re-export must materialise the same binding under the importing specifier's local name`,
  ).toEqual(control.materialised);
  expect(
    row.runtime,
    `${label}: grammar.md §"Imports and re-exports" states the form's effect as re-exporting "a symbol from another \`.thetalib\` file", so the value delivered through the re-export is the value the declaration delivers. Direct-import control: ${JSON.stringify(
      control.runtime,
    )}`,
  ).toEqual(control.runtime);
}

// ===========================================================================
// Fixtures. Declaration bodies are multi-line, one member per line
// (docs/STYLE.md).
// ===========================================================================

/** The declaring lib. `ping` is zero-arg so the zero-arg use position has a real control. */
const BASE = [
  "fn greet(x: string) {",
  "  x",
  "}",
  "fn ping() {",
  '  "pong"',
  "}",
  "schema Author {",
  "  name: string",
  "}",
  "enum Color {",
  "  Red",
  "  Blue",
  "}",
  "",
].join("\n");

/** `mid` re-exports one name from `base` and declares nothing of its own. */
function midReExporting(specifier: string, from = "./base.thetalib"): string {
  return `export { ${specifier} } from "${from}"\n`;
}

const CHAIN_LIBS: Record<string, string> = {
  "/proj/base.thetalib": BASE,
  "/proj/mid.thetalib": midReExporting("greet"),
};

const DIRECT_LIBS: Record<string, string> = { "/proj/base.thetalib": BASE };

// ===========================================================================
// (a) THE DIAG-2 / DIAG-4 REGISTRY ANCHOR.
// (a1) is GREEN — all three codes are already registered, and route A puts two
// of them into service on a statement kind they already name. (a2) is RED: the
// cycle row's Trigger names the `import` graph only, which is the spec half of
// §Fix constraint 5.
// ===========================================================================

describe("bug 0101 (a) — the registry rows route A puts into service", () => {
  it("GREEN (a1): the three codes are registered with the severities, phases and messages this file uses", () => {
    const unknown = registryRow(UNKNOWN_SYMBOL_CODE);
    expect(
      unknown.severity,
      `${UNKNOWN_SYMBOL_CODE}: severity E — a wrong re-export specifier un-registers the lib's importer through the registration-error arm (\`isRegistrationError\` in src/extension/import-static-checks.ts)`,
    ).toBe("E");
    expect(
      unknown.phase,
      `${UNKNOWN_SYMBOL_CODE}: phase parse — the code is parse-phase even though the load pass is where a resolved lib's export set becomes knowable`,
    ).toBe("parse");
    expect(
      unknown.trigger,
      `${UNKNOWN_SYMBOL_CODE}: the Trigger must already name the \`export { ... } from\` specifier and the transitive re-export set — that sentence is what route A implements rather than adds`,
    ).toContain("export { ... } from");
    expect(
      unknown.trigger,
      `${UNKNOWN_SYMBOL_CODE}: the word "transitive" is what makes the export set a CHAIN computation, and a chain computation requires the chain to be walked`,
    ).toContain("transitive");
    expect(
      unknown.message,
      "DIAG-4 — the Message column is normative character-for-character, and this file renders it rather than restating it",
    ).toBe("imported symbol '<name>' is not declared or re-exported by '<path>'");

    const unresolvable = registryRow(UNRESOLVABLE_CODE);
    expect(
      unresolvable.severity,
      `${UNRESOLVABLE_CODE}: severity E — IMP-1 states the importing file is not registered`,
    ).toBe("E");
    expect(
      unresolvable.phase,
      `${UNRESOLVABLE_CODE}: phase load — resolution is a load-pass act`,
    ).toBe("load");
    expect(
      unresolvable.trigger,
      `${UNRESOLVABLE_CODE}: the Trigger already names an \`export … from\` \`.thetalib\` spec, so route A brings the implementation to a contract the registry already publishes`,
    ).toContain("export … from");
    expect(
      unresolvable.message,
      "DIAG-4 — rendered by `unresolvableMessage` in group (g)",
    ).toBe("cannot resolve .thetalib import '<path>'");

    const cycle = registryRow(CYCLE_CODE);
    expect(cycle.severity, `${CYCLE_CODE}: severity E — the cycle un-registers the importer`).toBe(
      "E",
    );
    expect(cycle.phase, `${CYCLE_CODE}: phase load — the graph walk is a load-pass act`).toBe(
      "load",
    );
  });

  it(`RED (a2): ${CYCLE_CODE}'s Trigger names the \`export … from\` edge (§Fix constraint 5)`, () => {
    // §Fix constraint 5: a chain walk must bound itself and state which code
    // fires. The adjudicated answer is `theta/load/import-cycle` with a WIDENED
    // edge set rather than a new code with its own row and DIAG-2 mirror. The
    // Trigger is therefore part of the fix: today it reads "Static walk of
    // `.thetalib` `import` graph discovers a cycle", which excludes the
    // re-export edge the widened walk traverses. `export` alone would match the
    // word inside a prose mention, so the assertion is on the two-token edge
    // spelling the spec pages use for this statement kind.
    const trigger = registryRow(CYCLE_CODE).trigger;
    expect(
      trigger,
      `${CYCLE_CODE}: route A widens the cycle graph's edge set to include \`export … from\` edges (§Fix constraint 5), so this row's Trigger must name that edge rather than the \`import\` graph alone. Observed Trigger: ${JSON.stringify(
        trigger,
      )}`,
    ).toMatch(/export\s*(?:…|\.\.\.)\s*from/);
  });
});

// ===========================================================================
// (b) THE CHAIN AND ITS DIRECT-IMPORT CONTROL — `materialised` AND the runtime
// value (§Fix constraint 8's first named requirement).
// ===========================================================================

describe("bug 0101 (b) — the chain delivers what the direct import delivers", () => {
  const APP_CALL = 'let r = greet("x")\nr\n';

  it("GREEN (b-control): importing `greet` straight from the declaring lib materialises it and returns its value", async () => {
    // The absolute pin the equality cells rest on. Without it an equality
    // assertion could pass because both sides are equally broken.
    const control = await measure(
      `import { greet } from "./base.thetalib"\n${APP_CALL}`,
      DIRECT_LIBS,
    );
    expect(control.diagLines, "a resolvable direct import is the passing control").toEqual([]);
    expect(
      control.materialised,
      "imports.md §Visibility — a top-level `fn` is auto-exported and materialises into the importing theta's environment",
    ).toEqual(["fn greet"]);
    expect(
      control.runtime,
      "the materialised `fn` runs in-process through `resolveUserFn` and returns its body's value",
    ).toEqual({ outcome: "value", value: "x" });
  });

  it("RED (b-chain): importing `greet` through `export { greet } from` delivers the same binding and the same value", async () => {
    const control = await measure(
      `import { greet } from "./base.thetalib"\n${APP_CALL}`,
      DIRECT_LIBS,
    );
    expect(
      control.materialised,
      "control precondition: the direct import must materialise, or the equality below is vacuous",
    ).toEqual(["fn greet"]);
    const row = await measure(`import { greet } from "./mid.thetalib"\n${APP_CALL}`, CHAIN_LIBS);
    expect(
      row.appParseCodes,
      "the importing file parses clean either way — the import specifier seeds `collectIdentRoots` and `fnImportDecls`, so the divergence is entirely in the load pass",
    ).toEqual([]);
    expectDeliversLikeControl("b-chain", row, control);
  });
});

// ===========================================================================
// (c) THE ALIAS ROW — `export { greet as hello } from`.
// grammar.md §"Imports and re-exports": "the downstream-visible name is the
// alias". Its control is the same declaration imported directly under the same
// alias, so the equality isolates the re-export edge from the aliasing.
// ===========================================================================

describe("bug 0101 (c) — an aliased re-export delivers under its alias", () => {
  it("RED (c-alias): `export { greet as hello } from` delivers what `import { greet as hello }` delivers", async () => {
    const control = await measure(
      'import { greet as hello } from "./base.thetalib"\nlet r = hello("x")\nr\n',
      DIRECT_LIBS,
    );
    expect(
      control.materialised,
      "control precondition: an `as`-aliased direct import binds under the alias",
    ).toEqual(["fn hello"]);
    expect(control.runtime, "control precondition: the aliased binding is callable").toEqual({
      outcome: "value",
      value: "x",
    });
    const row = await measure('import { hello } from "./mid.thetalib"\nlet r = hello("x")\nr\n', {
      "/proj/base.thetalib": BASE,
      "/proj/mid.thetalib": midReExporting("greet as hello"),
    });
    expectDeliversLikeControl("c-alias", row, control);
  });
});

// ===========================================================================
// (d) THE DEPTH-2 CHAIN. The transitive export set is defined by recursion, so
// depth must not change the answer; a chain walk that resolves one hop only
// would pass (b) and red here.
// ===========================================================================

describe("bug 0101 (d) — chain depth does not change the answer", () => {
  it("RED (d-depth2): a re-export of a re-export delivers what the direct import delivers", async () => {
    const control = await measure(
      'import { greet } from "./base.thetalib"\nlet r = greet("x")\nr\n',
      DIRECT_LIBS,
    );
    expect(control.materialised, "control precondition").toEqual(["fn greet"]);
    const row = await measure('import { greet } from "./mid.thetalib"\nlet r = greet("x")\nr\n', {
      "/proj/base.thetalib": BASE,
      "/proj/mid2.thetalib": midReExporting("greet"),
      "/proj/mid.thetalib": midReExporting("greet", "./mid2.thetalib"),
    });
    expectDeliversLikeControl("d-depth2", row, control);
  });
});

// ===========================================================================
// (e) THE FOUR USE POSITIONS, each equal to its direct-import control.
// The bug doc measures four different runtime dispositions of the SAME missing
// binding (bug 0003's belt, a `code_tool` Err naming a host tool the author
// never wrote, a silent `null`, and `NullMemberAccessPanic`). Pinning those
// strings would encode the defect; each cell instead asserts the position
// delivers what the direct import delivers.
// ===========================================================================

describe("bug 0101 (e) — every use position delivers what its direct-import control delivers", () => {
  it("RED (e1-ordinary-call): a call with a non-object-literal argument", async () => {
    // Today this position ends in `PiToolArgShapeDefectError`
    // (src/runtime/statement-executor.ts' pre-evaluation belt and the
    // production lowering's mirror), whose text blames bug 0003's parse gate
    // for a site the parse gate classified correctly.
    const control = await measure(
      'import { greet } from "./base.thetalib"\nlet r = greet("x")\nr\n',
      DIRECT_LIBS,
    );
    expect(control.runtime, "control precondition: the direct import returns the body's value").toEqual(
      { outcome: "value", value: "x" },
    );
    const row = await measure(
      'import { greet } from "./mid.thetalib"\nlet r = greet("x")\nr\n',
      CHAIN_LIBS,
    );
    expectDeliversLikeControl("e1-ordinary-call", row, control);
  });

  it("RED (e2-zero-arg-call): a zero-argument call of a zero-argument `fn`", async () => {
    // `ping` is declared zero-arg so the control is a genuine value rather than
    // an arity mismatch: the bug doc's `greet()` row has no well-formed direct
    // control, and the invariant under test is equality with one.
    const control = await measure(
      'import { ping } from "./base.thetalib"\nlet r = ping()\nr\n',
      DIRECT_LIBS,
    );
    expect(control.runtime, "control precondition: the zero-arg `fn` returns its body's value").toEqual(
      { outcome: "value", value: "pong" },
    );
    const row = await measure('import { ping } from "./mid.thetalib"\nlet r = ping()\nr\n', {
      "/proj/base.thetalib": BASE,
      "/proj/mid.thetalib": midReExporting("ping"),
    });
    expectDeliversLikeControl("e2-zero-arg-call", row, control);
  });

  it("RED (e3-bare-identifier-read): a bare read of the imported name", async () => {
    // FENCE, deliberately: the RUNTIME half of this position is already equal
    // to its control — the pure evaluator's `case "ident"` reads `null` for a
    // materialised `fn` (its resolution arm is `import`, not `local`) exactly as
    // it does for an unresolved name (src/extension/production-theta-producer.ts:6342).
    // So the divergence this cell witnesses is the `materialised` half, which
    // `expectDeliversLikeControl` asserts FIRST; the runtime equality is the
    // fence that keeps the fix from changing a disposition the bug doc's
    // §Non-goals pins ("The `unresolved` arm's five different consumers").
    const control = await measure(
      'import { greet } from "./base.thetalib"\nlet r = greet\nr\n',
      DIRECT_LIBS,
    );
    expect(control.materialised, "control precondition: the direct import binds").toEqual([
      "fn greet",
    ]);
    const row = await measure('import { greet } from "./mid.thetalib"\nlet r = greet\nr\n', CHAIN_LIBS);
    expectDeliversLikeControl("e3-bare-identifier-read", row, control);
  });

  it("RED (e4-enum-variant-access): a variant access on a re-exported `enum`", async () => {
    // Today `env.resolveEnumVariant` misses, the target evaluates to `null`, and
    // `evaluateMemberAccess` raises `NullMemberAccessPanic: null member access: .Red`.
    const control = await measure(
      'import { Color } from "./base.thetalib"\nlet c = Color.Red\nc\n',
      DIRECT_LIBS,
    );
    expect(control.runtime, "control precondition: a materialised `enum` registers its variants").toEqual(
      { outcome: "value", value: "Red", enumBranded: true },
    );
    const row = await measure('import { Color } from "./mid.thetalib"\nlet c = Color.Red\nc\n', {
      "/proj/base.thetalib": BASE,
      "/proj/mid.thetalib": midReExporting("Color"),
    });
    expectDeliversLikeControl("e4-enum-variant-access", row, control);
  });
});

// ===========================================================================
// (f) THE SCHEMA-BRAND PAIR. The silent position: the constructor produces the
// declared fields either way and the values differ ONLY in the `SCHEMA_TAG`
// brand, which is what the QRY-18 outbound render reads to apply the schema's
// theta-side-to-wire field renames (src/runtime/value.ts' brand doc-comment
// names its two consumers).
// ===========================================================================

describe("bug 0101 (f) — a re-exported `schema` constructs a branded value", () => {
  const APP_CTOR = ["let a = Author {", '  name: "n"', "}", "a", ""].join("\n");

  it("GREEN (f-control): a directly imported `schema` brands the constructed value `\"Author\"`", async () => {
    const control = await measure(
      `import { Author } from "./base.thetalib"\n${APP_CTOR}`,
      DIRECT_LIBS,
    );
    expect(control.materialised, "the imported `schema` registers its constructor").toEqual([
      "schema Author",
    ]);
    expect(
      control.runtime.schemaTag,
      "the brand install is gated on `env.resolveSchema(...) !== undefined`, which a materialised schema satisfies",
    ).toBe("Author");
  });

  it("RED (f-chain): a re-exported `schema` brands the constructed value the same way", async () => {
    const control = await measure(
      `import { Author } from "./base.thetalib"\n${APP_CTOR}`,
      DIRECT_LIBS,
    );
    expect(
      control.runtime.schemaTag,
      "control precondition: the direct import must brand, or the equality below is vacuous",
    ).toBe("Author");
    const row = await measure(`import { Author } from "./mid.thetalib"\n${APP_CTOR}`, {
      "/proj/base.thetalib": BASE,
      "/proj/mid.thetalib": midReExporting("Author"),
    });
    expectDeliversLikeControl("f-chain", row, control);
    expect(
      row.runtime.schemaTag,
      "the brand is the whole of the divergence in this position: the fields are identical and only the `SCHEMA_TAG` the QRY-18 render reads is absent",
    ).toBe("Author");
  });
});

// ===========================================================================
// (g) THE UNRESOLVED RE-EXPORT PATHS. Exactly ONE of the two codes per
// re-export, never both, sited on the RE-EXPORTING lib — and the wrong-extension
// row asserted UNCHANGED at its single existing diagnostic.
// ===========================================================================

describe("bug 0101 (g) — a re-export's own path and specifier are checked", () => {
  const APP_BODY = 'import { greet } from "./mid.thetalib"\nlet r = greet("x")\nr\n';

  it(`RED (g1-unknown-source-symbol): a re-export naming a symbol the source lib does not declare draws ${UNKNOWN_SYMBOL_CODE} at the re-exporting lib`, async () => {
    const row = await measure(APP_BODY, {
      "/proj/base.thetalib": "fn other(x: string) {\n  x\n}\n",
      "/proj/mid.thetalib": midReExporting("greet"),
    });
    const hits = withCode(row.diagnostics, UNKNOWN_SYMBOL_CODE);
    expect(
      hits.length,
      `imports.md §"Unknown imported symbol" names an \`export { Foo } from\` specifier as an emission site, and the registry Trigger says the same, so a re-export specifier is checked against the file it names. No file in this set declares \`greet\`. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toBe(1);
    const hit = hits[0] as Diagnostic;
    expect(
      hit.file,
      "the diagnostic is sited on the RE-EXPORTING lib, whose specifier is the wrong one; it reaches the importing theta through the existing registration-error arm (§Fix constraint 4)",
    ).toBe("/proj/mid.thetalib");
    expect(
      hit.message,
      "DIAG-4 — the Message renders the re-export's source name and its own `fromPath`, not the importing theta's spec",
    ).toBe(unknownSymbolMessage("greet", "./base.thetalib"));
    expect(
      withCode(row.diagnostics, UNRESOLVABLE_CODE),
      "exactly one of the two codes per re-export, never both: `./base.thetalib` RESOLVES, so this is the unknown-symbol arm and not IMP-1",
    ).toEqual([]);
    expect(
      row.materialised,
      "no declaration anywhere in the chain backs the name, so nothing materialises",
    ).toEqual([]);
  });

  it(`RED (g2-missing-file): a re-export from a path that does not exist draws ${UNRESOLVABLE_CODE} at the re-exporting lib`, async () => {
    const row = await measure(APP_BODY, {
      "/proj/mid.thetalib": midReExporting("greet", "./nope.thetalib"),
    });
    const hits = withCode(row.diagnostics, UNRESOLVABLE_CODE);
    expect(
      hits.length,
      `IMP-1 states the resolver-failure contract for a \`.thetalib\` spec, and the registry Trigger names an \`export … from\` spec explicitly. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toBe(1);
    const hit = hits[0] as Diagnostic;
    expect(hit.file, "sited on the lib whose statement names the unresolvable path").toBe(
      "/proj/mid.thetalib",
    );
    expect(hit.message, "DIAG-4 — the Message renders the unresolvable spec").toBe(
      unresolvableMessage("./nope.thetalib"),
    );
    expect(
      withCode(row.diagnostics, UNKNOWN_SYMBOL_CODE),
      "exactly one of the two codes per re-export, never both: the path does not resolve, so there is no export set to miss in",
    ).toEqual([]);
    expect(row.materialised, "an unresolvable source lib provides nothing").toEqual([]);
  });

  it(`RED (g4-two-specifiers-unresolvable): one \`export\` statement with two specifiers and one unresolvable path draws ONE ${UNRESOLVABLE_CODE}, ranged over the STATEMENT`, async () => {
    // Resolution is a property of the STATEMENT's path literal, not of each
    // flattened specifier, so the import-side control (one IMP-1 per `import`
    // statement, ranged over `decl.range`) is the yardstick imports.md's
    // §Re-exports resolution paragraph names ("identically to an `import`'s").
    const mid = 'export { greet, ping } from "./nope.thetalib"\n';
    const row = await measure(APP_BODY, { "/proj/mid.thetalib": mid });
    const hits = withCode(row.diagnostics, UNRESOLVABLE_CODE);
    expect(
      hits.length,
      `one unresolvable path is one resolver failure: N specifiers on one \`export\` statement must not multiply it. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toBe(1);
    const hit = hits[0] as Diagnostic;
    expect(hit.file, "sited on the lib whose statement names the unresolvable path").toBe(
      "/proj/mid.thetalib",
    );
    const statement = parse(mid, "/proj/mid.thetalib").body.statements[0];
    expect(
      statement?.kind,
      "fixture precondition: the lib's first statement is the `export … from` under measurement",
    ).toBe("export");
    expect(
      hit.range,
      "the range is the export STATEMENT's, exactly as the import loop ranges IMP-1 over `decl.range`, not one specifier's",
    ).toEqual(statement?.range);
  });

  it(`RED (g5-two-specifiers-one-unknown): one \`export\` statement with two specifiers over a resolvable path draws ONE ${UNKNOWN_SYMBOL_CODE}, ranged over the SPECIFIER`, async () => {
    // The unknown-symbol arm names ONE symbol, so it stays per specifier and
    // keeps the specifier's range even though IMP-1 above is per statement.
    const mid = 'export { greet, ping } from "./base.thetalib"\n';
    const row = await measure(APP_BODY, {
      "/proj/base.thetalib": "fn greet(x: string) {\n  x\n}\n",
      "/proj/mid.thetalib": mid,
    });
    const hits = withCode(row.diagnostics, UNKNOWN_SYMBOL_CODE);
    expect(
      hits.length,
      `\`base\` declares \`greet\` and not \`ping\`, so exactly one of the two specifiers is unknown. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toBe(1);
    const hit = hits[0] as Diagnostic;
    expect(hit.file, "sited on the re-exporting lib").toBe("/proj/mid.thetalib");
    expect(hit.message, "DIAG-4 — the unnamed specifier is `ping`").toBe(
      unknownSymbolMessage("ping", "./base.thetalib"),
    );
    const statement = parse(mid, "/proj/mid.thetalib").body.statements[0];
    expect(
      statement?.kind,
      "fixture precondition: the lib's first statement is the `export … from` under measurement",
    ).toBe("export");
    const second =
      statement?.kind === "export" ? statement.specifiers[1] : undefined;
    expect(
      second?.source,
      "fixture precondition: the second specifier is the unprovided `ping`",
    ).toBe("ping");
    expect(
      hit.range,
      "the unknown-symbol arm names one symbol, so its range is that specifier's",
    ).toEqual(second?.range);
    expect(
      withCode(row.diagnostics, UNRESOLVABLE_CODE),
      "the path resolves, so IMP-1 does not fire alongside",
    ).toEqual([]);
    expect(
      row.materialised,
      "`greet` is provided through the re-export and is what the app imports",
    ).toEqual(["fn greet"]);
  });

  it(`GREEN (g3-wrong-extension): a non-\`.thetalib\` \`fromPath\` stays at its single ${EXTENSION_CODE}`, async () => {
    // The skip rule: a `fromPath` not ending in `.thetalib` is SKIPPED by the
    // new analysis, mirroring the import loop's extension skip
    // (the extension skip in `checkThetaImports`' import loop) — the parse-time literal
    // check is already the answer, and adding IMP-1 on top would double-report
    // one authoring mistake. The same rule is what leaves a from-less export's
    // `fromPath: ""` untouched, which is the fence under
    // tests/import-export-from-clause-required.test.ts group (f).
    const row = await measure(APP_BODY, {
      "/proj/mid.thetalib": midReExporting("greet", "./nope.theta"),
    });
    expect(
      row.diagnostics.map((d) => d.code),
      `the wrong-extension row is UNCHANGED at exactly one diagnostic: ${EXTENSION_CODE} from the re-exporting lib's own parse, surfaced through the registration-error arm. Rendered: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual([EXTENSION_CODE]);
    expect(row.materialised, "nothing resolves, so nothing materialises").toEqual([]);
  });
});

// ===========================================================================
// (h) THE RE-EXPORT CYCLE (§Fix constraint 5). The widened edge set makes
// `theta/load/import-cycle` the code that fires, and the settled fixpoint of a
// pure re-export cycle provides nothing, so each re-export in it ALSO draws the
// unknown-symbol code.
// ===========================================================================

describe("bug 0101 (h) — a re-export cycle terminates and is diagnosed", () => {
  it(`RED (h-cycle): \`mid\` and \`other\` re-exporting each other draw ${CYCLE_CODE} and ${UNKNOWN_SYMBOL_CODE}`, async () => {
    const row = await measure('import { greet } from "./mid.thetalib"\nlet r = greet("x")\nr\n', {
      "/proj/mid.thetalib": midReExporting("greet", "./other.thetalib"),
      "/proj/other.thetalib": midReExporting("greet", "./mid.thetalib"),
    });
    const cycles = withCode(row.diagnostics, CYCLE_CODE);
    expect(
      cycles.length,
      `imports.md §Cycles owns \`${CYCLE_CODE}\` for cycles "between \`.thetalib\` files", and §Fix constraint 5 widens that walk's edge set rather than adding a code. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toBe(1);
    const message = (cycles[0] as Diagnostic).message;
    expect(
      message,
      "the printed cycle path names both libs on the cycle; the traversal order the walk prints is not pinned here",
    ).toContain("mid");
    expect(message, "the printed cycle path names both libs on the cycle").toContain("other");
    // Both libs are equally wrong and each is diagnosed once. Under the least
    // fixpoint of this two-file set neither lib provides `greet` — the sets are
    // seeded from declarations, of which there are none, and no round can add a
    // name — so BOTH re-exports name a symbol nothing in the reachable set
    // provides, which is exactly imports.md §Re-exports' unknown-symbol
    // condition. The pair is also what makes the answer entry-independent: an
    // app entering at `other` instead of `mid` reads the same two errors.
    expect(
      withCode(row.diagnostics, UNKNOWN_SYMBOL_CODE)
        .map((d) => `${d.file} ${d.message}`)
        .sort(),
      `neither lib declares \`greet\` and no re-export in the set can supply it, so each of the two re-exports names a symbol nothing provides and draws its own diagnostic on the lib whose statement names it. Rendered diagnostics: ${JSON.stringify(
        row.diagLines,
      )}`,
    ).toEqual(
      [
        `/proj/mid.thetalib ${unknownSymbolMessage("greet", "./other.thetalib")}`,
        `/proj/other.thetalib ${unknownSymbolMessage("greet", "./mid.thetalib")}`,
      ].sort(),
    );
    expect(
      row.materialised,
      "the walk is bounded by a visited-path set and no declaration is reachable, so nothing materialises",
    ).toEqual([]);
  });

  it(`RED (h-cut-order-independence): a lib reached through a cycle yields the same diagnostics in either \`import\`-statement order`, async () => {
    // `a` declares `s` and carries one broken re-export (`t` is declared
    // nowhere); `b` re-exports `s` from `a`, closing an `a ↔ b` cycle; `c`
    // re-exports `s` from `b` off that cycle. The fixpoint gives `b` = {s} (from
    // `a`'s declaration) and then `c` = {s}, and nothing anywhere provides `t`,
    // so `a`'s own re-export is the single genuine unknown symbol. A derivation
    // that answered from a chain cut short at the cycle instead would (i) invent
    // an unknown-symbol against `c` for a name `b` genuinely re-exports and (ii)
    // swallow the true one against `a`, with which of the two happening
    // depending on the importing theta's `import`-statement order — so the pin
    // is that the order does not matter.
    const libs: Record<string, string> = {
      "/proj/a.thetalib": 'fn s(x: string) {\n  x\n}\nexport { t } from "./b.thetalib"\n',
      "/proj/b.thetalib": 'export { s } from "./a.thetalib"\n',
      "/proj/c.thetalib": 'export { s } from "./b.thetalib"\n',
    };
    const IMPORT_A = 'import { s } from "./a.thetalib"';
    const IMPORT_C = 'import { s as sc } from "./c.thetalib"';
    const forward = await measure(`${IMPORT_A}\n${IMPORT_C}\nlet r = s("x")\nr\n`, libs);
    const reversed = await measure(`${IMPORT_C}\n${IMPORT_A}\nlet r = s("x")\nr\n`, libs);

    for (const [label, row] of [
      ["a-then-c", forward],
      ["c-then-a", reversed],
    ] as const) {
      const unknown = withCode(row.diagnostics, UNKNOWN_SYMBOL_CODE);
      expect(
        unknown.filter((d) => d.file === "/proj/c.thetalib"),
        `${label}: \`b\` re-exports \`s\` — the same edge this run materialises through — so no unknown-symbol may be invented against \`c\`. Rendered diagnostics: ${JSON.stringify(
          row.diagLines,
        )}`,
      ).toEqual([]);
      expect(
        unknown.map((d) => `${d.file} ${d.message}`),
        `${label}: nothing declares \`t\`, so \`a\`'s own re-export is the one genuine unknown symbol and it must survive the cycle. Rendered diagnostics: ${JSON.stringify(
          row.diagLines,
        )}`,
      ).toEqual([`/proj/a.thetalib ${unknownSymbolMessage("t", "./b.thetalib")}`]);
      const cycles = withCode(row.diagnostics, CYCLE_CODE);
      expect(
        cycles.length,
        `${label}: \`a\` and \`b\` re-export each other, so the widened edge set draws one ${CYCLE_CODE}`,
      ).toBe(1);
      const message = (cycles[0] as Diagnostic).message;
      expect(message, `${label}: the printed path names the cycle's libs`).toContain("a.thetalib");
      expect(message, `${label}: the printed path names the cycle's libs`).toContain("b.thetalib");
    }

    // `materialised` is in `import`-statement order, so it is compared as a set:
    // both orders bind `s` through `a` directly and `sc` through the `c → b → a`
    // chain.
    expect(
      [...forward.materialised].sort(),
      "the bindings the chain delivers do not depend on the order the importing theta names the two libs",
    ).toEqual([...reversed.materialised].sort());
    expect(
      [...forward.materialised].sort(),
      "both names resolve to `a`'s `fn s`: one directly, one through the chain that closes the cycle",
    ).toEqual(["fn s", "fn sc"]);
  });
});

// ===========================================================================
// (j) ENTRY-INDEPENDENCE THROUGH A CYCLE EVERY NAME FLOWS ROUND.
// `a` declares `f` and re-exports `h` from `b`; `b` declares `h` and re-exports
// `f` from `c`; `c` re-exports `f` from `a`. Every name in this 3-cycle is
// genuinely provided: the least fixpoint of the three files gives `a` = {f, h},
// `b` = {h, f}, `c` = {f}. So no specifier here names a symbol nothing
// provides, and the resolved export set — with the errors reported for it — is a
// function of the `.thetalib` file set alone (imports.md §Re-exports), never of
// which lib the importing theta enters the graph through. The cell measures
// BOTH entries because a derivation that answers from a chain cut short at the
// cycle reads a set one frame above the cut that is missing the provided name,
// and invents an unknown symbol against an edge whose name the other entry
// materialises through.
// ===========================================================================

describe("bug 0101 (j) — a cycle whose every name is provided is entry-independent", () => {
  const LIBS: Record<string, string> = {
    "/proj/a.thetalib": 'fn f(x: string) {\n  x\n}\nexport { h } from "./b.thetalib"\n',
    "/proj/b.thetalib": 'fn h(x: string) {\n  x\n}\nexport { f } from "./c.thetalib"\n',
    "/proj/c.thetalib": 'export { f } from "./a.thetalib"\n',
  };

  for (const entry of ["./a.thetalib", "./b.thetalib"] as const) {
    it(`RED (j-provided-cycle-${entry.slice(2, 3)}): entering the cycle at ${entry} reports no unknown symbol and materialises \`f\``, async () => {
      const row = await measure(
        `import { f } from "${entry}"\nlet r = f("x")\nr\n`,
        LIBS,
      );
      expect(
        withCode(row.diagnostics, UNKNOWN_SYMBOL_CODE).map((d) => `${d.file} ${d.message}`),
        `entry ${entry}: the least fixpoint of these three files provides every re-exported name (a = {f, h}, b = {h, f}, c = {f}), so no specifier names a symbol nothing provides. imports.md §Re-exports makes the resolved export set a function of the \`.thetalib\` file set alone, so an unknown symbol here would be an artefact of the entry lib. Rendered diagnostics: ${JSON.stringify(
          row.diagLines,
        )}`,
      ).toEqual([]);
      expect(
        withCode(row.diagnostics, CYCLE_CODE).length,
        `entry ${entry}: the widened edge set sees the a → b → c → a cycle, so imports.md §Cycles' one \`${CYCLE_CODE}\` fires. Rendered diagnostics: ${JSON.stringify(
          row.diagLines,
        )}`,
      ).toBe(1);
      expect(
        row.materialised,
        `entry ${entry}: \`f\` is \`a\`'s declaration, reached directly from \`a\` and through \`b\` → \`c\` → \`a\` from \`b\`; the binding a re-export delivers does not depend on where the chain is entered`,
      ).toEqual(["fn f"]);
    });
  }
});

// ===========================================================================
// (i) A `.thetalib` ON THE IMPORTING SIDE — the only row that reaches the value
// from inside a library body.
// WITNESS (flipped from a fence, PRE-AUTHORIZED by bug 0303 §Fix constraint 5):
// `wrap`'s body calls `greet`, a symbol `top` itself imported. At 0101's fix
// baseline this was a FENCE — the body ran in the CALLER's environment where a
// lib-internal `import` was never materialised, so BOTH the direct-import
// control and the re-export row failed IDENTICALLY, and the honest claim was
// only that the re-export added nothing to that shared failure. Bug 0303 fixes
// the lib-body scope (an imported `fn` body resolves its free names in its
// DECLARING module, materialising the lib's OWN imports recursively), so a
// WORKING direct import now DELIVERS `greet(y)` = "q" — and the cell asserts the
// control DELIVERS that value (the flip: an absolute pin, RED until 0303 lands),
// then that the re-export DELIVERS IDENTICALLY. The invariant is unchanged — a
// re-export delivers exactly what the direct import of the same declaration
// delivers — but its subject is now a working import, not a shared failure.
// This is the pre-authorized re-derivation §Fix constraint 5 names; the
// `expectDeliversLikeControl` structure is retained and not weakened.
// ===========================================================================

describe("bug 0101 (i) / bug 0303 — a re-export reached from inside a library body delivers what the direct import delivers", () => {
  const APP_BODY = 'import { wrap } from "./top.thetalib"\nlet r = wrap("q")\nr\n';
  const TOP = (from: string): string =>
    `import { greet } from "${from}"\nfn wrap(y: string) {\n  greet(y)\n}\n`;

  it("RED (i-libside): `top` importing `greet` through a re-export delivers what `top` importing it directly delivers", async () => {
    const control = await measure(APP_BODY, {
      "/proj/base.thetalib": BASE,
      "/proj/top.thetalib": TOP("./base.thetalib"),
    });
    expect(
      control.materialised,
      "control precondition: the app's own specifier names `wrap`, which `top` declares, so `wrap` materialises on both sides",
    ).toEqual(["fn wrap"]);
    // THE FLIP (bug 0303): the direct-import control must DELIVER `wrap`'s value.
    // `wrap(y)` is `greet(y)` and `greet(x: string) { x }`, so `wrap("q")` = "q"
    // once the lib body resolves `greet` in `top`'s declaring module. This is the
    // absolute pin the fence lacked: RED at this baseline (`wrap`'s body resolves
    // `greet` in the caller's env, where `top`'s own import is not materialised,
    // so it dies in bug 0003's belt), GREEN once bug 0303 lands.
    expect(
      control.runtime,
      "bug 0303: `top` imports `greet`, so `wrap`'s body resolves it in `top`'s declaring module; `wrap(\"q\")` = `greet(\"q\")` = \"q\"",
    ).toEqual({ outcome: "value", value: "q" });
    const row = await measure(APP_BODY, {
      "/proj/base.thetalib": BASE,
      "/proj/mid.thetalib": midReExporting("greet"),
      "/proj/top.thetalib": TOP("./mid.thetalib"),
    });
    expect(
      row.diagLines,
      "`mid` re-exports a name `base` declares, so the re-export verifies and the load pass reports nothing",
    ).toEqual([]);
    expectDeliversLikeControl("i-libside", row, control);
  });
});
