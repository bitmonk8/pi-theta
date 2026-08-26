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
import { isEnumValue, schemaTagOf, type ThetaValue } from "../src/runtime/value";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { FileSystem } from "../src/seams/file-system";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0303 — an imported `.thetalib` `fn` body resolves its FREE names in the
// DECLARING module's scope, not the calling theta's. `MaterializedImport`
// (`src/runtime/lexical-environment.ts`) carries an imported `fn` as a bare
// `FnDecl` (`materializeSymbol`, `src/extension/import-static-checks.ts`), and
// `evalUserFnCall` / `evalSubagentFnCall` (`src/runtime/statement-executor.ts`)
// run that body against the CALLER's environment (`env.childFnActivation()` /
// `env.spawnIsolatedScope()`). So a lib fn's reference to a same-lib sibling
// `fn`, a same-lib `enum`, or a symbol the lib itself imported is resolved
// against the CALLING theta's root registries — the wrong file's scope. The
// program every static gate admits (the lib's own parse resolves its call sites
// against its whole file, functions.md FN-1's hoisting "within the file") then
// executes against a different file's scope, so the checked program and the
// executed program disagree:
//   - the free name is ABSENT in the caller → the call falls off the user-fn
//     path onto the effect path and aborts on statically-valid input (B1/B3/B4,
//     the depth-2 row, the subagent-fn row);
//   - the free name is PRESENT in the caller under the same spelling → the
//     CALLER's declaration is silently bound inside the lib body (dynamic
//     scoping) and the lib returns a value its author never wrote (B2/B3b).
//
// The oracle is the DECLARING module's value, which the lib's own parse already
// binds: functions.md FN-1 (`docs/spec_topics/functions.md`) hoists
// declarations "within the file" and admits mutual recursion between two
// top-level `fn`s for `.theta` and `.thetalib` alike; imports.md §Visibility
// (`docs/spec_topics/imports.md`) makes a lib's own internal references
// unconditional on what the importer imports. So `compute(1)` is 2 (the sibling
// `helper` the lib declares), never a throw and never the caller's 100; a
// lib-body `Color.Red` is the DECLARING lib's wire, never the caller's
// same-named variant. Each cell pins the DECLARING lib's value, which is RED at
// this fork (the aborts / caller-capture the bug doc §Reproduction records) and
// GREEN once the fix threads a per-declaring-module environment through both
// executors and the `subagent fn` spawn.
//
// TIER: unit, offline, deterministic, provider-free. The whole class settles
// inside one `parseThetaDocument` over a string, one `checkThetaImports` over an
// in-memory `FileSystem` double, and one `executeBody` bound through
// `createProductionProducerDeps(...).bindPromptConversation` with a frozen empty
// callable set — the seam that materialises an import and the seams that run its
// body are both reachable in-process. An integration tier would add a discovery
// round trip to a decision the load pass has already made; a live tier would add
// a provider to a decision no model participates in (every fixture's value is
// computed theta-side). The one live-exercised surface — a `subagent fn` body
// carrying a resolved sibling into a real drive — is covered by
// tests/live/b0303live-imported-fn-private-sibling-live-cell.test.ts; the
// subagent-fn cell here witnesses the same sibling-resolution seam offline
// through the in-process session switch (see its own note).
//
// NO SILENT SKIPPING: every cell fails loudly on its own runtime observable;
// none early-returns, and the load-pass precondition (a clean, well-formed
// import) is asserted before the runtime value so a resolution regression reds
// as an unmet precondition rather than masquerading as the scope defect. `0.291.0`
// is a literal version placeholder — the lane parent fills the real version.

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
 * brand and enum brand, or the thrown error's `name: message`. A throw is
 * captured as a VALUE (not allowed to escape) so a row is comparable with one
 * `toEqual` and the red prints both sides. This is the
 * tests/reexport-chain-resolution.test.ts `RuntimeOutcome` shape verbatim.
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
  readonly diagLines: string[];
  readonly materialised: string[];
  readonly runtime: RuntimeOutcome;
}

/**
 * Parse `/proj/app.theta`, run the real `checkThetaImports` over `libs`, then
 * run the real `executeBody` with whatever the load pass materialised — the
 * tests/reexport-chain-resolution.test.ts `measure()` harness.
 *
 * `resolvePiTool` would resolve ANY name to an "AMBIENT" sentinel and the
 * callable set is a frozen empty snapshot, so an ambient host-tool execution
 * would surface rather than be mistaken for a resolved import — no cell here
 * consults it.
 *
 * `modelRegistry.getAvailable` returns one fixture model. The `.theta`/`.thetalib`
 * rows never touch it; the subagent-fn cell does — `evalSubagentFnCall`'s
 * in-process session switch (`spawnSubagentSession`) reads the available models
 * to resolve the spawned session's model ref, so a bare `{}` registry would
 * abort the spawn at `getAvailable is not a function` (a harness limitation)
 * BEFORE the body's sibling call runs and masks the scope defect under test.
 * The stub lets the body run in-process so the sibling-resolution observable is
 * the deciding factor rather than the harness.
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
    modelRegistry: {
      getAvailable: (): unknown[] => [
        { id: "claude-sonnet-5", provider: "anthropic", displayName: "sonnet" },
      ],
    } as unknown as ModelRegistry,
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
  // The `.then(ok, err)` rejection arm — not a broad `catch` — turns a runtime
  // panic into a comparable value.
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

/**
 * Every cell shares this precondition: the importing theta parses clean and the
 * load pass reports nothing (a well-formed import IS legal input at every gate —
 * the bug doc §Reproduction measured `diags :: []` for all rows). Asserted
 * BEFORE the runtime value so a load regression reds as an unmet precondition,
 * not as the scope defect under test.
 */
function expectCleanLoad(row: Measured, label: string, expectedMaterialised: string[]): void {
  expect(row.appParseCodes, `${label}: the importing file parses clean`).toEqual([]);
  expect(
    row.diagLines,
    `${label}: a well-formed \`.thetalib\` import is legal at every static gate; the load pass must report nothing (bug doc §Reproduction: \`diags :: []\`)`,
  ).toEqual([]);
  expect(
    row.materialised,
    `${label}: imports.md §Visibility auto-exports a top-level \`fn\`/\`enum\`, so the imported symbol materialises under its local name`,
  ).toEqual(expectedMaterialised);
}

// ===========================================================================
// Fixtures. Declaration bodies are multi-line, one member per line
// (docs/STYLE.md).
// ===========================================================================

/** The shared lib: a public `compute` factored over a private sibling `helper`. */
const LIB = [
  "fn helper(x: integer): integer {",
  "  x + 1",
  "}",
  "fn compute(x: integer): integer {",
  "  helper(x)",
  "}",
  "",
].join("\n");

/** A lib whose `pick` reads a same-lib `enum`. */
const LIB2 = [
  "enum Color {",
  "  Red",
  "  Blue",
  "}",
  "fn pick(): Color {",
  "  Color.Red",
  "}",
  "",
].join("\n");

describe("bug 0303 — an imported `.thetalib` `fn` body resolves free names in its declaring module", () => {
  it("B1 RED (want value 2): a sibling `fn` call with no caller-side name returns the DECLARING lib's value", async () => {
    // `compute → helper` is a same-file reference the lib's own parse admits on
    // functions.md FN-1's hoisting-within-the-file ground. At this fork the body
    // runs in the caller's env, where `helper` is unbound, so the call falls
    // onto the effect path and dies in bug 0003's belt naming a parse gate that
    // did its job. The executed program must agree with the checked one: 2.
    const row = await measure(
      'import { compute } from "./lib.thetalib"\nlet r = compute(1)\nr\n',
      { "/proj/lib.thetalib": LIB },
    );
    expectCleanLoad(row, "B1", ["fn compute"]);
    expect(
      row.runtime,
      "functions.md FN-1: `helper` is a same-file sibling the lib's parse hoists; `compute(1)` is `helper(1)` = 2, resolved in the DECLARING module, never a throw",
    ).toEqual({ outcome: "value", value: 2 });
  });

  it("B2 RED (want value 2, NOT 100): a caller-side same-named `fn` does not capture the lib body", async () => {
    // The silent-wrong-value half: the caller declares its own `helper`, and the
    // lib body binds THAT declaration (dynamic scoping) — returning 100 where
    // the declaring lib computes 2. theta has no dynamic scoping anywhere else;
    // the lib author never saw the caller's `helper`.
    const row = await measure(
      [
        'import { compute } from "./lib.thetalib"',
        "fn helper(x: integer): integer {",
        "  x * 100",
        "}",
        "let r = compute(1)",
        "r",
        "",
      ].join("\n"),
      { "/proj/lib.thetalib": LIB },
    );
    expectCleanLoad(row, "B2", ["fn compute"]);
    expect(
      row.runtime,
      "the lib's `compute` resolves its own sibling `helper` (x + 1) in the DECLARING module, so `compute(1)` is 2; the caller's same-named `helper` (x * 100) must NOT be captured",
    ).toEqual({ outcome: "value", value: 2 });
  });

  it('B3 RED (want wire "Red"): a same-lib `enum` read with no caller enum returns the DECLARING lib\'s wire', async () => {
    // `pick`'s body reads `Color.Red`, a same-lib `enum`. At this fork
    // `env.resolveEnumVariant` misses against the caller's (empty) enum
    // registry, the target evaluates to `null`, and `NullMemberAccessPanic`
    // follows. The declaring lib's `Color.Red` has wire "Red".
    const row = await measure(
      'import { pick } from "./lib2.thetalib"\nlet c = pick()\nc\n',
      { "/proj/lib2.thetalib": LIB2 },
    );
    expectCleanLoad(row, "B3", ["fn pick"]);
    expect(
      row.runtime,
      "`pick` reads its own lib's `enum Color`; `Color.Red` has wire \"Red\", resolved in the DECLARING module, never a null member access",
    ).toEqual({ outcome: "value", value: "Red", enumBranded: true });
  });

  it('B3b RED (want wire "Red", NOT "caller-red"): a caller-side same-named `enum` does not capture the lib body', async () => {
    // The silent-wrong-value half for enums: the caller declares its own
    // `enum Color` with `Red = "caller-red"`, and the lib body reads THAT
    // variant's wire. The declaring lib's `Red` has wire "Red".
    const row = await measure(
      [
        'import { pick } from "./lib2.thetalib"',
        "enum Color {",
        '  Red = "caller-red"',
        "  Blue",
        "}",
        "let c = pick()",
        "c",
        "",
      ].join("\n"),
      { "/proj/lib2.thetalib": LIB2 },
    );
    expectCleanLoad(row, "B3b", ["fn pick"]);
    expect(
      row.runtime,
      'the lib\'s `pick` reads its own `enum Color` (wire "Red") in the DECLARING module; the caller\'s same-named `Red = "caller-red"` must NOT be captured',
    ).toEqual({ outcome: "value", value: "Red", enumBranded: true });
  });

  it("B4 RED (want value 12): a lib-to-lib import composes across two libs", async () => {
    // The 0101 cell (i) class: `top` imports `greet` from `base` and declares
    // `wrap → greet`; the app imports only `wrap`. imports.md:13-14 licenses
    // exactly this composition (a `.thetalib` top level may `import`, and the
    // full Theta language is available inside `fn` bodies). At this fork `wrap`'s
    // body resolves `greet` against the caller's env, where the lib's own import
    // was never materialised. `wrap(2)` is `greet(2)` = 2 + 10 = 12.
    const row = await measure(
      'import { wrap } from "./top.thetalib"\nlet r = wrap(2)\nr\n',
      {
        "/proj/base.thetalib": ["fn greet(x: integer): integer {", "  x + 10", "}", ""].join("\n"),
        "/proj/top.thetalib": [
          'import { greet } from "./base.thetalib"',
          "fn wrap(y: integer): integer {",
          "  greet(y)",
          "}",
          "",
        ].join("\n"),
      },
    );
    expectCleanLoad(row, "B4", ["fn wrap"]);
    expect(
      row.runtime,
      "the fix materialises the lib's OWN imports recursively, so `top`'s `wrap` resolves the `greet` `top` imported; `wrap(2)` is `greet(2)` = 12",
    ).toEqual({ outcome: "value", value: 12 });
  });

  it("B5 GREEN (value 2, must stay green): the accidental workaround keeps working", async () => {
    // The importer imports the private sibling too, materialising `helper` into
    // the caller's root where the lib body finds it. This is the only shape that
    // works at this fork; the fix must not break it. Its GREEN is a fence: the
    // program's meaning must NOT depend on the importer's specifier list, so the
    // declaring-module value (2) is the same the workaround already delivers.
    const row = await measure(
      'import { compute, helper } from "./lib.thetalib"\nlet r = compute(1)\nr\n',
      { "/proj/lib.thetalib": LIB },
    );
    expectCleanLoad(row, "B5", ["fn compute", "fn helper"]);
    expect(
      row.runtime,
      "importing the sibling too materialises it into the caller's root; `compute(1)` is 2 — and the fix must keep it 2",
    ).toEqual({ outcome: "value", value: 2 });
  });

  it("depth-2 RED (want value 6): a lib-to-lib import reaching two hops down composes", async () => {
    // `c → b → a`: `a` declares the leaf, `b` imports it and wraps it, `c`
    // imports `b`'s wrapper and wraps again; the app imports only `c`'s `top`.
    // The transitive materialisation the fix owes must carry two hops, not one.
    // `top(1)` is `mid(1)` is `leaf(1)` = 1 + 5 = 6.
    const row = await measure(
      'import { top } from "./c.thetalib"\nlet r = top(1)\nr\n',
      {
        "/proj/a.thetalib": ["fn leaf(x: integer): integer {", "  x + 5", "}", ""].join("\n"),
        "/proj/b.thetalib": [
          'import { leaf } from "./a.thetalib"',
          "fn mid(x: integer): integer {",
          "  leaf(x)",
          "}",
          "",
        ].join("\n"),
        "/proj/c.thetalib": [
          'import { mid } from "./b.thetalib"',
          "fn top(x: integer): integer {",
          "  mid(x)",
          "}",
          "",
        ].join("\n"),
      },
    );
    expectCleanLoad(row, "depth-2", ["fn top"]);
    expect(
      row.runtime,
      "recursive lib-to-lib materialisation carries two hops: `top` resolves `mid` (in c's scope), which resolves `leaf` (in b's scope); `top(1)` = 6",
    ).toEqual({ outcome: "value", value: 6 });
  });

  it("subagent-fn RED (want value 12): an imported `subagent fn` body reaches its private sibling in the declaring module", async () => {
    // §Fix constraint 1 pins the `subagent fn` variant: its body resolves free
    // names in its DECLARING module too (the fix threads the module env through
    // `evalSubagentFnCall`'s `spawnIsolatedScope`, §Fix design point 10).
    //
    // WHY OFFLINE-DRIVABLE HERE: a `subagent fn` call is an IN-PROCESS isolated
    // session switch (RFC 0001), not an RFC-0006 child-process spawn — so with
    // the `measure()` harness's `modelRegistry.getAvailable` stub the spawn runs
    // the body in-process and the sibling call is the deciding factor. At this
    // fork the sibling `helper` is unbound in the caller's env, the call dies in
    // bug 0003's belt, and the subagent boundary downgrades that panic to a
    // caller-visible `Err(InvokeInfraError)` (the runtime value below is that
    // Err at this fork). Post-fix the sibling resolves in the declaring module,
    // the body computes `x + 7`, and the subagent boundary crosses the final
    // value: `compute(5)` = `helper(5)` = 12. The observable is the RESOLVED
    // sibling's arithmetic, not model output — no live model participates.
    const row = await measure(
      'import { compute } from "./sublib.thetalib"\nlet r = compute(5)\nr\n',
      {
        "/proj/sublib.thetalib": [
          "fn helper(x: integer): integer {",
          "  x + 7",
          "}",
          "subagent fn compute(x: integer): integer {",
          "  helper(x)",
          "}",
          "",
        ].join("\n"),
      },
    );
    expectCleanLoad(row, "subagent-fn", ["fn compute"]);
    expect(
      row.runtime,
      "the imported `subagent fn`'s body resolves its private sibling `helper` in the DECLARING module; `compute(5)` crosses the subagent boundary as `helper(5)` = 12, never an InvokeInfraError over an unresolved `helper`",
    ).toEqual({ outcome: "value", value: 12 });
  });

  it("enum-identity RED (want equal): a lib-body enum value equals the caller-side import of the SAME declaration under an alias", async () => {
    // PARENT FORWARD NOTE (§Fix design point 3): a module-scope enum read and a
    // caller-side imported read of the SAME declaration must mint identical
    // declaration-identity tags (`enumDeclaringKey(libPath, name)`, bug 0305) so
    // they compare `==` equal. The ALIAS form is the sharp witness (mirroring
    // bug 0305 D2): the app imports `Color as Shade` and `pick`; `pick`'s body
    // returns `Color.Red`. At this fork the body resolves `Color` against the
    // caller's env, which binds only `Shade`, so `Color.Red` is a null member
    // access. Post-fix the body resolves `Color` in the declaring module and its
    // tag `lib2.thetalib#Color` matches `Shade`'s (the alias of the same
    // declaration), so `pick() == Shade.Red` is true. A wrong module-scope key
    // would red this AFTER the fix — the forward-note guard.
    const row = await measure(
      [
        'import { Color as Shade } from "./lib2.thetalib"',
        'import { pick } from "./lib2.thetalib"',
        "let x = pick() == Shade.Red",
        "x",
        "",
      ].join("\n"),
      { "/proj/lib2.thetalib": LIB2 },
    );
    expectCleanLoad(row, "enum-identity", ["enum Shade", "fn pick"]);
    expect(
      row.runtime,
      "bug 0305 `enumDeclaringKey` + §Fix design point 3: the lib-body `Color.Red` and the caller's `Shade.Red` are the SAME declaration, so their tags match and `pick() == Shade.Red` is true",
    ).toEqual({ outcome: "value", value: true });
  });

  it("enum-identity CONTROL GREEN (value true, must stay green): the same-name shape stays equal", async () => {
    // The bug doc §Fix constraint 5 / design point 3's literal shape: the app
    // imports `Color` (same name) and `pick`. It is GREEN at this fork —
    // coincidentally, because caller-capture binds the caller's imported `Color`
    // (which already carries the right bug-0305 declaring key) inside the lib
    // body — and must STAY green after the fix, when the body instead resolves
    // `Color` in the declaring module and mints the same tag. A regression that
    // gave the module-scope enum a different declaring key would red this.
    const row = await measure(
      [
        'import { Color } from "./lib2.thetalib"',
        'import { pick } from "./lib2.thetalib"',
        "let x = pick() == Color.Red",
        "x",
        "",
      ].join("\n"),
      { "/proj/lib2.thetalib": LIB2 },
    );
    expectCleanLoad(row, "enum-identity same-name", ["enum Color", "fn pick"]);
    expect(
      row.runtime,
      "a lib-body `Color.Red` and the caller's imported `Color.Red` are the same declaration, so they compare equal — before and after the fix",
    ).toEqual({ outcome: "value", value: true });
  });
});
