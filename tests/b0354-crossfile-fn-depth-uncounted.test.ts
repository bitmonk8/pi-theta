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
import {
  InvokeDepthExceededPanic,
  newInvokeChainAtDepth,
  pushCountableFrame,
} from "../src/runtime/invoke-depth-cycle";
import type { MaterializedImport } from "../src/runtime/lexical-environment";
import { executeBody } from "../src/runtime/statement-executor";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import { isEnumValue, schemaTagOf, type ThetaValue } from "../src/runtime/value";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { FileSystem } from "../src/seams/file-system";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0354 — a CROSS-FILE `.thetalib` `fn` call is never counted against
// ceiling #1 (INV-4, the invoke-chain depth cap of 32). INV-4 names FOUR
// countable frame classes — a direct `invoke(...)`, a `.theta` callable
// dispatched through a `tools:` entry, a *cross-file* `.thetalib` `fn` call,
// and a `subagent fn` call. Three are wired to `pushCountableFrame`; the
// cross-file `fn` class is wired NOWHERE. The classifier written for it
// (`thetalibFnFrameKind`, `src/runtime/invoke-depth-cycle.ts:109`) has no
// production caller, and neither executor that runs those frames —
// `evalUserFnCall` (`src/runtime/statement-executor.ts:451`, the async path) nor
// its pure-host twin `evaluatePureFnCall`
// (`src/extension/production-theta-producer.ts:7356`, the
// interpolation/invoke-arg path) — consults any `InvokeChain`. So a 40-deep
// cross-file `fn` chain loads clean and completes with a value where INV-4
// prescribes a runtime panic `invoke chain depth exceeded: 33 > 32` at the 33rd
// frame push (bug doc §Reproduction: `result: {"outcome":"value","value":40}`,
// `load diagnostics: []`).
//
// THE ORACLE (bug doc §Expected behaviour, docs/spec_topics/invocation.md §INV-4):
// "The interpreter caps the nesting depth of an `invoke` chain at 32, counting
// direct `invoke(...)`, `.theta` callable calls through `tools:`, cross-file
// `.thetalib` `fn` calls, and `subagent fn` calls … a `.thetalib` `fn` call is
// *cross-file* whenever the caller resides in a different source file from the
// callee … The cap is breached when the runtime is about to push a frame that
// would bring the count to 33 … the diagnostic renders `invoke chain depth
// exceeded: 33 > 32`." Each breach cell pins that exact panic; each boundary /
// intra-file / byte-identical control pins the completing value the same cap
// arithmetic already delivers — a control asserted broken cannot vacuously
// satisfy an equality.
//
// CHAIN ARITHMETIC (bug doc §Reproduction, brief §Witnesses): N libs where
// `libI.fI(x) = f(I+1)(x)` and `libN.fN(x) = x + N`; the app imports `f1` and
// calls `f1(0)`. Every hop is cross-file (caller and callee in different source
// files — app→lib1, lib1→lib2, … lib(N-1)→libN), so the chain holds exactly N
// countable frames per INV-4. Breach fires when a push reaches depth 33: N=33
// (or the doc's N=40) breaches from depth 0; a chain seeded at depth D (the
// `subagentInboundInvokeDepth` proxy for real invoke frames — the SAME per-chain
// counter invoke frames increment, §Non-goals) breaches when D + hops reaches 33.
//
// TIER: **unit**, offline, deterministic, provider-free. Every runtime cell
// settles inside one `parseThetaDocument` over a string, one real
// `checkThetaImports` over an in-memory `FileSystem` double, and one
// `executeBody` bound through `createProductionProducerDeps(...).bindPromptConversation`
// — the tests/b0303-imported-fn-body-declaring-scope.test.ts `measure()`
// harness verbatim, extended only to thread `subagentInboundInvokeDepth` into
// the producer input (so the chain seeds at a chosen depth). The counting the
// bug omits happens theta-side, at frame-push time, BEFORE any model
// participates — an integration or live tier would add a provider to a decision
// no model touches. The pure-host row (row 6) reaches
// `evaluatePureFnCall` through query-template interpolation with the query
// DRIVE deliberately never reached; the byte-identical controls (row 7) are the
// two untouched production push-site classes, asserted directly over
// `pushCountableFrame`.
//
// NO SILENT SKIPPING: every cell fails loudly on its own runtime observable;
// none early-returns, and the clean-load precondition (a well-formed import,
// `diags :: []`) is asserted BEFORE the runtime value so a load regression reds
// as an unmet precondition rather than masquerading as the missing-count defect.
//
// `0.367.0` is a literal version placeholder — the lane parent fills the real
// version.

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
 * `toEqual` and the red prints both sides. The b0303 harness shape.
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
 * tests/b0303-imported-fn-body-declaring-scope.test.ts `measure()` harness,
 * extended with ONE new optional argument: `subagentInboundInvokeDepth`.
 *
 * WHY THE EXTENSION: the bug is a MISSING frame push on the per-chain INV-4
 * counter, and the mixed-sum / re-export / pure-host witnesses need the counter
 * SEEDED near the cap without building a 32-frame invoke chain by hand.
 * `createProductionProducerDeps` already accepts `subagentInboundInvokeDepth?`
 * (`src/extension/production-theta-producer.ts:441`) — the inbound depth a
 * subagent child `pi` process is launched at — and seeds the top-level chain at
 * that depth (`newInvokeChainAtDepth(this.#input.subagentInboundInvokeDepth ??
 * 0)`, `:1831`/`:2039`). It is the faithful proxy for real invoke frames: the
 * cross-file `fn` counter the fix wires is the SAME counter invoke frames
 * increment (bug doc §Non-goals), so a chain seeded at depth 32 is
 * indistinguishable, to the fn accounting, from one 32 real frames deep.
 *
 * `resolvePiTool` resolves ANY name to an "AMBIENT" sentinel and the callable
 * set is a frozen empty snapshot, so no cross-file `fn` here is mistaken for a
 * host tool. `modelRegistry.getAvailable` returns one fixture model. NO runtime
 * cell here issues a model turn: the fn-chain rows compute theta-side and
 * return; the pure-host row (row 6) panics DURING interpolation render, before
 * the query drive is reached (see its own note).
 */
async function measure(
  appBody: string,
  libs: Record<string, string>,
  subagentInboundInvokeDepth?: number,
): Promise<Measured> {
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
    // The one new passthrough: seed the top-level chain at this depth so a short
    // cross-file `fn` chain reaches the cap (the mixed-sum / re-export /
    // pure-host witnesses). Absent → the producer seeds at 0 (the fn-chain rows).
    ...(subagentInboundInvokeDepth !== undefined ? { subagentInboundInvokeDepth } : {}),
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
  // panic (a top-level `InvokeDepthExceededPanic`) into a comparable value.
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
 * The registered breach observable: a top-level `InvokeDepthExceededPanic`
 * (`src/runtime/runtime-panics.ts:112` mints the name; `:355` mints the message
 * `invoke chain depth exceeded: <nextDepth> > 32`) captured by the harness as
 * `{outcome:"throw", value:"<name>: <message>"}`. The panic is a `ThetaPanic`;
 * at the top level it propagates out of `executeBody` (the same routing bug
 * 0303's null-member-access cells observe) and the harness's rejection arm
 * frames it here.
 */
const BREACH_THROW: RuntimeOutcome = {
  outcome: "throw",
  value: "InvokeDepthExceededPanic: invoke chain depth exceeded: 33 > 32",
};

/** The app body every cross-file `fn`-chain row shares: import `f1`, call `f1(0)`. */
const CALL_F1 = 'import { f1 } from "./lib1.thetalib"\nlet r = f1(0)\nr\n';

/**
 * N libs `lib1..libN`: `libI.fI(x) = f(I+1)(x)` imported from `lib(I+1)`, and
 * `libN.fN(x) = x + N`. Every hop is cross-file, so the chain holds exactly N
 * countable frames per INV-4. `f1(0)` therefore computes N and touches N
 * countable frames.
 */
function libChain(n: number): Record<string, string> {
  const libs: Record<string, string> = {};
  for (let i = 1; i <= n; i++) {
    libs[`/proj/lib${i}.thetalib`] =
      i < n
        ? [
            `import { f${i + 1} } from "./lib${i + 1}.thetalib"`,
            `fn f${i}(x: integer): integer {`,
            `  f${i + 1}(x)`,
            `}`,
            "",
          ].join("\n")
        : [`fn f${i}(x: integer): integer {`, `  x + ${i}`, `}`, ""].join("\n");
  }
  return libs;
}

/**
 * Every runtime cell shares this precondition: the importing theta parses clean
 * and the load pass reports nothing (a well-formed `.thetalib` import IS legal
 * input at every gate — the bug doc §Reproduction measured `load diagnostics:
 * []`). Asserted BEFORE the runtime value so a load regression reds as an unmet
 * precondition, not as the missing-count defect under test.
 */
function expectCleanLoad(row: Measured, label: string, expectedMaterialised: string[]): void {
  expect(row.appParseCodes, `${label}: the importing file parses clean`).toEqual([]);
  expect(
    row.diagLines,
    `${label}: a well-formed \`.thetalib\` import is legal at every static gate; the load pass must report nothing (bug doc §Reproduction: \`load diagnostics: []\`)`,
  ).toEqual([]);
  expect(
    row.materialised,
    `${label}: imports.md §Visibility auto-exports a top-level \`fn\`, so the imported symbol materialises under its local name`,
  ).toEqual(expectedMaterialised);
}

describe("bug 0354 — cross-file `.thetalib` `fn` frames are uncounted against ceiling #1 (INV-4)", () => {
  // ===================================================================
  // Row 1 — a >32-deep cross-file `fn` chain must panic (the primary bug).
  // ===================================================================

  it("row1 breach RED (want panic 33 > 32): a 40-deep cross-file `fn` chain — the bug doc §Reproduction case", async () => {
    // Bug doc §Reproduction verbatim: forty `.thetalib` files, every hop
    // cross-file, `f1(0)` binds and returns 40 with `load diagnostics: []` and
    // NO panic. INV-4 prescribes a push to depth 33 at the 33rd frame — the
    // panic `invoke chain depth exceeded: 33 > 32`. RED at the fork (completes
    // `value: 40`); GREEN once the fix wires `thetalibFnFrameKind` /
    // `pushCountableFrame` into `evalUserFnCall`.
    const row = await measure(CALL_F1, libChain(40));
    expectCleanLoad(row, "row1/N=40", ["fn f1"]);
    expect(
      row.runtime,
      "INV-4: a 40-deep cross-file `fn` chain pushes past depth 32 and must panic `invoke chain depth exceeded: 33 > 32`, not complete `value: 40`",
    ).toEqual(BREACH_THROW);
  });

  it("row1 breach RED (want panic 33 > 32): the minimal 33-deep cross-file `fn` chain", async () => {
    // The minimal breach: N=33 pushes the 33rd frame from depth 0. RED at the
    // fork (completes `value: 33`); GREEN post-fix (panic at the 33rd push).
    const row = await measure(CALL_F1, libChain(33));
    expectCleanLoad(row, "row1/N=33", ["fn f1"]);
    expect(
      row.runtime,
      "INV-4: the 33rd countable cross-file `fn` frame breaches the cap of 32",
    ).toEqual(BREACH_THROW);
  });

  // ===================================================================
  // Row 2 — the 32-deep boundary completes (no over-count).
  // ===================================================================

  it("row2 boundary GREEN (value 32): a 32-deep cross-file `fn` chain sits exactly at the cap and completes", async () => {
    // N=32 pushes exactly 32 countable frames (depths 1..32, the legal range) —
    // the cap is 32, breached only at a push reaching 33. Completes `value: 32`
    // at the fork AND post-fix; its GREEN both ways fences the fix against
    // over-counting (a fix that panicked here would count a legal 32nd frame as
    // the 33rd).
    const row = await measure(CALL_F1, libChain(32));
    expectCleanLoad(row, "row2/N=32", ["fn f1"]);
    expect(
      row.runtime,
      "INV-4: 32 countable frames sit exactly at the cap; the chain completes `value: 32` and must NOT panic",
    ).toEqual({ outcome: "value", value: 32 });
  });

  // ===================================================================
  // Row 3 — an intra-file recursive `fn` is NOT countable (control).
  // ===================================================================

  it("row3 intra-file control GREEN (value 0): a deep self-recursive intra-file `fn` is uncounted even with the chain seeded at the cap", async () => {
    // INV-4 §Non-goals: an intra-file `fn` call (caller and callee in the SAME
    // source file) is deliberately uncounted — its exhaustion rides NOCEIL-3/-4's
    // host `RangeError` arm, not the invoke-chain cap. The app declares a
    // self-recursive `fn` and recurses ~40 deep; even with the chain SEEDED at
    // depth 32 (`thetalibFnFrameKind` returns `undefined` for an intra-file
    // call: `moduleEnv` is undefined for a same-file `fn`, so no frame is
    // pushed), the run completes `value: 0`. GREEN at the fork AND post-fix —
    // the fix must not start counting intra-file recursion.
    const row = await measure(
      [
        "fn rec(x: integer): integer {",
        "  if x <= 0 {",
        "    return 0",
        "  }",
        "  rec(x - 1)",
        "}",
        "let r = rec(40)",
        "r",
        "",
      ].join("\n"),
      {},
      32,
    );
    expectCleanLoad(row, "row3/intra-file", []);
    expect(
      row.runtime,
      "INV-4 §Non-goals: an intra-file recursive `fn` is not a countable frame; a 40-deep intra-file recursion completes even with the chain at the cap",
    ).toEqual({ outcome: "value", value: 0 });
  });

  // ===================================================================
  // Row 4 — a mixed invoke+cross-file chain counts the SUM.
  // ===================================================================

  it("row4 mixed-sum RED (want panic 33 > 32): 30 seeded frames + a 5-hop cross-file `fn` chain breaches at the hop reaching 33", async () => {
    // bug doc §Why it matters (3): an invoke chain legitimately at depth 30 that
    // descends through cross-file lib helpers holds 30 + hops countable frames;
    // the 3rd cross-file hop brings the count to 33 and must panic. The seed
    // (`subagentInboundInvokeDepth: 30`) stands in for the 30 real invoke frames
    // — the SAME per-chain counter. RED at the fork (completes `value: 5`);
    // GREEN post-fix (panic at the hop reaching depth 33).
    const row = await measure(CALL_F1, libChain(5), 30);
    expectCleanLoad(row, "row4/mixed-breach", ["fn f1"]);
    expect(
      row.runtime,
      "INV-4: 30 invoke frames + cross-file `fn` hops share ONE per-chain counter; the hop reaching depth 33 must panic, not complete `value: 5`",
    ).toEqual(BREACH_THROW);
  });

  it("row4 mixed-boundary GREEN (value 2): 30 seeded frames + a 2-hop cross-file chain sits at 32 and completes", async () => {
    // The boundary control for the sum: 30 + 2 = 32 sits exactly at the cap.
    // Completes `value: 2` at the fork AND post-fix — proves the mixed count is
    // the exact sum, not an over-count.
    const row = await measure(CALL_F1, libChain(2), 30);
    expectCleanLoad(row, "row4/mixed-boundary", ["fn f1"]);
    expect(
      row.runtime,
      "INV-4: 30 + 2 = 32 countable frames sit exactly at the cap; the mixed chain completes `value: 2`",
    ).toEqual({ outcome: "value", value: 2 });
  });

  // ===================================================================
  // Row 5 — residence follows the DECLARATION through a re-export.
  // ===================================================================

  it("row5 re-export residence RED (want panic 33 > 32): a single call to a re-exported `fn` is cross-file by the DECLARING file", async () => {
    // imports.md §Re-exports: `reexporter.thetalib` re-exports `leaf` from
    // `decl.thetalib` with `export { leaf } from "./decl.thetalib"` (creating no
    // local binding). The app imports `leaf` from the RE-EXPORTER, but INV-4's
    // residence test is the DECLARATION site — `decl.thetalib`, not the
    // re-exporter — so the call from `app.theta` is cross-file. Seeded at depth
    // 32, the single cross-file push reaches 33 and must panic. RED at the fork
    // (completes `value: 1`); GREEN post-fix. Witnesses that residence follows
    // the declaration (the fix reads it off the `moduleEnv` file stamp — the
    // 0303 declaring-module carrier minted per DECLARING module), not the
    // re-exporter an import record might name.
    const row = await measure(
      'import { leaf } from "./reexporter.thetalib"\nlet r = leaf(0)\nr\n',
      {
        "/proj/decl.thetalib": ["fn leaf(x: integer): integer {", "  x + 1", "}", ""].join("\n"),
        "/proj/reexporter.thetalib": ['export { leaf } from "./decl.thetalib"', ""].join("\n"),
      },
      32,
    );
    expectCleanLoad(row, "row5/re-export", ["fn leaf"]);
    expect(
      row.runtime,
      "INV-4: `leaf` resides in `decl.thetalib`; the call from `app.theta` is cross-file regardless of the re-exporter, so at seed 32 the push to 33 must panic",
    ).toEqual(BREACH_THROW);
  });

  it("row5 re-export control GREEN (value 1): the same seed + an intra-file app `fn` completes (residence equal)", async () => {
    // The residence control: seeded at depth 32, an INTRA-file app `fn` call is
    // not cross-file (its residence equals the caller's file, `thetalibFnFrameKind`
    // returns `undefined`), so no frame pushes and the run completes `value: 1`.
    // GREEN at the fork AND post-fix — the fix pushes only for cross-file
    // residence, never for a same-file call at the same seed.
    const row = await measure(
      ["fn appfn(x: integer): integer {", "  x + 1", "}", "let r = appfn(0)", "r", ""].join("\n"),
      {},
      32,
    );
    expectCleanLoad(row, "row5/re-export-control", []);
    expect(
      row.runtime,
      "INV-4: an intra-file app `fn` shares the caller's residence, so it is uncounted even seeded at the cap; completes `value: 1`",
    ).toEqual({ outcome: "value", value: 1 });
  });

  // ===================================================================
  // Row 6 — the pure-host twin (`evaluatePureFnCall`) counts too.
  // ===================================================================

  it("row6 pure-host RED (want panic 33 > 32): a cross-file `fn` call in a query-template interpolation breaches during render", async () => {
    // §Fix constraint 2 / adjudication C: the cross-file `fn` frame class is
    // reachable on BOTH executor paths. The async path is `evalUserFnCall`
    // (rows 1-5); the PURE-HOST path is `evaluatePureFnCall`
    // (`src/extension/production-theta-producer.ts:7356`), reached ONLY through
    // `host.evaluatePure` — a query-template interpolation or an invoke-arg
    // position — NOT through binary/ternary/member/index (those decompose on
    // the async executor). A bare imported `fn` call in an interpolation routes
    // to `evaluatePureFnCall` with the DECLARING `moduleEnv` as `bodyRoot`
    // (production-theta-producer.ts:7249-7262, the same `resolution.arm ===
    // "import"` branch the fix instruments), so it is the cross-file frame the
    // pure twin must also count.
    //
    // WHY THE ASSERTED PANIC IS THE WITNESS (a fully clean offline value
    // contrast is unreachable with this harness, and this is NOT a weakening):
    // seeded at depth 32, the interpolation `${vf(0)}` renders during
    // `renderQueryText`, called inside the production `resolveQuery` closure
    // (production-theta-producer.ts:1902) BEFORE `#resolvePromptQuery` builds
    // any dispatch and long before any model turn. Post-fix, `evaluatePureFnCall`
    // pushes the 33rd frame there and throws `InvokeDepthExceededPanic`, which
    // propagates out of the un-try/caught `runQueryEffect`
    // (effectful-statement-host.ts:236 → :598) to the `executeBody` rejection —
    // the model DRIVE is never reached. AT THE FORK the render completes with NO
    // count and execution proceeds INTO the query drive machinery, which trips a
    // stubbed offline-harness seam (`pi.on` / `root.clock.wallNow` — this
    // provider-free harness stubs `pi` and `root.clock`); that post-render throw
    // is a DIFFERENT value, so this cell reds. The RED is the symptom — no
    // `InvokeDepthExceededPanic` fires during interpolation render, i.e. the
    // pure host does not count — not an unrelated error: the harness seam is
    // reached ONLY because the render already completed uncounted, which is
    // exactly the defect. Post-fix the panic pre-empts that seam entirely.
    const row = await measure(
      ['import { vf } from "./vlib.thetalib"', "let r = @`value ${vf(0)}`", "r", ""].join("\n"),
      { "/proj/vlib.thetalib": ["fn vf(x: integer): integer {", "  x + 1", "}", ""].join("\n") },
      32,
    );
    expectCleanLoad(row, "row6/pure-host", ["fn vf"]);
    expect(
      row.runtime,
      "INV-4 / adjudication C: the pure-host `evaluatePureFnCall` must count the cross-file `fn` frame; seeded at 32, the interpolation render must panic `invoke chain depth exceeded: 33 > 32` before any query drive",
    ).toEqual(BREACH_THROW);
  });

  // ===================================================================
  // Row 7 — the two untouched production push-site classes still breach.
  // ===================================================================

  it("row7 byte-identical controls GREEN: the direct-invoke and subagent-fn push classes still fire the identical registered panic", async () => {
    // The fix touches neither production `pushCountableFrame` call site — the
    // `"direct-invoke"` site (production-theta-producer.ts, `#buildInvokeChild`,
    // also serving `.theta`-via-`tools:` callables) nor the `"subagent-fn"` site
    // (`#spawnSubagentFnSession`). Their arithmetic is unchanged: seeded at the
    // cap, a push of EITHER class breaches with the identical registered message
    // `invoke chain depth exceeded: 33 > 32`. `pushCountableFrame` ignores its
    // `kind` for the increment (`void kind`, invoke-depth-cycle.ts:175), so all
    // four classes share one counter — this cell pins that both untouched
    // classes still breach identically. GREEN at the fork AND post-fix.
    //
    // The production push-SITE wiring for these two classes is pinned by
    // tests/invoke-depth-cycle.test.ts (the depth-cap arithmetic and the
    // cross-file classifier's return values) — UNCHANGED functions, no flip.
    // This cell adds the minimal by-class breach fixture over the primitive.
    for (const kind of ["direct-invoke", "subagent-fn"] as const) {
      let thrown: unknown;
      try {
        pushCountableFrame(newInvokeChainAtDepth(32), kind);
      } catch (e: unknown) {
        thrown = e;
      }
      expect(
        thrown,
        `INV-4: pushing a ${kind} frame from depth 32 breaches the cap (InvokeDepthExceededPanic)`,
      ).toBeInstanceOf(InvokeDepthExceededPanic);
      expect(
        (thrown as InvokeDepthExceededPanic).message,
        `INV-4: the ${kind} breach renders the identical registered message`,
      ).toBe("invoke chain depth exceeded: 33 > 32");
    }
  });
});
