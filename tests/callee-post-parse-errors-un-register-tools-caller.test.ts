import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { checkThetaImports } from "../src/extension/import-static-checks";
import {
  composeExtensionInstance,
  discoverAndComposeFixtures,
} from "../src/extension/production-composition";
import {
  RendererGate,
  SYSTEM_NOTE_CHANNEL,
} from "../src/extension/system-note-channel";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument } from "../src/parser/theta-document";
import type { FileSystem } from "../src/seams/file-system";
import type { ParsedTheta } from "../src/extension/reload-wiring";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0267 — a prompt-mode caller's `tools:` `.theta` entry registers over a
// subagent-mode callee that the SAME load pass un-registers.
//
// THE CONDITION THESE CELLS WITNESS. `parseCalleeForTools`
// (`src/extension/production-composition.ts`, line 1934 in that file) derived
// its `hasErrors` from the callee file's OWN parse diagnostics alone. The
// V15f `callee-has-errors` loop (same file, lines 1742-1759) is gated on that
// field and is the only site that can un-register a caller for a callee's
// condition. Every check that decided the callee's registration AFTER its parse
// — the `.thetalib` import checks in `runComposePass` (same file, lines 925-938,
// through `checkThetaImports` in `src/extension/import-static-checks.ts`) and
// the callee's own `tools:` resolution — was therefore invisible to the caller's
// scan, so the caller registered a `.theta` callable, with a load-time closure
// hash, for a file that will not load.
//
// SPEC ANCHORS.
//   - `docs/spec_topics/invocation.md` line 22 (§Static resolution, per-surface
//     severity): a callee that "fails its own structural checks is *not
//     statically resolvable*", and on the `tools:` surface "the callable cannot
//     be created, and the parent theta does not register". That sentence settles
//     the disposition asserted below as REFUSAL AT LOAD, not registration with a
//     diagnostic.
//   - `docs/spec_topics/invocation.md` line 20 (§Static resolution): the walk the
//     verdict is judged in is the parent's per-load-pass static-resolution walk.
//   - `docs/spec_topics/diagnostics/code-registry-load.md` line 42 —
//     `theta/load/callee-has-errors`, whose Trigger already names this subject on
//     this surface at this severity, and which is already ERR-6-classified
//     (`preEvalCauseOf`'s `tools-resolution` batch,
//     `src/extension/production-composition.ts` line 316). Bug 0267 §Fix
//     constraint 2 prefers this existing row over a newly minted code, so no new
//     registry row is asserted here.
//   - `docs/spec_topics/imports.md` line 23 (IMP-1): an unresolvable `.thetalib`
//     import emits `theta/load/unresolvable-thetalib-path` against the importing
//     file and "does not register that file". Two registration decisions over
//     one file in one pass must agree; cells 1-4 are the disagreement.
//   - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` line 74: `tools`
//     declares the callable set exposed "to both code and model", which is why a
//     silently registered dead callable reaches a model turn.
//
// WHAT THIS FILE PINS. Six load-pass cells over the bug's §Reproduction table
// plus one direct seam measurement. Each cell plants a prompt-mode caller whose
// `tools:` names one subagent-mode callee, and asserts the pass's registration
// decision together with the caller-located diagnostic:
//   (1) callee imports a `.thetalib` carrying lex + parse errors    — RED at HEAD
//   (2) callee imports a `.thetalib` that does not exist (IMP-1)    — RED at HEAD
//   (3) callee imports a symbol the library does not export         — RED at HEAD
//   (4) callee's own `tools:` names an unknown Pi tool              — RED at HEAD
//   (5) control A — the callee's OWN body carries an unterminated template; the
//       caller already un-registers with a caller-located `callee-has-errors`
//       row, because that row lands on the callee's own parse document. Green at
//       HEAD; the non-regression cell.
//   (6) control B — healthy callee, healthy library: caller AND callee register,
//       and the caller's frozen callable-set entry is the `.theta` snapshot with
//       a load-time closure hash. Green at HEAD; the cell that keeps a widened
//       predicate from refusing every caller.
// Cells 1-4 assert the disposition `invocation.md` line 22 states: the caller is
// ABSENT from the registered set, an error-severity `theta/load/callee-has-errors`
// row is located at the CALLER's file, and the callee is absent too (already true
// at HEAD — its own drop route is correct and is not this bug's subject).
//
// THE DISPATCH-GATE HALF (cells 7-9). Bug 0267 §Fix constraint 3 requires the
// SAME widened predicate at the drive-time dispatch parse (`parseCalleeTheta`,
// `src/extension/production-composition.ts`, its gate at lines 2515-2534 of that
// file), or the load-time and drive-time verdicts diverge again in the opposite
// direction. Cells 1-6 cannot reach that gate: on the `tools:` surface the fixed
// caller never registers, so it is never dispatched. The surface that still
// reaches dispatch is the LITERAL `invoke("./callee.theta", …)` one, which
// `docs/spec_topics/invocation.md` line 22 gives WARNING severity — "the parent
// registers, static checks against that callee are skipped" — so its caller both
// registers and drives, through `parseCalleeTheta`:
//   (7) invoke-literal caller over the route-(i) callee (a missing `.thetalib`,
//       IMP-1): the caller REGISTERS, and its drive ends in
//       `Err(InvokeInfraError { cause: "load_failure" })` — the arm in
//       `#driveCallee` (`src/extension/production-theta-producer.ts`, lines
//       3664-3673 of that file) taken exactly when `parseCallee` returns
//       `undefined`.
//   (8) the same over the route-(ii) callee (its own `tools:` names an unknown
//       Pi tool).
//   (9) control — an invoke-literal caller over a HEALTHY callee: the same
//       registration, and a drive carrying no `load_failure`, so the arm cells 7
//       and 8 pin is not universal. Its callee is prompt mode: a subagent-mode
//       callee past the gate spawns a real `pi` child, which an offline,
//       provider-free tier must not do, and the gate under test runs BEFORE
//       `#driveCallee`'s mode branch, so a prompt-mode callee exercises it just
//       as well.
// Cells 7-9 also separate the two surfaces: the caller registering is the
// warning-severity disposition, which the fix must leave alone.
//
// DROP ROUTES ADMITTED, AND THE REST. The four routes above are the ones a
// `tools:` scan can reach where `parseCalleeForTools` runs (bug 0267 §Fix
// constraint 4 — scope the widened check explicitly). The callee's
// extension-tool reachability gate, its invoke static checks, its `subagent fn`
// checks and `subagent fn` model overrides, and its `model:` / binder-model
// resolution are NOT admitted and are deliberately NOT asserted on here: each
// needs a pass-scoped input (the executable probe, the invoke graph, the shared
// `modelMatcher`) that is not in hand at that point in the scan.
//
// PATH SEPARATORS. Two walks spell the same file differently (a normalised
// spelling from one, a Win32 spelling from another). Every path comparison below
// separator-normalises both sides first. The spelling divergence itself is bug
// 0268's subject and is neither touched nor asserted on.
//
// DIAG-4. Expected messages are read out of the shipped registry pages through
// `registryMessage`, never copied as prose, so registry drift reds here instead
// of silently comparing against a stale sentence.
//
// TIER: unit — offline, provider-free, deterministic. Host doubles only; no
// provider, no child process, no live model. The seam the bug names is one
// predicate inside the shipped composition root, and `composeExtensionInstance`
// over planted files reaches it directly, so neither an integration nor a live
// tier is needed. The harness (`makeHost` / `plantWorkspace` / `runLoadPass`) is
// modelled on, and duplicated from rather than shared with,
// `tests/thetalib-reparse-walk-single-delivery.test.ts`, bug 0264's landed
// witness, which this file neither reads from nor mutates.
//
// No silent skipping: a cell whose precondition is unmet (registry row absent,
// host double never driven, the callee's own drop route no longer firing) throws
// naming the precondition.

// ── Fixtures (bug 0267 §Reproduction) ───────────────────────────────────────

const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";
const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";
const UNRESOLVABLE_THETALIB_CODE = "theta/load/unresolvable-thetalib-path";
const IMPORT_UNKNOWN_SYMBOL_CODE = "theta/parse/import-unknown-symbol";
const UNKNOWN_TOOL_CODE = "theta/load/unknown-tool";

/**
 * A library carrying a lex-phase error (the backtick runs to end of file) and
 * the parse rows that follow it — cell 1's drop route. Every top-level `fn` in a
 * `.thetalib` is implicitly exported (`docs/spec_topics/imports.md` line 27), so
 * there is no `export` statement to confuse the route.
 */
const BROKEN_LIB_SOURCE = "fn f() {\n  let t = `unterminated\n  return 1\n}\n";

/** The same library, well formed (cells 3 and 6). */
const HEALTHY_LIB_SOURCE = "fn f() {\n  return 1\n}\n";

/** A subagent-mode callee importing `./b0267lib.thetalib` and using its export. */
const IMPORTING_CALLEE_SOURCE =
  "---\nmode: subagent\ndescription: b0267 callee\n---\n" +
  'import { f } from "./b0267lib.thetalib"\nlet a = f()\n';

/** Cell 3: the same import against a name the library does not export. */
const UNKNOWN_SYMBOL_CALLEE_SOURCE =
  "---\nmode: subagent\ndescription: b0267 callee\n---\n" +
  'import { g } from "./b0267lib.thetalib"\nlet a = 1\n';

/** Cell 4: the callee's OWN `tools:` names a Pi tool the host registry has not. */
const UNKNOWN_TOOL_CALLEE_SOURCE =
  "---\nmode: subagent\ndescription: b0267 callee\ntools:\n" +
  "  - b0267_no_such_pi_tool\n---\nlet a = 1\n";

/** Control A: the callee's own body carries an unterminated template. */
const OWN_PARSE_ERROR_CALLEE_SOURCE =
  "---\nmode: subagent\ndescription: b0267 callee\n---\nlet t = `unterminated\nlet a = 1\n";

/** The one caller shape used by every cell (bug 0267 §Reproduction). */
const CALLER_SOURCE =
  "---\nmode: prompt\ntools:\n  - ./b0267callee.theta as callee\n---\n@`hi`\n";


const CALLER_NAME = "b0267caller.theta";
const CALLEE_NAME = "b0267callee.theta";
const LIB_NAME = "b0267lib.thetalib";

/**
 * Cells 7-9: the LITERAL `invoke(...)` caller, planted under its own stem so no
 * cell's decision can be confused with the `tools:` caller's. Line 22 of
 * `docs/spec_topics/invocation.md` makes this surface warning severity, so the
 * parent registers and can be dispatched — the only offline route to
 * `parseCalleeTheta`'s gate. The body carries no `@`-query, so the drive is
 * provider-free; `?` propagates the callee's `Err` out of the theta and onto the
 * `theta-system-note` channel (SLSH-3).
 */
const INVOKE_CALLER_SOURCE = `---\nmode: prompt\n---\ninvoke("./${CALLEE_NAME}")?\n`;

const INVOKE_CALLER_NAME = "b0267invcaller.theta";
const INVOKE_CALLER_STEM = "b0267invcaller";

/** Cell 9's healthy pair, planted beside the offender pair in one workspace. */
const OK_CALLEE_NAME = "b0267okcallee.theta";
const OK_CALLER_NAME = "b0267okcaller.theta";
const OK_CALLER_STEM = "b0267okcaller";
const OK_INVOKE_CALLER_SOURCE = `---\nmode: prompt\n---\ninvoke("./${OK_CALLEE_NAME}")?\n`;

/**
 * Cell 9's healthy callee. Prompt mode on purpose: a subagent-mode callee past
 * the gate spawns a real `pi` child, which this offline tier must not do, and
 * the gate under test runs before `#driveCallee`'s mode branch.
 */
const HEALTHY_PROMPT_CALLEE_SOURCE =
  '---\nmode: prompt\ndescription: b0267 callee\n---\n"done"\n';

// ── Registry oracle (DIAG-4) ────────────────────────────────────────────────

interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  message: string;
}

const REGISTRY = ["code-registry-parse.md", "code-registry-load.md"].flatMap((page) =>
  parseRegistry(
    readFileSync(
      fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
      "utf8",
    ),
  ) as RegistryRow[],
);

/**
 * The row's normative *Message* (DIAG-4) as a regex with the `<placeholder>`
 * slots opened up. Throws naming the registry page when the row is absent, so
 * registry drift can never degrade a presence assertion into a comparison
 * against `undefined`.
 */
function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      "harness: the docs/spec_topics/diagnostics/ registry pages carry no Message row for " +
        `${code} — the DIAG-4 column is this file's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}

// ── Host doubles (modelled on tests/thetalib-reparse-walk-single-delivery.test.ts) ──

type PiHandler = (event: unknown, ctx: ExtensionContext) => unknown;

interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly details: unknown;
}

interface HostDouble {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly notes: RecordedNote[];
  readonly notified: Array<readonly [string, string]>;
}

function makeHost(cwd: string): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();

  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (event: string, handler: PiHandler): void => {
      handlers.set(event, handler);
    },
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
    sendMessage: (message: {
      customType: string;
      content: string;
      details: unknown;
    }): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        details: message.details,
      });
    },
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: "error"): void => {
        notified.push([message, type]);
      },
    },
  } as unknown as ExtensionContext;

  return { pi, ctx, notes, notified };
}

// ── The load pass ───────────────────────────────────────────────────────────

interface ComposeWorkspace {
  readonly cwd: string;
  /** Absolute, separator-normalised path of a planted fixture file. */
  path: (name: string) => string;
  readonly dispose: () => void;
}

/** Separator-normalise a path so Win32 `\` and POSIX `/` spellings compare. */
function normalisePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Plant the named fixture files on the conventional project source
 * (`.pi/theta/`), exactly as bug 0267 §Reproduction does. One workspace per cell
 * keeps every decision below attributable to that cell's file set.
 */
function plantWorkspace(files: Readonly<Record<string, string>>): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0267-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, ".pi", "theta", name), body, "utf8");
  }
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md §Failure
  // modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}

interface LoadPass {
  /** Every `theta-system-note` the pass put on the channel, in order. */
  readonly notes: readonly RecordedNote[];
  readonly offChannel: readonly RecordedNote[];
  readonly notified: readonly (readonly [string, string])[];
  /** Slash names the pass actually registered. */
  readonly registered: readonly string[];
  readonly thetas: readonly ParsedTheta[];
}

/**
 * Drive the SHIPPED composition root over the planted workspace with an
 * UNDEGRADED `RendererGate`, so every note takes the transcript
 * (`pi.sendMessage`) arm the author reads.
 */
async function runLoadPass(workspace: ComposeWorkspace): Promise<LoadPass> {
  const host = makeHost(workspace.cwd);
  const wiring = await composeExtensionInstance(
    host.pi,
    host.ctx,
    undefined,
    new RendererGate(),
  );
  return {
    notes: host.notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL),
    offChannel: host.notes.filter((n) => n.customType !== SYSTEM_NOTE_CHANNEL),
    notified: host.notified,
    registered: wiring.thetas.map((t) => t.slashName),
    thetas: wiring.thetas,
  };
}

// ── The dispatch pass (cells 7-9) ─────────────────────────────────────

interface DispatchPass {
  readonly registered: readonly string[];
  /** Run a registered fixture and return the notes ITS drive put on the channel. */
  readonly drive: (stem: string) => Promise<readonly string[]>;
}

/**
 * Compose the shipped discovery + composition path into RUNNABLE fixtures, so a
 * registered caller can actually be dispatched. `composeExtensionInstance`
 * returns `ParsedTheta`s, which carry no `run`, hence the second entry point.
 */
async function runDispatchPass(workspace: ComposeWorkspace): Promise<DispatchPass> {
  const host = makeHost(workspace.cwd);
  const fixtures = await discoverAndComposeFixtures(host.pi, host.ctx);
  const runContext = {
    signal: undefined,
    cwd: workspace.cwd,
    isIdle: (): boolean => true,
    waitForIdle: (): Promise<void> => Promise.resolve(),
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    sessionManager: {
      getEntries: (): readonly unknown[] => [],
      getLeafId: (): undefined => undefined,
    },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionCommandContext;
  return {
    registered: fixtures.map((f) => f.slashName),
    drive: async (stem: string): Promise<readonly string[]> => {
      const fixture = fixtures.find((f) => f.slashName === stem);
      if (fixture === undefined) {
        throw new Error(
          `harness: no registered fixture named ${stem}, so its drive has no subject — ` +
            `registered: ${JSON.stringify(fixtures.map((f) => f.slashName))}`,
        );
      }
      const before = host.notes.length;
      await fixture.run("", runContext);
      return host.notes
        .slice(before)
        .filter((n) => n.customType === SYSTEM_NOTE_CHANNEL)
        .map((n) => n.content);
    },
  };
}

// ── Observation helpers ─────────────────────────────────────────────────────

function noteDiagnostics(note: RecordedNote): readonly Diagnostic[] {
  const details = note.details as { diagnostics?: unknown } | undefined;
  const diagnostics = details?.diagnostics;
  if (!Array.isArray(diagnostics)) {
    expect.fail(
      `system note carries no details.diagnostics array: ${JSON.stringify(note.details)}`,
    );
  }
  return diagnostics as readonly Diagnostic[];
}

function allDiagnostics(notes: readonly RecordedNote[]): readonly Diagnostic[] {
  return notes.flatMap((note) => [...noteDiagnostics(note)]);
}

function describeNotes(notes: readonly RecordedNote[]): string {
  return notes.length === 0
    ? "[] (NO NOTE ON THE CHANNEL)"
    : notes.map((n, i) => `[${i}] ${n.content}`).join("\n");
}

/** The host double must have been driven at all before any decision means anything. */
function requireDriven(pass: LoadPass): void {
  if (pass.notes.length === 0 && pass.registered.length === 0) {
    throw new Error(
      "harness: the composition root neither registered a theta nor put anything on the " +
        "theta-system-note channel — the bug-0267 fixture no longer reaches the load pass, " +
        "so nothing below is verified",
    );
  }
}

/**
 * The precondition every defect cell rests on: the callee's OWN drop route
 * fired this pass. Without it the cell is measuring an unrelated pass, so an
 * absent route throws naming itself rather than letting the cell pass or red on
 * the wrong subject.
 */
function requireCalleeDropRoute(pass: LoadPass, code: string): void {
  const rows = allDiagnostics(pass.notes).filter(
    (d) => d.code === code && d.severity === "error",
  );
  if (rows.length === 0) {
    throw new Error(
      `harness: no error-severity ${code} row reached the channel — the callee's own drop ` +
        "route is the precondition for bug 0267's caller-side claim, so its absence is a " +
        `harness failure, never a skip. Notes:\n${describeNotes(pass.notes)}`,
    );
  }
}

/**
 * Bug 0267 §Fix constraint 1, on the route `invocation.md` line 22 settles: the
 * caller does not register, an error-severity `theta/load/callee-has-errors` row
 * is located at the CALLER's file with the registry's Message, and the callee
 * does not register either.
 */
function expectCallerRefused(pass: LoadPass, callerPath: string, callerName: string): void {
  expect(
    pass.registered,
    `the caller must not register over a callee this pass un-registers\n${describeNotes(pass.notes)}`,
  ).not.toContain(callerName);

  const callerRows = allDiagnostics(pass.notes).filter(
    (d) =>
      d.code === CALLEE_HAS_ERRORS_CODE &&
      d.severity === "error" &&
      normalisePath(d.file ?? "") === callerPath,
  );
  expect(
    callerRows.length,
    `error-severity ${CALLEE_HAS_ERRORS_CODE} rows located at the caller's file: ` +
      `${callerRows.length}\n${describeNotes(pass.notes)}`,
  ).toBeGreaterThanOrEqual(1);
  expect((callerRows[0] as Diagnostic).message, `${CALLEE_HAS_ERRORS_CODE} message`).toMatch(
    normativeMessagePattern(CALLEE_HAS_ERRORS_CODE),
  );
}

// ── In-memory seam fixture (the direct measurement, no load pass) ────────────

/** A `FileSystem` double over POSIX-spelled in-memory files, for the seam cell. */
function memoryFs(files: Readonly<Record<string, string>>): FileSystem {
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

describe("bug 0267 — a callee's post-parse drop un-registers the `tools:` caller too", () => {
  // ── (1) callee imports a `.thetalib` carrying lex + parse errors ──────────

  it("(1) callee imports a malformed `.thetalib`: the caller does not register", async () => {
    const workspace = plantWorkspace({
      [LIB_NAME]: BROKEN_LIB_SOURCE,
      [CALLEE_NAME]: IMPORTING_CALLEE_SOURCE,
      [CALLER_NAME]: CALLER_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireCalleeDropRoute(pass, UNTERMINATED_TEMPLATE_CODE);

      // HEAD: `pass.registered` is `["b0267caller"]` — the library's rows land on
      // the LIBRARY's parse document, never on the callee's, so the callee's
      // `hasErrors` is false and the V15f loop has no subject.
      expectCallerRefused(pass, workspace.path(CALLER_NAME), "b0267caller");
      // Non-regression: the callee's own drop is correct at HEAD and stays.
      expect(pass.registered).not.toContain("b0267callee");
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (2) callee imports a `.thetalib` that does not exist (IMP-1) ──────────

  it("(2) callee imports a missing `.thetalib` (IMP-1): the caller does not register", async () => {
    const workspace = plantWorkspace({
      [CALLEE_NAME]: IMPORTING_CALLEE_SOURCE,
      [CALLER_NAME]: CALLER_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireCalleeDropRoute(pass, UNRESOLVABLE_THETALIB_CODE);

      // IMP-1 (`docs/spec_topics/imports.md` line 23) un-registers the importing
      // file; the caller's decision over the same file must agree.
      expectCallerRefused(pass, workspace.path(CALLER_NAME), "b0267caller");
      expect(pass.registered).not.toContain("b0267callee");
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (3) callee imports a symbol the library does not export ───────────────

  it("(3) callee imports an unknown symbol: the caller does not register", async () => {
    const workspace = plantWorkspace({
      [LIB_NAME]: HEALTHY_LIB_SOURCE,
      [CALLEE_NAME]: UNKNOWN_SYMBOL_CALLEE_SOURCE,
      [CALLER_NAME]: CALLER_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireCalleeDropRoute(pass, IMPORT_UNKNOWN_SYMBOL_CODE);

      expectCallerRefused(pass, workspace.path(CALLER_NAME), "b0267caller");
      expect(pass.registered).not.toContain("b0267callee");
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (4) the callee's own `tools:` names an unknown Pi tool ────────────────

  it("(4) callee's own `tools:` names an unknown Pi tool: the caller does not register", async () => {
    const workspace = plantWorkspace({
      [CALLEE_NAME]: UNKNOWN_TOOL_CALLEE_SOURCE,
      [CALLER_NAME]: CALLER_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireCalleeDropRoute(pass, UNKNOWN_TOOL_CODE);

      // The caller's scan replaces the callee's own `resolveThetaToolsAtLoad`
      // with `parseCalleeForTools`, which read mode, existence and containment
      // only, so the callee's `theta/load/unknown-tool` did not reach the
      // caller's decision.
      expectCallerRefused(pass, workspace.path(CALLER_NAME), "b0267caller");
      expect(pass.registered).not.toContain("b0267callee");
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (5) control A — the callee's OWN body fails to parse ──────────────────

  it("(5) control A — the callee's own body fails to parse: the caller already does not register", async () => {
    const workspace = plantWorkspace({
      [CALLEE_NAME]: OWN_PARSE_ERROR_CALLEE_SOURCE,
      [CALLER_NAME]: CALLER_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireCalleeDropRoute(pass, UNTERMINATED_TEMPLATE_CODE);

      // The one condition the V15f loop already detects, because its rows land
      // on the callee's OWN parse document. Green at HEAD: this cell is what
      // keeps a fix from moving the detection rather than widening it.
      expectCallerRefused(pass, workspace.path(CALLER_NAME), "b0267caller");
      expect(pass.registered).not.toContain("b0267callee");
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (6) control B — healthy callee, healthy library ───────────────────────

  it("(6) control B — healthy callee: caller and callee both register, with the `.theta` callable", async () => {
    const workspace = plantWorkspace({
      [LIB_NAME]: HEALTHY_LIB_SOURCE,
      [CALLEE_NAME]: IMPORTING_CALLEE_SOURCE,
      [CALLER_NAME]: CALLER_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      expect([...pass.registered].sort(), describeNotes(pass.notes)).toEqual([
        "b0267callee",
        "b0267caller",
      ]);
      const callerRows = allDiagnostics(pass.notes).filter(
        (d) => d.code === CALLEE_HAS_ERRORS_CODE,
      );
      expect(
        callerRows.map((d) => `${normalisePath(d.file ?? "")}: ${d.message}`),
        `a healthy callee must draw no ${CALLEE_HAS_ERRORS_CODE} row`,
      ).toEqual([]);

      // The frozen `tools:` snapshot (`resolveCallableSet`) the caller carries:
      // the `.theta` callable, its declared subagent mode, the callee path
      // literal as written, and the load-time closure hash
      // (`attachLoadTimeClosureHashes`).
      const caller = pass.thetas.find((t) => t.slashName === "b0267caller");
      if (caller === undefined) {
        throw new Error(
          "harness: the healthy control registered no caller, so the callable-set " +
            `assertions below have no subject\n${describeNotes(pass.notes)}`,
        );
      }
      const entry = caller.callableSet?.entries.get("callee") as
        | {
            kind?: string;
            mode?: string;
            calleePath?: string;
            closureHash?: string;
          }
        | undefined;
      expect(entry, "the caller's frozen callable set carries no `callee` entry").toBeDefined();
      expect(entry?.kind).toBe("theta");
      expect(entry?.mode).toBe("subagent");
      expect(entry?.calleePath).toBe(`./${CALLEE_NAME}`);
      expect(typeof entry?.closureHash, "load-time closure hash").toBe("string");

      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (7-9) the dispatch gate, over the literal `invoke(...)` surface ──────

  /**
   * The terminal outcome bug 0267 §Fix constraint 3's second site produces: the
   * `#driveCallee` arm taken exactly when `parseCallee` returns `undefined`
   * (`src/extension/production-theta-producer.ts`, lines 3664-3673 of that
   * file), rendered by `renderLeafKindNote` (`src/runtime/err-note-render.ts`) as
   * `invoke of <path> failed (load_failure)`.
   */
  function expectLoadFailure(notes: readonly string[], stem: string): void {
    const normalised = notes.map(normalisePath);
    expect(
      normalised.some(
        (note) =>
          note.includes(`theta /${stem} returned Err: invoke of`) &&
          note.includes(`./${CALLEE_NAME}`) &&
          note.includes("failed (load_failure)"),
      ),
      "the dispatch gate must refuse a callee whose own post-parse checks fail, so the drive " +
        "ends in Err(InvokeInfraError { cause: 'load_failure' }). Notes: " +
        JSON.stringify(normalised),
    ).toBe(true);
  }

  it("(7) invoke-literal caller over the missing-`.thetalib` callee: registers, and its drive fails closed with load_failure", async () => {
    const workspace = plantWorkspace({
      [CALLEE_NAME]: IMPORTING_CALLEE_SOURCE,
      [INVOKE_CALLER_NAME]: INVOKE_CALLER_SOURCE,
    });
    try {
      const pass = await runDispatchPass(workspace);

      // The warning-severity disposition, unchanged by this fix and what
      // separates this cell from cells 1-4: the `invoke(...)` parent registers.
      expect(
        pass.registered,
        "an `invoke(...)` literal is warning severity, so its parent must keep registering. " +
          `Registered: ${JSON.stringify(pass.registered)}`,
      ).toContain(INVOKE_CALLER_STEM);
      expect(
        pass.registered,
        "IMP-1 un-registers the importing callee; that disposition is not this bug's subject",
      ).not.toContain("b0267callee");

      expectLoadFailure(await pass.drive(INVOKE_CALLER_STEM), INVOKE_CALLER_STEM);
    } finally {
      workspace.dispose();
    }
  });

  it("(8) invoke-literal caller over the unknown-Pi-tool callee: registers, and its drive fails closed with load_failure", async () => {
    const workspace = plantWorkspace({
      [CALLEE_NAME]: UNKNOWN_TOOL_CALLEE_SOURCE,
      [INVOKE_CALLER_NAME]: INVOKE_CALLER_SOURCE,
    });
    try {
      const pass = await runDispatchPass(workspace);

      expect(
        pass.registered,
        `Registered: ${JSON.stringify(pass.registered)}`,
      ).toContain(INVOKE_CALLER_STEM);
      expect(pass.registered).not.toContain("b0267callee");

      expectLoadFailure(await pass.drive(INVOKE_CALLER_STEM), INVOKE_CALLER_STEM);
    } finally {
      workspace.dispose();
    }
  });

  it("(9) control — the healthy callee's invoke drive carries no err note while its offender neighbour's does", async () => {
    // A clean drive's success observable is the ABSENCE of a note (AGENTS.md
    // §"Assert on real observables"), so the offender pair is planted in the SAME
    // workspace and driven through the SAME harness instance: its `load_failure`
    // note is the in-cell proof that the channel this cell reads an absence off
    // is live.
    const workspace = plantWorkspace({
      [CALLEE_NAME]: IMPORTING_CALLEE_SOURCE,
      [INVOKE_CALLER_NAME]: INVOKE_CALLER_SOURCE,
      [OK_CALLEE_NAME]: HEALTHY_PROMPT_CALLEE_SOURCE,
      [OK_CALLER_NAME]: OK_INVOKE_CALLER_SOURCE,
    });
    try {
      const pass = await runDispatchPass(workspace);

      expect(
        [...pass.registered].sort(),
        "the healthy pair must both register, and both invoke callers with them, or nothing " +
          "below is a control",
      ).toEqual([INVOKE_CALLER_STEM, "b0267okcallee", OK_CALLER_STEM]);

      expectLoadFailure(await pass.drive(INVOKE_CALLER_STEM), INVOKE_CALLER_STEM);

      const notes = (await pass.drive(OK_CALLER_STEM)).map(normalisePath);
      expect(
        notes,
        "the dispatch gate must admit a healthy callee — without this the widened predicate " +
          "could refuse every callee and cells 7 and 8 would still pass. Notes: " +
          JSON.stringify(notes),
      ).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── The seam, measured directly ───────────────────────────────────────────

  it("seam — the cell-1 callee parses clean while its import check errors", async () => {
    const source = new TextEncoder().encode(IMPORTING_CALLEE_SOURCE);
    const document = parseThetaDocument({ path: "/proj/b0267callee.theta", bytes: source }, parseDeps());
    if (document.frontmatter === null) {
      throw new Error(
        "harness: the cell-1 callee no longer parses to non-null frontmatter, so the seam " +
          "measurement has no subject",
      );
    }

    // The narrow input the caller's scan judged the callee by before the fix:
    // the callee file's own parse diagnostics, which are empty.
    expect(
      document.diagnostics.map((d) => `${d.severity} ${d.code}`),
      "the callee's own parse document carries no error",
    ).toEqual([]);

    // The verdict the pass actually reaches, from a walk the caller's scan does
    // not perform (`checkThetaImports` in
    // `src/extension/import-static-checks.ts`).
    const input: ThetaCompositionInput = {
      slashName: "b0267callee",
      sourcePath: "/proj/b0267callee.theta",
      frontmatter: document.frontmatter as ParsedFrontmatter,
      body: document.body,
    };
    const check = await checkThetaImports(input, {
      fs: memoryFs({ "/proj/b0267lib.thetalib": BROKEN_LIB_SOURCE }),
      parseDeps: parseDeps(),
    });
    const errors = check.diagnostics.filter((d) => d.severity === "error");
    expect(
      errors.map((d) => d.code),
      "the import check over the same parsed input must un-register the callee",
    ).not.toEqual([]);
  });
});
