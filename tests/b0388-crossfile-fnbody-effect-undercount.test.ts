import {
  bindImportedBody,
  fakeThetaLibFs,
  parseImportingApp as parseApp,
} from "./helpers/thetalib-load-harness";
import { describe, expect, it } from "vitest";
import type {
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { checkThetaImports } from "../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  InvokeDepthExceededPanic,
  newInvokeChainAtDepth,
  pushCountableFrame,
} from "../src/runtime/invoke-depth-cycle";
import { executeBody } from "../src/runtime/statement-executor";
import { SUBAGENT_INVOKE_DEPTH_ENV, type SpawnFn } from "../src/runtime/subagent-launcher";
import { isEnumValue, schemaTagOf, type ThetaValue } from "../src/runtime/value";
import { parseDeps } from "./helpers/e2e-s1";
import { fakeExecutableHost, makeFakeJsonChildLauncher, type FakeJsonChild, type SpawnRecord } from "./helpers/fake-json-child";
import { childRegimeRootDouble, driveSubagentFnEntry } from "./helpers/subagent-fn-child-regime";

// Bug 0388 — an effect (a `@`-query render, an `invoke`, a `subagent fn` call)
// dispatched from INSIDE a cross-file `.thetalib` `fn` body counts against the
// BIND-LEVEL invoke chain, not the executor-accumulated
// `ExecuteBodyDeps.invokeChain`, so the fn-frame segment between bind and
// dispatch vanishes from INV-4's count. This is the reverse of bug 0354
// (fixed, 0.386.0): 0354 wired cross-file `fn` frames onto the executor path and
// the pure-host render path, but the render/effect resolvers are closures
// minted at BIND time over the bind-level chain
// (production-theta-producer.ts:1869 mints `const chain = bindInput.chain ??
// newInvokeChainAtDepth(this.#input.subagentInboundInvokeDepth ?? 0)`, closed
// over by `resolveQuery` at :1928 which renders interpolations via
// `renderQueryText(expr, env, chain)` at :1946, and the subagent twin at
// :2093). The executor accumulates cross-file fn frames into
// `bodyDeps.invokeChain` (statement-executor.ts:490-496, the 0354 fix) but
// that accumulated chain never reaches the bind-scope effect closures, so an
// effect reached from inside a fn body counts from the chain as it stood at
// bind, discarding the fn segment. 0354 §Fix Residual 1 named this exact
// direction, bounded it, and flagged it for the parent; this file is the
// mechanical witness.
//
// THE ORACLE (bug doc §Expected behaviour, docs/spec_topics/invocation.md:87,
// the paragraph under §INV-4 at :85): "Depth is the count of *countable
// frames* on the active call chain, where a countable frame is any direct
// `invoke(...)` call, any `.theta` callable call dispatched through a `tools:`
// entry, any cross-file `.thetalib` `fn` call, or any `subagent fn` call …
// The cap is breached when the runtime is about to push a frame that would
// bring the count to 33 … The counter is incremented before the child frame
// begins executing." There is ONE per-chain count over the ACTIVE call chain,
// not per-segment counts stitched at bind boundaries. The active chain in R1
// carries 33 countable frames; the `vf` push must panic.
//
// R1 vs R1-control — SAME 33-frame arithmetic, two routes to the 33rd frame:
//   seed 31 + cross-file frame 32 + cross-file frame 33 → INV-4 panic
//   `invoke chain depth exceeded: 33 > 32` at the push reaching 33.
//   • R1        reaches frame 33 through a `@`-query render (`${vf(0)}`) inside
//     the cross-file fn body `outer`. The render dispatches via the bind-scope
//     `resolveQuery`/`renderQueryText` closures, which see only the bind-level
//     chain (seed 31 → 32) — the `outer` fn frame is invisible to them, so the
//     render completes UNCOUNTED and no panic fires. This is the defect.
//   • R1-control reaches frame 33 through executor fn→fn dispatch
//     (`app→lib1→lib2`, `libChain(2)` seeded at 31). That path threads the
//     executor-accumulated `invokeChain` (the 0354 fix), so the 33rd push
//     panics. This proves the 33-frame arithmetic and the harness are sound —
//     the ONLY difference from R1 is the ROUTE to the 33rd frame.
//
// R2 — the `subagent fn` direction. Under RFC 0012 §10 a `subagent fn` body
// runs in a CHILD process of the calling theta, so the one active chain
// crosses a process hop: the parent pushes the countable `subagent-fn` frame
// at the call and marshals the pushed depth (`PI_THETA_SUBAGENT_INVOKE_DEPTH`);
// the child seeds its root chain at that depth and the body's render pushes
// the cross-file `vf` from there. R2 is therefore two cells over the same
// 33 > 32 arithmetic: the parent half (a fake spawn records the launch env;
// at cap, the push itself breaches at the call and FN-6 downgrades it) and
// the child half (`driveSubagentFnEntry` seeded at the marshalled 32; the
// render's `vf` push breaches and the envelope carries the minted panic).
//
// TIER: **unit**, offline, deterministic, provider-free. Every cell settles
// inside one `parseThetaDocument` over a string, one real `checkThetaImports`
// over an in-memory `FileSystem` double, and one `executeBody` bound through
// `createProductionProducerDeps(...).bindPromptConversation` — the committed
// tests/b0354-crossfile-fn-depth-uncounted.test.ts `measure()` harness, with
// the chain seeded via `subagentInboundInvokeDepth` (R2's parent half adds a
// fake `SpawnFn`; its child half composes the producer as the child). The
// counting the bug omits happens theta-side, at frame-push time (or its
// absence), BEFORE any model participates: R1's render breach — post-fix —
// fires DURING `renderQueryText`, before the query drive. An integration or
// live tier would add a provider to a decision no model touches.
//
// NO SILENT SKIPPING: each cell asserts the clean-load precondition
// (`expectCleanLoad`: parse clean, `load diagnostics: []`, the imported symbol
// materialised) BEFORE the runtime observable, so a load regression reds as an
// unmet precondition rather than masquerading as the undercount defect. No
// cell early-returns.
//
// `0.386.0` is a literal version placeholder — the lane parent fills the real
// version.

/**
 * The observable of one runtime row: the settled final value with its schema
 * brand and enum brand, or the thrown error's `name: message`. A throw is
 * captured as a VALUE (not allowed to escape) so a row is comparable with one
 * `toEqual` and the red prints both sides. The b0354 harness shape.
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
  /** R2 only: every `subagent fn` child launch the parent made (RFC 0012 §10). */
  readonly spawns: readonly SpawnRecord[];
}

/**
 * R2's parent-side substrate: a `subagent fn` call is a CHILD launch of the
 * calling theta (RFC 0012 §10), so the row composes the producer over a fake
 * spawn whose child answers every launch with the `Ok(7)` envelope the body
 * would have produced, and records the launch env. The clock the launcher's
 * teardown reads comes from the child-regime root double.
 */
interface LaunchSubstrate {
  readonly spawn: SpawnFn;
  readonly spawns: SpawnRecord[];
}

function launchSubstrate(): LaunchSubstrate {
  const launcher = makeFakeJsonChildLauncher();
  const spawn: SpawnFn = (execPath, args, options) => {
    const child = launcher.spawn(execPath, args, options) as FakeJsonChild;
    // A macrotask, so the reply lands after the drive has subscribed.
    setTimeout(() => child.emitOkEnvelope(7), 0);
    return child;
  };
  return { spawn, spawns: launcher.spawns };
}

/**
 * Parse `/proj/app.theta`, run the real `checkThetaImports` over `libs`, then
 * run the real `executeBody` with whatever the load pass materialised — the
 * shared `bindImportedBody` harness (tests/helpers/thetalib-load-harness.ts),
 * seeding the top-level chain via
 * `subagentInboundInvokeDepth` (the b0354-established proxy for real invoke
 * frames — the SAME per-chain counter, bug 0388 doc §Reproduction).
 *
 * `resolvePiTool` resolves ANY name to an "AMBIENT" sentinel and the callable
 * set is a frozen empty snapshot, so no cross-file `fn` here is mistaken for a
 * host tool. `modelRegistry.getAvailable` returns one fixture model. `pi` and
 * `root.clock` are STUBBED (empty object / omitted): R1's query DRIVE — reached
 * ONLY at the fork, because the render completed uncounted — throws a TypeError
 * out of that stubbed seam, and that different-value throw is R1's red symptom.
 */
async function measure(
  appBody: string,
  libs: Record<string, string>,
  subagentInboundInvokeDepth?: number,
  launch?: LaunchSubstrate,
): Promise<Measured> {
  const { app, check, binding } = await bindImportedBody(
    appBody,
    libs,
    {
      getAvailable: (): unknown[] => [
        { id: "claude-sonnet-5", provider: "anthropic", displayName: "sonnet" },
      ],
    } as unknown as ModelRegistry,
    subagentInboundInvokeDepth,
    launch !== undefined
      ? {
          root: childRegimeRootDouble(),
          subagentSpawn: launch.spawn,
          subagentExecutableHost: fakeExecutableHost(),
          subagentParentEnv: {},
          subagentParentPid: 4242,
          ctx: {
            model: { id: "claude-sonnet-5", provider: "anthropic", displayName: "sonnet" },
            cwd: "/proj",
            signal: undefined,
            sessionManager: { getEntries: () => [], getLeafId: () => undefined },
          } as unknown as ExtensionCommandContext,
        }
      : {},
  );
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
    spawns: launch?.spawns ?? [],
  };
}

/**
 * The registered breach observable: a top-level `InvokeDepthExceededPanic`
 * (`src/runtime/runtime-panics.ts` mints the name and the message `invoke
 * chain depth exceeded: <nextDepth> > 32`) captured by the harness as
 * `{outcome:"throw", value:"<name>: <message>"}`. The panic is a `ThetaPanic`;
 * at the top level it propagates out of `executeBody` and the harness's
 * rejection arm frames it here.
 */
const BREACH_THROW: RuntimeOutcome = {
  outcome: "throw",
  value: "InvokeDepthExceededPanic: invoke chain depth exceeded: 33 > 32",
};

/**
 * The SAME 33 > 32 breach, but at a `subagent fn` CALL. FN-6 (invocation.md
 * §Failures / ERR-20 boundary) downgrades a breach at the subagent boundary —
 * the push of the `subagent-fn` frame itself — to the caller's
 * `Err(InvokeInfraError{cause:"panic"})` rather than crashing the caller, so the
 * breach surfaces as a settled Err VALUE carrying the `invoke chain depth
 * exceeded: 33 > 32` message, not as a top-level throw (the nested
 * `surfaceDepthOverflow` arm of the parent's `subagent fn` child, RFC 0012
 * §10). The Err is neither schema-tagged nor enum-branded, so the harness
 * records only `outcome`/`value`. A top-level `InvokeDepthExceededPanic` throw
 * is unreachable for any subagent-fn path because the boundary catches it.
 */
const BREACH_DOWNGRADED_ERR: RuntimeOutcome = {
  outcome: "value",
  value: {
    error: {
      callee_path: "s",
      cause: "panic",
      kind: "invoke_infra",
      message: "invoke chain depth exceeded: 33 > 32",
    },
    ok: false,
  },
};

/** The app body the cross-file `fn`-chain control shares: import `f1`, call `f1(0)`. */
const CALL_F1 = 'import { f1 } from "./lib1.thetalib"\nlet r = f1(0)\nr\n';

/**
 * N libs `lib1..libN`: `libI.fI(x) = f(I+1)(x)` imported from `lib(I+1)`, and
 * `libN.fN(x) = x + N`. Every hop is cross-file, so the chain holds exactly N
 * countable frames per INV-4. `f1(0)` therefore computes N and touches N
 * countable frames — all via executor fn→fn dispatch (the counted lane).
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
 * precondition, not as the undercount defect under test.
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

describe("bug 0388 — an effect dispatched from inside a cross-file `fn` body undercounts against INV-4", () => {
  // ===================================================================
  // R1 — the primary defect: a render inside a cross-file fn body is
  // counted from the bind-level chain, not the active (executor) chain.
  // ===================================================================

  it("R1 undercount RED (want panic 33 > 32): a `@`-query render inside cross-file `outer`'s body counts from the bind-level chain, not the active one", async () => {
    // Fixtures (bug doc §Reproduction): `app` imports `outer` from
    // `olib.thetalib`; `olib` imports `vf` from `vlib.thetalib`; `outer`'s body
    // renders `@`value ${vf(0)}`` then returns `7`; `vf(x) = x + 1`. Seeded at
    // 31: `app→outer` is cross-file frame 32 (at cap, legal), and the render's
    // `olib→vf` is cross-file frame 33 on the ACTIVE chain. INV-4 prescribes a
    // panic `invoke chain depth exceeded: 33 > 32` DURING interpolation render,
    // before any drive.
    //
    // AT THE FORK this REDS with a DIFFERENT value: the render dispatches via
    // the bind-scope `resolveQuery`/`renderQueryText` closures
    // (production-theta-producer.ts:1928/:1946), which see only the bind-level
    // chain (seed 31 → `outer` push counted on the EXECUTOR lane, invisible
    // here → render pushes `vf` from the STALE bind value 31→32, no breach).
    // The render therefore completes UNCOUNTED and execution proceeds INTO the
    // query DRIVE machinery, which trips this provider-free harness's stubbed
    // `pi` seam (`pi.on` is not a function; `pi` is `{}`) and throws a
    // TypeError. That post-render throw IS
    // the symptom — the render completed uncounted, so no `InvokeDepthExceededPanic`
    // fired during render. Post-fix (thread the executor `invokeChain` into
    // effect dispatch) the panic pre-empts that seam entirely and this goes
    // green.
    //
    // PINNED FORK THROW (the ACTUAL value R1 produces at fork, offline harness):
    //   "TypeError: pi.on is not a function"
    // — the render completed uncounted, so execution fell into the query-drive
    // machinery and tripped the stubbed `pi` seam (bug doc §Reproduction R1 row).
    const row = await measure(
      [
        'import { outer } from "./olib.thetalib"',
        "let r = outer()",
        "r",
        "",
      ].join("\n"),
      {
        "/proj/olib.thetalib": [
          'import { vf } from "./vlib.thetalib"',
          "fn outer(): integer {",
          "  let q = @`value ${vf(0)}`",
          "  7",
          "}",
          "",
        ].join("\n"),
        "/proj/vlib.thetalib": [
          "fn vf(x: integer): integer {",
          "  x + 1",
          "}",
          "",
        ].join("\n"),
      },
      31,
    );
    expectCleanLoad(row, "R1", ["fn outer"]);
    expect(
      row.runtime,
      "INV-4 (invocation.md:87): the active chain in `outer`'s body carries 33 countable frames (31 seed + `outer` + `vf`); the render's `vf` push must panic `invoke chain depth exceeded: 33 > 32`, not render uncounted from the stale bind-level chain and fall into the query drive",
    ).toEqual(BREACH_THROW);
  });

  // ===================================================================
  // R1-control — the counted executor fn→fn direction (0354's fix).
  // ===================================================================

  it("R1-control GREEN (panic 33 > 32): the SAME 33-frame arithmetic reached through executor fn→fn dispatch already counts", async () => {
    // Same arithmetic as R1: seed 31 + `app→lib1` (32) + `lib1→lib2` (33). Here
    // the 33rd frame is reached through executor fn→fn dispatch, which threads
    // the executor-accumulated `invokeChain` (statement-executor.ts:490-496, the
    // 0354 fix), so the 33rd push panics. This proves the 33-frame arithmetic
    // and the harness are sound; the ONLY difference from R1 is the ROUTE to the
    // 33rd frame (executor fn→fn here vs a render inside a fn body in R1). GREEN
    // at the fork AND post-fix — the counted direction is behaviour-pinned by
    // the b0354 witness and must stay green.
    const row = await measure(CALL_F1, libChain(2), 31);
    expectCleanLoad(row, "R1-control", ["fn f1"]);
    expect(
      row.runtime,
      "INV-4: seed 31 + two cross-file executor fn→fn frames reach depth 33; the 33rd push panics via the executor lane the 0354 fix wired",
    ).toEqual(BREACH_THROW);
  });

  // ===================================================================
  // R2 — the subagent-fn-body direction: a render inside a `subagent fn`
  // body must count the subagent-fn frame on the ACTIVE chain, not drop it.
  //
  // Under RFC 0012 §10 the body runs in a CHILD process of the calling theta,
  // so the one active chain is split across the process hop: the PARENT pushes
  // the countable `subagent-fn` frame at the call (D → D+1) and marshals D+1
  // as `PI_THETA_SUBAGENT_INVOKE_DEPTH`; the CHILD seeds its root chain at D+1
  // and the body's render pushes the cross-file `vf` from there. The two cells
  // below witness each half against the same 33 > 32 arithmetic.
  // ===================================================================

  /** The R2 app body: `s`'s render calls the cross-file `vf`, then `s` returns 7. */
  const R2_APP = [
    'import { vf } from "./vlib.thetalib"',
    // No `): integer` return annotation: a `let q = @`...`` query followed
    // by a `7` tail infers the subagent fn's Ok payload as `null` (a
    // static-inference quirk of a query-then-tail body), which the
    // `subagent fn` return-annotation check (reusing the `invoke<Schema>`
    // typed-return machinery) flags as `invoke-return-type-mismatch`.
    // Omitting the annotation loads clean and leaves the countable frames
    // — the subagent-fn frame and the render's cross-file `vf` — unchanged.
    "subagent fn s() {",
    "  let q = @`value ${vf(0)}`",
    "  7",
    "}",
    "let r = s()",
    "r",
    "",
  ].join("\n");
  const R2_LIBS = {
    "/proj/vlib.thetalib": [
      "fn vf(x: integer): integer {",
      "  x + 1",
      "}",
      "",
    ].join("\n"),
  };

  it("R2 parent half (want depth 32 marshalled; want panic 33 > 32 at cap): the `subagent fn` call pushes its frame on the ACTIVE chain and hands the pushed depth to the child", async () => {
    // Seed 31: the call pushes `subagent-fn` (frame 32, at cap, legal) and the
    // child launch carries 32 — the depth the child's own chain seeds at, so
    // the body's cross-file `vf` push there is frame 33 (the child half below).
    // Had the parent marshalled the STALE seed (31), the child would push `vf`
    // to 32 and the render would complete UNCOUNTED — the bug 0388 undercount,
    // one process hop over.
    const launched = launchSubstrate();
    const row = await measure(R2_APP, R2_LIBS, 31, launched);
    expectCleanLoad(row, "R2 parent (seed 31)", ["fn vf"]);
    expect(row.spawns, "the `subagent fn` call launches exactly one child of the calling theta").toHaveLength(1);
    expect(
      row.spawns[0]!.env[SUBAGENT_INVOKE_DEPTH_ENV],
      "INV-4 across the hop: the child seeds at the seed + the pushed `subagent-fn` frame = 32",
    ).toBe("32");
    expect(row.runtime, "the child's `Ok(7)` envelope is the call's value").toEqual({ outcome: "value", value: 7 });

    // Seed 32 (at cap): the `subagent-fn` push itself would be frame 33, so the
    // breach fires at the CALL, before any launch; FN-6's boundary downgrades
    // it to the caller's `Err(InvokeInfraError{cause:"panic"})` naming `s`.
    const atCap = launchSubstrate();
    const capRow = await measure(R2_APP, R2_LIBS, 32, atCap);
    expectCleanLoad(capRow, "R2 parent (seed 32)", ["fn vf"]);
    expect(capRow.spawns, "a breach at the push launches no child").toHaveLength(0);
    expect(
      capRow.runtime,
      "INV-4: the `subagent-fn` push from 32 reaches 33 and breaches at the call; the FN-6 boundary downgrades it to Err(InvokeInfraError{cause:'panic'})",
    ).toEqual(BREACH_DOWNGRADED_ERR);
  });

  it("R2 child half (want panic 33 > 32): seeded at the marshalled 32, the body's `@`-query render pushes the cross-file `vf` to 33 and the child's envelope carries the breach", async () => {
    // The child re-composes `app.theta` (imports materialised through the same
    // load pass), resolves `s` off the `fn` launch entry and runs the body
    // against a root chain seeded at the marshalled 32. The render's
    // cross-file `vf` push is frame 33 → `invoke chain depth exceeded: 33 > 32`
    // DURING interpolation render, before any drive. Inside the child the
    // breach is a `ThetaPanic` out of `executeBody`, which the fn-entry drive
    // routes as the envelope's minted `invoke_infra{cause:"panic"}` — the
    // parent then surfaces it bare (a boundary mint), the same Err shape the
    // at-cap parent half produces. Had the child seeded at the stale 31, `vf`
    // would push to 32, the render would complete UNCOUNTED and execution would
    // fall into the query-drive machinery and trip this harness's stubbed `pi`
    // seam (`pi.on is not a function`) — a different-value red.
    const app = parseApp(R2_APP);
    expect(app.frontmatter, "the importing theta's frontmatter must parse").not.toBeNull();
    const frontmatter = app.frontmatter as ParsedFrontmatter;
    const check = await checkThetaImports(
      { slashName: "app", sourcePath: "/proj/app.theta", frontmatter, body: app.body },
      { fs: fakeThetaLibFs(R2_LIBS), parseDeps: parseDeps() },
    );
    expect(app.diagnostics.map((d) => d.code), "R2 child: the importing file parses clean").toEqual([]);
    expect(check.diagnostics, "R2 child: the load pass reports nothing").toEqual([]);
    expect(check.imports.map((m) => `${m.kind} ${m.name}`), "R2 child: `vf` materialised").toEqual(["fn vf"]);
    const theta: ThetaCompositionInput = {
      slashName: "app",
      sourcePath: "/proj/app.theta",
      frontmatter,
      body: app.body,
      callableSet: Object.freeze({ entries: new Map() }),
      imports: check.imports,
    } as ThetaCompositionInput;
    const { envelope } = await driveSubagentFnEntry({
      theta,
      slug: "app",
      fnName: "s",
      params: {},
      inboundDepth: 32,
      // PIC-58 model pre-flight: the child confirms the launched model against
      // its registry; the ctx model and the registry entry are the same row.
      ctx: {
        model: { id: "claude-sonnet-5", provider: "anthropic", displayName: "sonnet" },
        cwd: "/proj",
        signal: undefined,
        sessionManager: { getEntries: () => [], getLeafId: () => undefined },
      } as unknown as ExtensionCommandContext,
      modelRegistry: {
        getAvailable: (): unknown[] => [
          { id: "claude-sonnet-5", provider: "anthropic", displayName: "sonnet" },
        ],
      } as unknown as ModelRegistry,
    });
    expect(
      envelope,
      "INV-4: the child's active chain (32 marshalled + the render's cross-file `vf`) reaches 33 during render; the fn-entry drive mints the breach as invoke_infra{cause:'panic'}",
    ).toEqual({
      kind: "err",
      provenance: "mint",
      error: {
        kind: "invoke_infra",
        message: "invoke chain depth exceeded: 33 > 32",
        callee_path: "/proj/app.theta",
        cause: "panic",
      },
    });
  });
});
