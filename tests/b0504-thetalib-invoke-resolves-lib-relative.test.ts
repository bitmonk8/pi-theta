// Bug 0504 — an `invoke(...)` written inside an imported `.thetalib` `fn`
// resolves its callee path against the CALLING theta's directory instead of
// the declaring `.thetalib` file's location
// (`docs/bugs/0504-thetalib-invoke-resolves-caller-relative.md`).
//
// THE ORACLE. `docs/spec_topics/imports.md:17`: "May call `invoke(...)`. The
// path resolves relative to the `.thetalib` file's location; the invocation
// executes against the *calling* `.theta`'s conversation". The PATH base is the
// declaring file; only the conversation anchor follows the caller. A path the
// caller itself writes in its own `.theta` body stays caller-relative.
//
// THE SEAM. Every `invoke(...)` crosses `InvokeMachinery.resolveInvoke`
// (`src/extension/invoke-machinery.ts`), whose two resolution sites take a base:
//   - `#parseCalleeOrErr` hands `parseCallee` its first argument as the base
//     the production `parseCalleeTheta` (`src/extension/production-composition.ts`)
//     joins against (`dirname(baseFile)`); the `parseCallee` double below
//     mirrors that join exactly, so the file it loads is decided by the base
//     the machinery passes — the quantity the bug is about.
//   - `#recheckCalleeContainment` (the INV-1 runtime re-check) resolves the
//     same literal against its own base before `realpath` + containment.
// The executing body's declaring file is already known at that boundary:
// `LexicalEnvironment.currentResidence()` (`src/runtime/lexical-environment.ts`)
// answers the declaring lib's resolved path inside an imported `fn` body, and
// the `subagent fn` regime already reads it with a caller fallback
// (`#subagentFnDeclaringPath`, `src/extension/subagent-spawn-regime.ts`).
//
// THE CELLS (bug doc §Repro arms, re-planted in a per-test OS temp dir):
//   (A)   lib fn invokes `./child.theta`, which exists ONLY beside the lib; the
//         caller sits one directory up. Must load and return the child's value.
//   (A-par) the same lib fn tail-called from a `par for` body, per element.
//   (B)   lib fn invokes `./decoy.theta`, which exists ONLY beside the CALLER.
//         Must NOT resolve (the lib's own directory holds no such file) —
//         `load_failure`, never the caller-side decoy's value.
//   (C1)  CONTROL: caller co-located with the lib — both bases agree.
//   (C2)  CONTROL: the caller's own direct `invoke("./workers/child.theta")`
//         stays caller-relative.
//   (D)   the INV-1 re-check judges the LIB-relative path. Witnessed
//         independently of `parseCallee`: the double here ignores its base and
//         always serves the lib-side child, so only the re-check's own base can
//         decide the outcome. The active root holds the lib and its child; a
//         same-named file sits beside the caller OUTSIDE every root, so a
//         caller-relative re-check reports an escape where the lib-relative one
//         is contained. The recording `realpath` names which path was judged.
//
// TIER: unit, offline, deterministic, provider-free. Every cell runs the real
// parser, the real `checkThetaImports` load pass over the production
// `PiFileSystem` (so `moduleScope.residence` is the real resolved lib path), and
// the real `executeBody` bound through
// `createProductionProducerDeps(...).bindPromptConversation`, whose imported-fn
// activation carries the declaring module env into the body that dispatches the
// invoke. Callees are prompt-mode and query-free, so the prompt→prompt attach
// cell runs them in-process with no provider turn.
//
// (E)   SLSH-5 provenance, through the SHIPPED composition root
//         (`discoverAndComposeFixtures` + `fixture.run`): a lib-body hop whose
//         lib-side child returns `Err` must record its `<callee_path>` as the
//         same canonical file the boundary resolved and ran. The hop ledger
//         (`#recordInvokeHop`, `src/extension/production-theta-producer.ts`)
//         re-resolves a RELATIVE literal against the calling theta, so the
//         invoke boundary hands it the already-resolved absolute path
//         (`InvokeChild.resolvedCalleePath`). (E2) plants a same-named decoy
//         beside the caller: the suffix must never name it.
//
// NOT CELLED HERE, AND WHY:
//   - A SUBAGENT-mode caller. Its body runs in a child process, but that child
//     binds its own conversation through the same `bindPromptConversation` →
//     `InvokeMachinery.resolveInvoke` seam these cells drive, with the same
//     `env.currentResidence()` read, so the unit cells cover the resolution
//     rule. A real-spawn cell would put this file on the default suite's
//     real-child flake exposure (bug 0497); the subagent-caller context runs
//     end-to-end in the verifier's live run instead.
//   - The `tools:`-callable route (`resolveCallAsInvoke`) inside a lib body
//     stays caller-relative by construction: its callee path comes from the
//     CALLING theta's own `tools:` frontmatter list, and a `.thetalib` has no
//     frontmatter in which to declare one, so there is no lib-relative path
//     for that route to resolve.
//
// NO SILENT SKIPPING: each cell asserts the clean-load precondition and the
// declaring residence BEFORE the runtime observable, so a load regression reds
// as an unmet precondition rather than masquerading as the resolution defect.
// The (E) cells fail loudly naming the whole note channel when the dispatch
// did not produce exactly one top-level `Err` note.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { checkThetaImports } from "../src/extension/import-static-checks";
import {
  createProductionProducerDeps,
  type CalleeParseOutcome,
} from "../src/extension/production-theta-producer";
import type { ConversationBindInput, ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument } from "../src/parser/theta-document";
import { executeBody } from "../src/runtime/statement-executor";
import type { RuntimeRoot } from "../src/runtime-root";
import { PiFileSystem } from "../src/seams/pi-file-system";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { noopPi, rootDouble } from "./helpers/call-with-clause-harness";
import { parseDeps } from "./helpers/e2e-s1";
import {
  dispatchTopLevelFixtures,
  errNote,
  hostPi,
  loadCtx,
  type RecordedMessage,
} from "./helpers/fixture-dispatch-harness";
import { ajv } from "./helpers/scripted-live-session-harness";

const PROMPT_FRONTMATTER = "---\nmode: prompt\n---\n";

/** The lib's own child returns this; seeing it proves the lib-side file ran. */
const CHILD_BESIDE_LIB = "CHILD-BESIDE-LIB";
/** The caller-side decoy returns this; seeing it through a lib fn is the wrong-target hazard. */
const DECOY_BESIDE_CALLER = "DECOY-BESIDE-CALLER";

const LIB_SOURCE = [
  "fn via_lib() {",
  '  invoke<string>("./child.theta")',
  "}",
  "fn via_decoy() {",
  '  invoke<string>("./decoy.theta")',
  "}",
  "",
].join("\n");

/** Records every `realpath` the runtime re-check issues, so cell (D) can name the judged path. */
class RecordingFileSystem extends PiFileSystem {
  readonly realpathCalls: string[] = [];

  override realpath(path: string): Promise<string> {
    this.realpathCalls.push(path);
    return super.realpath(path);
  }
}

/** One `parseCallee` call as the machinery issued it. */
interface ParseCall {
  readonly base: string | undefined;
  readonly calleePath: string;
}

/**
 * How the `parseCallee` double locates the callee: `base-relative` joins the
 * literal against `dirname(base)` exactly as `parseCalleeTheta` does;
 * `fixed` ignores the base and always serves one file (cell D isolates the
 * containment re-check that way).
 */
type CalleeLocator = { readonly kind: "base-relative" } | { readonly kind: "fixed"; readonly path: string };

interface Drive {
  readonly appParseCodes: readonly string[];
  readonly loadDiagLines: readonly string[];
  readonly materialised: readonly string[];
  /** Each imported fn's declaring residence, as the load pass stamped it. */
  readonly residences: readonly string[];
  readonly parseCalls: readonly ParseCall[];
  /** `realpath` calls issued during execution only (the load pass's own are excluded). */
  readonly runtimeRealpaths: readonly string[];
  readonly value: unknown;
}

interface DriveInput {
  readonly cwd: string;
  readonly callerPath: string;
  readonly callerBody: string;
  readonly activeRoots: readonly string[];
  readonly locator: CalleeLocator;
}

function callableSetless(input: Omit<ThetaCompositionInput, "callableSet">): ThetaCompositionInput {
  return { ...input, callableSet: Object.freeze({ entries: new Map() }) } as ThetaCompositionInput;
}

function parseCalleeDouble(
  calls: ParseCall[],
  cwd: string,
  locator: CalleeLocator,
): (base: string | undefined, calleePath: string) => Promise<CalleeParseOutcome> {
  return (base, calleePath) => {
    calls.push({ base, calleePath });
    const absolute =
      locator.kind === "fixed"
        ? locator.path
        : isAbsolute(calleePath)
          ? calleePath
          : resolvePath(base !== undefined ? dirname(base) : cwd, calleePath);
    if (!existsSync(absolute)) {
      return Promise.resolve({ kind: "unreadable" });
    }
    const doc = parseThetaDocument({ path: absolute, bytes: readFileSync(absolute) }, parseDeps());
    if (doc.frontmatter === null) {
      throw new Error(`fixture callee ${absolute} must parse: ${JSON.stringify(doc.diagnostics.map((d) => d.code))}`);
    }
    return Promise.resolve({
      kind: "ok",
      input: callableSetless({
        slashName: "callee",
        sourcePath: absolute,
        frontmatter: doc.frontmatter,
        body: doc.body,
      }),
    });
  };
}

/** Parse the caller, run the real load pass, bind the real prompt-mode producer, and execute its body. */
async function drive(input: DriveInput): Promise<Drive> {
  const fs = new RecordingFileSystem(input.cwd);
  const app = parseThetaDocument(
    { path: input.callerPath, bytes: new TextEncoder().encode(PROMPT_FRONTMATTER + input.callerBody) },
    parseDeps(),
  );
  if (app.frontmatter === null) {
    throw new Error(`caller frontmatter must parse: ${JSON.stringify(app.diagnostics.map((d) => d.code))}`);
  }
  const frontmatter: ParsedFrontmatter = app.frontmatter;
  const check = await checkThetaImports(
    { slashName: "caller", sourcePath: input.callerPath, frontmatter, body: app.body },
    { fs, parseDeps: parseDeps() },
  );
  const loadRealpathCount = fs.realpathCalls.length;

  const parseCalls: ParseCall[] = [];
  const deps = createProductionProducerDeps({
    pi: noopPi() as ExtensionAPI,
    // Typed `invoke<string>` validates the child's `Ok` payload through the root's schema validator.
    root: { ...rootDouble(), schemaValidator: ajv() } as unknown as RuntimeRoot,
    modelRegistry: {} as unknown as ModelRegistry,
    parseCallee: parseCalleeDouble(parseCalls, input.cwd, input.locator),
    fileSystem: fs,
    activeRoots: input.activeRoots,
  });
  const theta = callableSetless({
    slashName: "caller",
    sourcePath: input.callerPath,
    frontmatter,
    body: app.body,
    ...(check.imports.length > 0 ? { imports: check.imports } : {}),
  });
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: { cwd: input.cwd, model: { id: "m", provider: "p" } } as unknown as ExtensionCommandContext,
  };
  const execution = await executeBody(app.body, deps.bindPromptConversation(bindInput).executeDeps);

  return {
    appParseCodes: app.diagnostics.map((d) => d.code),
    loadDiagLines: check.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    materialised: check.imports.map((m) => `${m.kind} ${m.name}`),
    residences: check.imports.flatMap((m) => (m.moduleScope !== undefined ? [m.moduleScope.residence] : [])),
    parseCalls,
    runtimeRealpaths: fs.realpathCalls.slice(loadRealpathCount),
    value: execution.result.value === undefined ? undefined : JSON.parse(JSON.stringify(execution.result.value)),
  };
}

/** The workspace every cell plants: caller dir `<theta>`, lib + child in `<theta>/workers`, decoy beside the caller. */
interface Workspace {
  readonly cwd: string;
  readonly thetaDir: string;
  readonly workersDir: string;
  readonly libPath: string;
}

async function withWorkspace(run: (ws: Workspace) => Promise<void>): Promise<void> {
  // The OS temp dir is a symlink on some hosts; planting under its canonical
  // form keeps the re-check's `realpath` output comparable to `activeRoots`.
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "theta-bug0504-")));
  try {
    const thetaDir = join(cwd, ".pi", "theta");
    const workersDir = join(thetaDir, "workers");
    mkdirSync(workersDir, { recursive: true });
    const libPath = join(workersDir, "lib.thetalib");
    writeFileSync(libPath, LIB_SOURCE, "utf8");
    writeFileSync(join(workersDir, "child.theta"), `${PROMPT_FRONTMATTER}"${CHILD_BESIDE_LIB}"\n`, "utf8");
    writeFileSync(join(thetaDir, "decoy.theta"), `${PROMPT_FRONTMATTER}"${DECOY_BESIDE_CALLER}"\n`, "utf8");
    await run({ cwd, thetaDir, workersDir, libPath });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/** Host-native normal form, so a forward-slash residence and a back-slashed join compare equal. */
function norm(path: string | undefined): string | undefined {
  return path === undefined ? undefined : resolvePath(path);
}

function expectCleanLoad(row: Drive, label: string, expectedMaterialised: readonly string[], libPath?: string): void {
  expect(row.appParseCodes, `${label}: the caller parses clean`).toEqual([]);
  expect(row.loadDiagLines, `${label}: a well-formed lib import is legal at every static gate`).toEqual([]);
  expect(row.materialised, `${label}: the imported fn materialises under its local name`).toEqual(expectedMaterialised);
  if (libPath !== undefined) {
    // The declaring residence the fix reads must already be on the activation;
    // without it the invoke boundary has nothing lib-side to resolve against.
    expect(row.residences.map(norm), `${label}: the imported fn carries its declaring lib as residence`).toEqual([
      norm(libPath),
    ]);
  }
}

describe("bug 0504 — an invoke inside an imported .thetalib fn resolves relative to the .thetalib", () => {
  it("(A) a lib-relative callee beside the lib loads and runs for a caller one directory up", async () => {
    await withWorkspace(async (ws) => {
      const row = await drive({
        cwd: ws.cwd,
        callerPath: join(ws.thetaDir, "caller.theta"),
        callerBody: 'import { via_lib } from "./workers/lib.thetalib"\nvia_lib()\n',
        activeRoots: [ws.thetaDir],
        locator: { kind: "base-relative" },
      });
      expectCleanLoad(row, "A", ["fn via_lib"], ws.libPath);

      // imports.md:17 — the path resolves against the `.thetalib`, so the
      // lib-side child runs and its value crosses the typed boundary. The
      // defect resolves against the caller's directory, where no child exists,
      // and mints `invoke callee './child.theta' could not be loaded`.
      expect(row.value, "the lib-side child.theta must load and return its value").toEqual({
        ok: true,
        value: CHILD_BESIDE_LIB,
      });
      expect(
        row.parseCalls.map((call) => ({ base: norm(call.base), calleePath: call.calleePath })),
        "the callee is resolved against the declaring .thetalib, not the calling theta",
      ).toEqual([{ base: norm(ws.libPath), calleePath: "./child.theta" }]);
    });
  });

  it("(A-par) the same lib fn tail-called from a par for body resolves lib-side in every iteration", async () => {
    await withWorkspace(async (ws) => {
      const row = await drive({
        cwd: ws.cwd,
        callerPath: join(ws.thetaDir, "caller.theta"),
        // `match` reduces each element to a string so the per-element shape is
        // the `par for` collection Result alone, readable in one comparison.
        callerBody:
          'import { via_lib } from "./workers/lib.thetalib"\n' +
          "par for x in [1, 2] { match via_lib() { Ok(v) => v, Err(e) => e.message } }\n",
        activeRoots: [ws.thetaDir],
        locator: { kind: "base-relative" },
      });
      expectCleanLoad(row, "A-par", ["fn via_lib"], ws.libPath);

      expect(row.value, "each iteration's lib-side invoke must load the child beside the lib").toEqual([
        { ok: true, value: CHILD_BESIDE_LIB },
        { ok: true, value: CHILD_BESIDE_LIB },
      ]);
      expect(
        row.parseCalls.map((call) => norm(call.base)),
        "every iteration resolves against the declaring .thetalib",
      ).toEqual([norm(ws.libPath), norm(ws.libPath)]);
    });
  });

  it("(B) a callee that exists only beside the CALLER does not resolve through a lib fn", async () => {
    await withWorkspace(async (ws) => {
      const row = await drive({
        cwd: ws.cwd,
        callerPath: join(ws.thetaDir, "caller.theta"),
        callerBody: 'import { via_decoy } from "./workers/lib.thetalib"\nvia_decoy()\n',
        activeRoots: [ws.thetaDir],
        locator: { kind: "base-relative" },
      });
      expectCleanLoad(row, "B", ["fn via_decoy"], ws.libPath);

      // The lib's directory holds no decoy.theta, so the spec-pinned target is
      // absent: the load arm of `#parseCalleeOrErr` (`InvokeMachinery`) mints
      // this exact error. The defect instead loads and runs the caller-side
      // decoy — a silent wrong-target selection by caller location.
      expect(row.value, "a lib-relative path must not select the caller-side decoy").toEqual({
        ok: false,
        error: {
          kind: "invoke_infra",
          message: "invoke callee './decoy.theta' could not be loaded",
          callee_path: "./decoy.theta",
          cause: "load_failure",
        },
      });
      expect(
        row.parseCalls.map((call) => norm(call.base)),
        "the callee is resolved against the declaring .thetalib",
      ).toEqual([norm(ws.libPath)]);
    });
  });

  it("(C1) CONTROL: a caller co-located with the lib loads the lib-side child", async () => {
    await withWorkspace(async (ws) => {
      const row = await drive({
        cwd: ws.cwd,
        callerPath: join(ws.workersDir, "caller.theta"),
        callerBody: 'import { via_lib } from "./lib.thetalib"\nvia_lib()\n',
        activeRoots: [ws.thetaDir],
        locator: { kind: "base-relative" },
      });
      expectCleanLoad(row, "C1", ["fn via_lib"], ws.libPath);

      // Both bases name the same directory here, which is why co-located
      // layouts never expose the defect; this cell must hold either way.
      expect(row.value).toEqual({ ok: true, value: CHILD_BESIDE_LIB });
      expect(row.parseCalls.map((call) => norm(dirname(call.base ?? "")))).toEqual([norm(ws.workersDir)]);
    });
  });

  it("(C2) CONTROL: the caller's own direct invoke stays caller-relative", async () => {
    await withWorkspace(async (ws) => {
      const callerPath = join(ws.thetaDir, "caller.theta");
      const row = await drive({
        cwd: ws.cwd,
        callerPath,
        callerBody: 'invoke<string>("./workers/child.theta")\n',
        activeRoots: [ws.thetaDir],
        locator: { kind: "base-relative" },
      });
      expectCleanLoad(row, "C2", []);

      // A path written in the `.theta` itself has no declaring lib: the
      // executing residence is absent and the base is the caller's own file.
      expect(row.value).toEqual({ ok: true, value: CHILD_BESIDE_LIB });
      expect(row.parseCalls.map((call) => norm(call.base))).toEqual([norm(callerPath)]);
    });
  });

  it("(D) the INV-1 runtime containment re-check judges the lib-relative callee path", async () => {
    await withWorkspace(async (ws) => {
      // Root = the lib's directory only; the caller sits outside every root
      // with a same-named child.theta beside it, so the two candidate bases
      // give opposite containment verdicts.
      const libRoot = join(ws.cwd, "libroot");
      const outside = join(ws.cwd, "outside");
      mkdirSync(libRoot, { recursive: true });
      mkdirSync(outside, { recursive: true });
      const libPath = join(libRoot, "lib.thetalib");
      const libSideChild = join(libRoot, "child.theta");
      const callerSideChild = join(outside, "child.theta");
      writeFileSync(libPath, LIB_SOURCE, "utf8");
      writeFileSync(libSideChild, `${PROMPT_FRONTMATTER}"${CHILD_BESIDE_LIB}"\n`, "utf8");
      writeFileSync(callerSideChild, `${PROMPT_FRONTMATTER}"${DECOY_BESIDE_CALLER}"\n`, "utf8");

      const row = await drive({
        cwd: ws.cwd,
        callerPath: join(outside, "caller.theta"),
        callerBody: 'import { via_lib } from "../libroot/lib.thetalib"\nvia_lib()\n',
        activeRoots: [libRoot],
        // The load seam is pinned to the lib-side file whatever base it is
        // handed, so only the re-check's own base can turn this cell red.
        locator: { kind: "fixed", path: libSideChild },
      });
      expectCleanLoad(row, "D", ["fn via_lib"], libPath);

      // Resolved lib-side, the callee is inside the only root and runs. The
      // defect resolves caller-side, lands outside every root, and the re-check
      // mints `invokePathEscapeMessage` (`src/runtime/invocation.ts`) with the
      // caller-relative resolved path as `callee_path`.
      expect(row.value, "the re-check must judge the lib-relative path, which is contained").toEqual({
        ok: true,
        value: CHILD_BESIDE_LIB,
      });
      const judged = row.runtimeRealpaths.map(norm);
      expect(judged, "the re-check canonicalises the lib-side callee").toContain(norm(libSideChild));
      expect(judged, "the re-check never canonicalises the caller-side spelling").not.toContain(
        norm(callerSideChild),
      );
    });
  });
});

/** SLSH-5's path form: realpath, then forward slashes (`invocation.md:12`, bug 0391). */
function fwd(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Plant the (E) layout under `.pi/theta/`, compose it through the shipped root,
 * dispatch `/caller`, and return its single top-level `Err` note. The lib-side
 * child propagates a missing-callee `invoke_infra`, so the lib-body hop is a
 * callee-returned failure the boundary wraps and records.
 */
async function driveProvenance(withDecoy: boolean): Promise<{ note: string; libChild: string; decoy: string }> {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "theta-bug0504-slsh5-")));
  try {
    const thetaDir = join(cwd, ".pi", "theta");
    const workersDir = join(thetaDir, "workers");
    mkdirSync(workersDir, { recursive: true });
    writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
    writeFileSync(
      join(thetaDir, "caller.theta"),
      `${PROMPT_FRONTMATTER}import { via_lib } from "./workers/lib.thetalib"\nvia_lib()?\n`,
      "utf8",
    );
    writeFileSync(join(workersDir, "lib.thetalib"), 'fn via_lib() {\n  invoke("./child.theta")\n}\n', "utf8");
    const libChild = join(workersDir, "child.theta");
    writeFileSync(libChild, `${PROMPT_FRONTMATTER}invoke("./missing.theta")?\n`, "utf8");
    const decoy = join(thetaDir, "child.theta");
    if (withDecoy) {
      writeFileSync(decoy, `${PROMPT_FRONTMATTER}"${DECOY_BESIDE_CALLER}"\n`, "utf8");
    }
    const notes: RecordedMessage[] = [];
    const pi = hostPi(notes, "a provider turn was issued: no theta in the (E) layout runs an `@`-query");
    const fixtures = await discoverAndComposeFixtures(pi, loadCtx(cwd));
    await dispatchTopLevelFixtures(fixtures, cwd, ["caller"]);
    return { note: errNote(notes, "caller"), libChild, decoy };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/** The leaf row: the lib-side child's own missing-callee `invoke_infra`, unwrapped by the renderer. */
const LEAF_ROW = "theta /caller returned Err: invoke of ./missing.theta failed (load_failure)";

describe("bug 0504 — SLSH-5 provenance of a lib-body invoke hop names the lib-side callee", () => {
  it("(E1) the chain suffix names the canonical lib-side child the boundary ran", async () => {
    const { note, libChild } = await driveProvenance(false);

    // The leaf row proves the lib-side child ran (only it invokes ./missing.theta)
    // and that an `invoke_callee` wrapper crossed the slash boundary.
    expect(note.startsWith(LEAF_ROW), `the leaf row must be the lib-side child's own failure: ${note}`).toBe(
      true,
    );
    // `<parent_path>` is not asserted: for a lib-body hop it names the calling
    // theta, which this fix leaves as-is.
    expect(
      note,
      "SLSH-5 (slash-invocation.md:64): `<callee_path>` is the realpath-normalised path the hop resolved, " +
        "which for a lib-body invoke is the file beside the .thetalib",
    ).toContain(` from ${fwd(libChild)} invoked at `);
    expect(note.split(" invoked at ").length - 1, "exactly one invoke_callee hop crossed the boundary").toBe(1);
  });

  it("(E2) a same-named decoy beside the caller is never named by the chain suffix", async () => {
    const { note, libChild, decoy } = await driveProvenance(true);

    expect(note.startsWith(LEAF_ROW), `the leaf row must be the lib-side child's own failure: ${note}`).toBe(
      true,
    );
    expect(note, "the decoy never ran, so provenance must not attribute the hop to it").not.toContain(
      ` from ${fwd(decoy)} `,
    );
    expect(note).toContain(` from ${fwd(libChild)} invoked at `);
  });
});
