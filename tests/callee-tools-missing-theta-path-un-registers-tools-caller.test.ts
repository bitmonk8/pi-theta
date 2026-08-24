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
import {
  composeExtensionInstance,
  discoverAndComposeFixtures,
} from "../src/extension/production-composition";
import { RendererGate, SYSTEM_NOTE_CHANNEL } from "../src/extension/system-note-channel";
import type { ParsedTheta } from "../src/extension/reload-wiring";

// Bug 0270 — a subagent callee whose OWN `tools:` names a `.theta` path that
// resolves to no file un-registers, while its prompt-mode `tools:` caller still
// registers a fully-formed callable over it, with no caller-located row.
//
// THE CONDITION THESE CELLS WITNESS. `calleeFailsOwnStructuralChecks`
// (`src/extension/production-composition.ts`, line 2133 in that file) is the
// widened read bug 0267 landed: it answers whether a `tools:`-reached callee
// fails checks that run after its own `parseThetaDocument`. Its second condition
// re-runs `resolveCallableSet` over the callee's own `tools:` with a stub
// `CallableSetDeps` whose `resolveThetaCallee` (same file, line 2224) resolved
// EVERY `.theta` entry to a fixed `{kind: "theta", mode: "subagent", callee:
// undefined}`, without touching the filesystem. `resolveEntry`'s `resolved ===
// undefined` arm (`src/parser/callable-set.ts`, lines 405-414 of that file) is
// the only producer of `theta/load/unresolvable-theta-path`, so it was
// unreachable inside that walk; and the helper's return filter (same file as the
// stub, lines 2239-2242) named `theta/load/unknown-tool` alone, so even a
// produced row would not have counted. `parseCalleeForTools`'s `hasErrors`
// (line 2030) therefore stayed `false`, the V15f `callee-has-errors` loop
// (lines 1747-1759) had no subject, and the caller registered a `.theta`
// callable whose load-time closure hash covered bytes that will not load. The
// dispatch gate (`parseCalleeTheta`, its `calleeFailsOwnStructuralChecks` call
// at line 2523 of the same file) uses the same predicate, so the drive-time
// verdict inherited the identical blind spot.
//
// SPEC ANCHORS.
//   - `docs/spec_topics/invocation.md` line 22 (§Static resolution, per-surface
//     severity): a callee that "fails its own structural checks is *not
//     statically resolvable*", and on the `tools:` surface "the callable cannot
//     be created, and the parent theta does not register". That sentence settles
//     the disposition asserted below as REFUSAL AT LOAD.
//   - `docs/spec_topics/diagnostics/code-registry-load.md` line 29 —
//     `theta/load/unresolvable-theta-path`, `E` at load, whose Trigger is a
//     "`tools:` `.theta` entry [that] resolves to a path that does not exist or
//     is not readable". Error severity at the callee is what makes this one of
//     the callee's own structural checks.
//   - `docs/spec_topics/diagnostics/code-registry-load.md` line 42 —
//     `theta/load/callee-has-errors`, `E` on the `tools:` surface, already
//     ERR-6-classified (`preEvalCauseOf`'s `tools-resolution` batch,
//     `src/extension/production-composition.ts` line 316). Bug 0270 §Fix
//     constraint 2 prefers this existing row over a newly minted code, so no new
//     registry row is asserted here.
//   - `docs/spec_topics/diagnostics/code-registry-load.md` line 36 —
//     `theta/load/invoke-path-escape`, the bug 0111 route cell (D) pins as the
//     one that must keep owning an ESCAPING grandchild entry.
//   - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` line 74: `tools`
//     declares the callable set exposed "from both the model … and from theta
//     code", which is why a silently registered dead callable reaches a model
//     turn.
//
// WHAT THIS FILE PINS. Seven cells over bug 0270 §Reproduction plus the
// boundary rows its §Fix constraints 4-6 require:
//   (A) offender — the callee's own `tools:` names a `.theta` that was never
//       planted                                                   — RED at HEAD
//   (B) byte-neighbour control — the same bytes with the named grandchild
//       planted and healthy                                       — green
//   (C) the dispatch-gate half (§Fix constraint 5)                 — RED at HEAD
//   (D) containment owns an ESCAPING entry (§Fix constraint 6)      — green
//   (D2) an entry that EXISTS and `realpath`s but cannot be READ, outside every
//       root: the read failure wins, one caller-located row (§Fix constraint 6,
//       non-double-report)                                    — RED before the fix
//   (D3) the same unreadable entry INSIDE the roots            — RED before the fix
//   (E) the conservatism bound (§Fix constraint 4)                 — green
// Cell (E) pins a WITHHOLD, not a refusal: a grandchild that EXISTS but carries
// its own errors leaves the caller registering, because the non-recursion bound
// the stub enforces stands. That divergence is bug 0271's neighbourhood and is
// deliberately not fixed here; pinning it keeps a later fix from silently
// over-refusing.
//
// TIER: unit — offline, provider-free, deterministic. Host doubles only; no
// provider, no child process, no live model. The seam is one predicate inside
// the shipped composition root, and `composeExtensionInstance` over planted
// files reaches it directly. The harness (`makeHost` / `plantWorkspace` /
// `runLoadPass`) is modelled on, and duplicated from rather than shared with,
// `tests/callee-post-parse-errors-un-register-tools-caller.test.ts`, bug 0267's
// landed witness, which this file neither reads from nor mutates.
//
// PATH SEPARATORS. Two walks spell the same file differently. Every path
// comparison below separator-normalises both sides first; the spelling
// divergence itself is bug 0268's subject and is neither touched nor asserted
// on.
//
// DIAG-4. Expected messages are read out of the shipped registry page through
// `registryMessage`, never copied as prose, so registry drift reds here instead
// of silently comparing against a stale sentence.
//
// No silent skipping: a cell whose precondition is unmet (registry row absent,
// host double never driven, the callee's own drop route no longer firing) throws
// naming the precondition.

// ── Codes ───────────────────────────────────────────────────────────────────

const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";
const UNRESOLVABLE_THETA_PATH_CODE = "theta/load/unresolvable-theta-path";
const INVOKE_PATH_ESCAPE_CODE = "theta/load/invoke-path-escape";
const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";

// ── Fixtures (bug 0270 §Reproduction) ───────────────────────────────────────

const CALLER_NAME = "b0270caller.theta";
const CALLEE_NAME = "b0270callee.theta";
const GRANDCHILD_NAME = "b0270gc.theta";
/** Named by the offender callee's own `tools:` and never planted. */
const MISSING_NAME = "b0270missing.theta";

/** The one `tools:` caller shape every load-pass cell uses. */
const CALLER_SOURCE =
  "---\nmode: prompt\ntools:\n" + `  - ./${CALLEE_NAME} as callee\n---\n@\`hi\`\n`;

/** Cell (A): the callee's own `tools:` names a `.theta` path with no file behind it. */
const MISSING_ENTRY_CALLEE_SOURCE =
  "---\nmode: subagent\ndescription: b0270 callee\ntools:\n" +
  `  - ./${MISSING_NAME} as gc\n---\nlet a = 1\n`;

/**
 * Cells (B) and (E): the SAME callee bytes with the entry pointing at a planted
 * neighbour instead. This is the single structural difference between the
 * offender and the control, exactly as bug 0270 §"Why it matters" states.
 */
const PRESENT_ENTRY_CALLEE_SOURCE =
  "---\nmode: subagent\ndescription: b0270 callee\ntools:\n" +
  `  - ./${GRANDCHILD_NAME} as gc\n---\nlet a = 1\n`;

/**
 * Cell (D): the same callee whose entry names a file that EXISTS but sits
 * outside every active discovery root, which is bug 0111's route
 * (`checkNestedToolsContainment`) and draws `theta/load/invoke-path-escape`.
 */
const ESCAPING_ENTRY_CALLEE_SOURCE =
  "---\nmode: subagent\ndescription: b0270 callee\ntools:\n" +
  `  - ../../outside/${GRANDCHILD_NAME} as gc\n---\nlet a = 1\n`;

/**
 * Cells (D2)/(D3): a `.theta` name that EXISTS and `realpath`s but cannot be
 * READ, planted as a DIRECTORY. `fs.readBytes` rejects `EISDIR` while
 * `fs.realpath` succeeds, which is the corner where the containment walk
 * (`realpath`-only) and the readability probe disagree — portable and
 * deterministic, with no ACL or permission-bit trickery.
 */
const UNREADABLE_DIR_NAME = "b0270gcdir.theta";

/** Cell (D2): the unreadable-directory entry sits OUTSIDE every discovery root. */
const ESCAPING_UNREADABLE_CALLEE_SOURCE =
  "---\nmode: subagent\ndescription: b0270 callee\ntools:\n" +
  `  - ../../outside/${UNREADABLE_DIR_NAME} as gc\n---\nlet a = 1\n`;

/** Cell (D3): the same unreadable-directory entry INSIDE the discovery roots. */
const CONTAINED_UNREADABLE_CALLEE_SOURCE =
  "---\nmode: subagent\ndescription: b0270 callee\ntools:\n" +
  `  - ./${UNREADABLE_DIR_NAME} as gc\n---\nlet a = 1\n`;

/** A grandchild the callee's `tools:` can legally name: subagent mode, clean body. */
const HEALTHY_GRANDCHILD_SOURCE =
  "---\nmode: subagent\ndescription: b0270 grandchild\n---\nlet a = 1\n";

/** Cell (E)'s grandchild: same path and mode, its OWN body fails to parse. */
const BROKEN_GRANDCHILD_SOURCE =
  "---\nmode: subagent\ndescription: b0270 grandchild\n---\nlet t = `unterminated\nlet a = 1\n";

/**
 * Cell (C): the LITERAL `invoke(...)` caller. `docs/spec_topics/invocation.md`
 * line 22 gives that surface WARNING severity — "the parent registers, static
 * checks against that callee are skipped" — so it is the only offline route to
 * `parseCalleeTheta`'s gate. The body carries no `@`-query, so the drive is
 * provider-free; `?` propagates the callee's `Err` out of the theta and onto the
 * `theta-system-note` channel (SLSH-3).
 */
const INVOKE_CALLER_NAME = "b0270invcaller.theta";
const INVOKE_CALLER_STEM = "b0270invcaller";
const INVOKE_CALLER_SOURCE = `---\nmode: prompt\n---\ninvoke("./${CALLEE_NAME}")?\n`;

/**
 * Cell (C)'s callee: PROMPT mode carrying the same missing-`.theta` entry. The
 * gate under test runs before `#driveCallee`'s mode branch, and a subagent-mode
 * callee past the gate would spawn a real `pi` child, which this offline tier
 * must not do — the same reasoning bug 0267's cell 9 records.
 */
const PROMPT_MISSING_ENTRY_CALLEE_SOURCE =
  "---\nmode: prompt\ndescription: b0270 callee\ntools:\n" +
  `  - ./${MISSING_NAME} as gc\n---\n"done"\n`;

// ── Registry oracle (DIAG-4) ────────────────────────────────────────────────

interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

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
      "harness: docs/spec_topics/diagnostics/code-registry-load.md carries no Message row for " +
        `${code} — the DIAG-4 column is this file's only message oracle, so a missing row is a ` +
        "harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}

// ── Host doubles ────────────────────────────────────────────────────────────

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

// ── The workspace ───────────────────────────────────────────────────────────

interface ComposeWorkspace {
  readonly cwd: string;
  /** Absolute, separator-normalised path of a file planted on the project source. */
  path: (name: string) => string;
  readonly dispose: () => void;
}

/** Separator-normalise a path so Win32 `\` and POSIX `/` spellings compare. */
function normalisePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Plant the named fixture files on the conventional project source
 * (`.pi/theta/`), exactly as bug 0270 §Reproduction does. `outside` plants into
 * a sibling directory that is NOT a discovery root, which is how cell (D)
 * reaches bug 0111's containment route with a file that genuinely exists. One
 * workspace per cell keeps every decision below attributable to that cell's
 * file set. `dirs` plants DIRECTORIES rather than files — the `.theta` name
 * that exists and `realpath`s while `readBytes` rejects, which cells (D2)/(D3)
 * need; an `outside/` prefix on such a name plants it in the non-root sibling
 * directory.
 */
function plantWorkspace(
  files: Readonly<Record<string, string>>,
  outside?: Readonly<Record<string, string>>,
  dirs?: readonly string[],
): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0270-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, ".pi", "theta", name), body, "utf8");
  }
  if (outside !== undefined) {
    mkdirSync(join(cwd, "outside"), { recursive: true });
    for (const [name, body] of Object.entries(outside)) {
      writeFileSync(join(cwd, "outside", name), body, "utf8");
    }
  }
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md §Failure
  // modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  for (const name of dirs ?? []) {
    const target = name.startsWith("outside/")
      ? join(cwd, "outside", name.slice("outside/".length))
      : join(cwd, ".pi", "theta", name);
    mkdirSync(target, { recursive: true });
  }
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}

// ── The load pass ───────────────────────────────────────────────────────────

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

// ── The dispatch pass (cell C) ──────────────────────────────────────────────

interface DispatchPass {
  readonly registered: readonly string[];
  /** Run a registered fixture and return the notes ITS drive put on the channel. */
  readonly drive: (stem: string) => Promise<readonly string[]>;
}

/**
 * Compose the shipped discovery + composition path into RUNNABLE fixtures, so a
 * registered caller can actually be dispatched. `composeExtensionInstance`
 * returns `ParsedTheta`s, which carry no `run`, hence the second entry point.
 * The notes are read off the settled in-memory session the host double records,
 * after the drive's promise has resolved — never off a racy event.
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

/** Error-severity codes the pass located at `file`, sorted and de-duplicated. */
function errorCodesAt(pass: LoadPass, file: string): readonly string[] {
  return [
    ...new Set(
      allDiagnostics(pass.notes)
        .filter((d) => d.severity === "error" && normalisePath(d.file ?? "") === file)
        .map((d) => d.code),
    ),
  ].sort();
}

/** The host double must have been driven at all before any decision means anything. */
function requireDriven(pass: LoadPass): void {
  if (pass.notes.length === 0 && pass.registered.length === 0) {
    throw new Error(
      "harness: the composition root neither registered a theta nor put anything on the " +
        "theta-system-note channel — the bug-0270 fixture no longer reaches the load pass, " +
        "so nothing below is verified",
    );
  }
}

/**
 * The precondition the offender cells rest on: the callee's OWN drop route fired
 * this pass, located at the callee's own file. Without it the cell is measuring
 * an unrelated pass, so an absent route throws naming itself rather than letting
 * the cell pass or red on the wrong subject.
 */
function requireCalleeDropRoute(pass: LoadPass, code: string, calleeFile: string): void {
  const rows = allDiagnostics(pass.notes).filter(
    (d) =>
      d.code === code &&
      d.severity === "error" &&
      normalisePath(d.file ?? "") === calleeFile,
  );
  if (rows.length === 0) {
    throw new Error(
      `harness: no error-severity ${code} row is located at the callee's own file — the ` +
        "callee's own drop route is the premise of bug 0270's caller-side claim, so its " +
        `absence is a harness failure, never a skip. Notes:\n${describeNotes(pass.notes)}`,
    );
  }
}

/**
 * Bug 0270 §Fix constraint 1, on the route `invocation.md` line 22 settles: the
 * caller does not register, an error-severity `theta/load/callee-has-errors` row
 * is located at the CALLER's file with the registry's Message, and the callee
 * does not register either.
 */
function expectCallerRefused(pass: LoadPass, callerPath: string, callerName: string): void {
  expect(
    pass.registered,
    "the caller must not register over a callee this same pass un-registers\n" +
      describeNotes(pass.notes),
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

describe("bug 0270 — a callee whose own `tools:` names a missing `.theta` un-registers the `tools:` caller too", () => {
  // ── (A) the offender ─────────────────────────────────────────────────────

  it("(A) callee's own `tools:` names a `.theta` path with no file: the caller does not register", async () => {
    const workspace = plantWorkspace({
      [CALLEE_NAME]: MISSING_ENTRY_CALLEE_SOURCE,
      [CALLER_NAME]: CALLER_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      // `code-registry-load.md` line 29: error severity at the callee, which is
      // what makes the unresolvable entry one of the callee's own structural
      // checks under `invocation.md` line 22.
      requireCalleeDropRoute(
        pass,
        UNRESOLVABLE_THETA_PATH_CODE,
        workspace.path(CALLEE_NAME),
      );

      // HEAD: `pass.registered` is `["b0270caller"]` and the ONLY diagnostic in
      // the pass is the callee-located `unresolvable-theta-path` row — the stub
      // `resolveThetaCallee` never returns `undefined`, so the caller's scan
      // cannot see it.
      expectCallerRefused(pass, workspace.path(CALLER_NAME), "b0270caller");
      // Non-regression: the callee's own drop is correct at HEAD and stays.
      expect(pass.registered).not.toContain("b0270callee");
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (B) the byte-neighbour control ───────────────────────────────────────

  it("(B) control — the named grandchild exists: caller and callee both register, with the `.theta` callable", async () => {
    const workspace = plantWorkspace({
      [GRANDCHILD_NAME]: HEALTHY_GRANDCHILD_SOURCE,
      [CALLEE_NAME]: PRESENT_ENTRY_CALLEE_SOURCE,
      [CALLER_NAME]: CALLER_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      // The grandchild is itself discovered on the same project source, so it
      // registers in its own right beside the pair under test.
      expect([...pass.registered].sort(), describeNotes(pass.notes)).toEqual([
        "b0270callee",
        "b0270caller",
        "b0270gc",
      ]);
      expect(
        allDiagnostics(pass.notes).map(
          (d) => `${d.severity} ${d.code} @ ${normalisePath(d.file ?? "?")}`,
        ),
        "a planted, healthy grandchild must draw no diagnostic anywhere",
      ).toEqual([]);

      // The frozen `tools:` snapshot (`resolveCallableSet`) the caller carries:
      // the `.theta` callable, its declared subagent mode, the callee path
      // literal as written, and the load-time closure hash
      // (`attachLoadTimeClosureHashes`). Cell (A)'s defect is that this shape is
      // byte-identical there.
      const caller = pass.thetas.find((t) => t.slashName === "b0270caller");
      if (caller === undefined) {
        throw new Error(
          "harness: the control registered no caller, so the callable-set assertions below " +
            `have no subject\n${describeNotes(pass.notes)}`,
        );
      }
      const entry = caller.callableSet?.entries.get("callee") as
        | { kind?: string; mode?: string; calleePath?: string; closureHash?: string }
        | undefined;
      expect(entry, "the caller's frozen callable set carries no `callee` entry").toBeDefined();
      expect(entry?.kind).toBe("theta");
      expect(entry?.mode).toBe("subagent");
      expect(entry?.calleePath).toBe(`./${CALLEE_NAME}`);
      expect(typeof entry?.closureHash, "load-time closure hash").toBe("string");
      expect(entry?.closureHash, "load-time closure hash shape").toMatch(/^sha256:[0-9a-f]{64}$/);

      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (C) the dispatch gate ────────────────────────────────────────────────

  it("(C) the dispatch gate refuses the same callee: the invoke-literal caller's drive fails closed with load_failure", async () => {
    // Bug 0270 §Fix constraint 5: whatever admits the route at
    // `parseCalleeForTools` must apply at `parseCalleeTheta`'s gate in the same
    // change, or the drive-time verdict diverges from the load-time one. HEAD
    // puts ZERO notes on the channel here — the gate accepts a file the same
    // pass dropped and the callee's body runs.
    const workspace = plantWorkspace({
      [CALLEE_NAME]: PROMPT_MISSING_ENTRY_CALLEE_SOURCE,
      [INVOKE_CALLER_NAME]: INVOKE_CALLER_SOURCE,
    });
    try {
      const pass = await runDispatchPass(workspace);

      // The warning-severity disposition, which this fix must leave alone:
      // `invocation.md` line 22 registers the parent of an `invoke(...)` literal.
      expect(
        pass.registered,
        "an `invoke(...)` literal is warning severity, so its parent must keep registering — " +
          `without it this cell has no drive. Registered: ${JSON.stringify(pass.registered)}`,
      ).toContain(INVOKE_CALLER_STEM);
      expect(
        pass.registered,
        "the callee's own unresolvable `.theta` entry un-registers it; that disposition is " +
          "correct at HEAD and is not this bug's subject",
      ).not.toContain("b0270callee");

      const notes = (await pass.drive(INVOKE_CALLER_STEM)).map(normalisePath);
      // The terminal outcome of `#driveCallee`'s `parseCallee === undefined` arm
      // (`src/extension/production-theta-producer.ts`, lines 3664-3672 of that
      // file), rendered by `renderLeafKindNote` (`src/runtime/err-note-render.ts`)
      // as `invoke of <path> failed (load_failure)`.
      expect(
        notes.some(
          (note) =>
            note.includes(`theta /${INVOKE_CALLER_STEM} returned Err: invoke of`) &&
            note.includes(`./${CALLEE_NAME}`) &&
            note.includes("failed (load_failure)"),
        ),
        "the dispatch gate must refuse a callee whose own `tools:` names a `.theta` path with " +
          "no file, so this drive ends in Err(InvokeInfraError { cause: 'load_failure' }). " +
          `Notes: ${JSON.stringify(notes)}`,
      ).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  // ── (D) containment owns the escaping entry, and only it ─────────────────

  it("(D) an EXISTING grandchild that escapes every discovery root keeps drawing only invoke-path-escape", async () => {
    // Bug 0270 §Fix constraint 6: `checkNestedToolsContainment` already judges
    // the callee's own `.theta` entries for discovery-root containment (bug
    // 0111), and an escaping entry draws `theta/load/invoke-path-escape`, not
    // `unresolvable-theta-path`. The widened read must not double-report. This
    // cell is green at HEAD and pins that outcome as the thing to preserve.
    const workspace = plantWorkspace(
      { [CALLEE_NAME]: ESCAPING_ENTRY_CALLEE_SOURCE, [CALLER_NAME]: CALLER_SOURCE },
      { [GRANDCHILD_NAME]: HEALTHY_GRANDCHILD_SOURCE },
    );
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireCalleeDropRoute(pass, INVOKE_PATH_ESCAPE_CODE, workspace.path(CALLEE_NAME));

      // The caller already refuses on this route, through the escape row at its
      // OWN file rather than through `callee-has-errors`.
      expect(
        errorCodesAt(pass, workspace.path(CALLER_NAME)),
        "the escaping-entry route must keep drawing exactly one caller-located code, and it " +
          `must not co-fire ${UNRESOLVABLE_THETA_PATH_CODE}\n${describeNotes(pass.notes)}`,
      ).toEqual([INVOKE_PATH_ESCAPE_CODE]);
      expect(
        allDiagnostics(pass.notes)
          .filter((d) => d.code === UNRESOLVABLE_THETA_PATH_CODE)
          .map((d) => normalisePath(d.file ?? "?")),
        `an entry whose file EXISTS must draw no ${UNRESOLVABLE_THETA_PATH_CODE} anywhere`,
      ).toEqual([]);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (D2)/(D3) exists, realpaths, cannot be read ──────────────────────────

  it("(D2) an EXISTING but UNREADABLE grandchild outside every root draws exactly one caller-located row, the read-failure route", async () => {
    // The corner where the two routes could double-report: `realpath` succeeds
    // on a DIRECTORY named `<name>.theta` while `readBytes` rejects `EISDIR`, so
    // the containment walk's own check would call it an escape while the
    // readability probe calls it unresolvable. Bug 0270 §Fix constraint 6 gives
    // the read precedence — `theta/load/unresolvable-theta-path`'s Trigger
    // (`code-registry-load.md` line 29) names a path that "does not exist or is
    // not readable" — and the containment walk therefore defers, exactly as the
    // depth-0 loop already does. Exactly ONE caller-located code.
    const workspace = plantWorkspace(
      { [CALLEE_NAME]: ESCAPING_UNREADABLE_CALLEE_SOURCE, [CALLER_NAME]: CALLER_SOURCE },
      {},
      [`outside/${UNREADABLE_DIR_NAME}`],
    );
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      // The premise: the callee's own pass reads the entry, the read fails, and
      // its own row is the read-failure route rather than an escape.
      requireCalleeDropRoute(
        pass,
        UNRESOLVABLE_THETA_PATH_CODE,
        workspace.path(CALLEE_NAME),
      );

      expect(
        errorCodesAt(pass, workspace.path(CALLER_NAME)),
        "the read failure owns this entry, so the caller draws the single " +
          `${CALLEE_HAS_ERRORS_CODE} row and never ${INVOKE_PATH_ESCAPE_CODE} as well\n` +
          describeNotes(pass.notes),
      ).toEqual([CALLEE_HAS_ERRORS_CODE]);
      expectCallerRefused(pass, workspace.path(CALLER_NAME), "b0270caller");
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  it("(D3) the same UNREADABLE grandchild INSIDE the roots: the caller refuses through the same single row", async () => {
    // Containment cannot fire at all here, so this cell isolates the read
    // failure's own disposition from the precedence question (D2) settles: the
    // caller refuses through one `callee-has-errors` row either way.
    const workspace = plantWorkspace(
      { [CALLEE_NAME]: CONTAINED_UNREADABLE_CALLEE_SOURCE, [CALLER_NAME]: CALLER_SOURCE },
      undefined,
      [UNREADABLE_DIR_NAME],
    );
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireCalleeDropRoute(
        pass,
        UNRESOLVABLE_THETA_PATH_CODE,
        workspace.path(CALLEE_NAME),
      );

      expect(
        errorCodesAt(pass, workspace.path(CALLER_NAME)),
        `the caller's single row on the read-failure route\n${describeNotes(pass.notes)}`,
      ).toEqual([CALLEE_HAS_ERRORS_CODE]);
      expectCallerRefused(pass, workspace.path(CALLER_NAME), "b0270caller");
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (E) the conservatism bound stays ─────────────────────────────────────

  it("(E) the non-recursion bound stays: a grandchild that EXISTS but has its own errors leaves the caller registering", async () => {
    // Bug 0270 §Fix constraint 4 and §Non-goals: the admitted check terminates
    // on the callee's own entries — it does not parse the grandchild, does not
    // read its mode and does not follow its `tools:`. Recursing here is
    // unbounded (a `tools:` cycle A↔B would not terminate), which is why the
    // stub exists. This withhold is bug 0271's neighbourhood, NOT this bug's
    // subject; pinning it keeps a fix for bug 0270 from silently over-refusing.
    const workspace = plantWorkspace({
      [GRANDCHILD_NAME]: BROKEN_GRANDCHILD_SOURCE,
      [CALLEE_NAME]: PRESENT_ENTRY_CALLEE_SOURCE,
      [CALLER_NAME]: CALLER_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireCalleeDropRoute(pass, CALLEE_HAS_ERRORS_CODE, workspace.path(CALLEE_NAME));

      expect(
        allDiagnostics(pass.notes)
          .filter((d) => d.severity === "error" && d.code === UNTERMINATED_TEMPLATE_CODE)
          .map((d) => normalisePath(d.file ?? "?")),
        "the grandchild's own parse error is the premise of this withhold",
      ).toEqual([workspace.path(GRANDCHILD_NAME)]);

      // The withheld decision, pinned as a withhold: the caller registers, and
      // NO row is located at its file.
      expect(
        pass.registered,
        "the non-recursion bound withholds here — the caller must keep registering until a " +
          `fix for bug 0271 changes it deliberately\n${describeNotes(pass.notes)}`,
      ).toEqual(["b0270caller"]);
      expect(
        errorCodesAt(pass, workspace.path(CALLER_NAME)),
        `no row may be located at the caller's file on the withheld route\n${describeNotes(pass.notes)}`,
      ).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });
});
