import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { composeExtensionInstance } from "../src/extension/production-composition";
import { RendererGate, SYSTEM_NOTE_CHANNEL } from "../src/extension/system-note-channel";
import type { ParsedTheta } from "../src/extension/reload-wiring";

// Bug 0280 — FILED SYMPTOM: a `tools:` entry naming a PROMPT-mode `.theta`
// un-registers the file that declares it at every depth, but that verdict never
// reaches a caller below depth 1: every caller above the namer registers a
// callable byte-identical to the healthy control's and carries no row on its
// own file. These cells encode the disposition §Expected behaviour states.
//
// THE TWO BARRIERS. The transitive walk reads a callee's declared mode nowhere
// below depth 1, and could not act on it if it did.
//   - `calleeFailsOwnStructuralChecksBody` (`src/extension/production-composition.ts`)
//     resolves the frame's own `tools:` entries through a stub whose
//     `resolveThetaCallee` discriminates readability alone and answers
//     `mode: "subagent"` for every readable `.theta` spec. `resolveEntry`
//     (`src/parser/callable-set.ts`) tests `resolved.mode === "prompt"`, so the
//     constant makes `theta/load/prompt-mode-callable` unreachable inside the
//     recursion. Depth 1 escapes this because `resolveThetaToolsAtLoad` pre-parses
//     each callee through `parseCalleeForTools`, which reads the real
//     frontmatter mode and hands it to the real `resolveThetaCallee`.
//   - The same frame's verdict admits two codes — `theta/load/unknown-tool` and
//     `theta/load/unresolvable-theta-path` — so a stub reporting the real mode
//     would still fold to `fails: false`. Both components move together or the
//     verdict does not compose.
// The mechanism that must carry it exists: bug 0275's deep fold
// `recursive.fails || recursive.ownEscapes` already carries a frame-local
// component to every caller above the immediate one, and the V15f
// `theta/load/callee-has-errors` loop in `resolveThetaToolsAtLoad` is the site
// that puts the caller's row on the caller's own file.
//
// SPEC ANCHORS.
//   - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` line 79: a `tools:`
//     `.theta` entry must point at a subagent-mode file, and a prompt-mode
//     callee there is `theta/load/prompt-mode-callable`. That is a structural
//     check of the file DECLARING the entry, which is why the namer's row sits
//     at the namer's own file at every depth.
//   - `docs/spec_topics/invocation.md` line 20 (§Static resolution): a `.theta`
//     path named by a callee's own `tools:` is judged "for its own parse and its
//     own structural checks in turn, transitively, to whatever depth the
//     `tools:` graph reaches", and an own-structural-check failure "composes
//     into `theta/load/callee-has-errors` at every caller above that immediate
//     caller, however far below such a caller the escaping entry sits". The
//     same line's sentence "A `.theta` path's own declared mode is outside this
//     walk at every depth" states the unfixed implementation and contradicts
//     the measured rows; bug 0280 §Fix constraint 6 withdraws it here and at
//     `docs/reference/discovery-cli.md` line 270.
//   - `docs/spec_topics/invocation.md` line 22 (per-surface severity): a callee
//     that fails its own structural checks is *not statically resolvable*, and
//     on the `tools:` surface "the callable cannot be created, and the parent
//     theta does not register". Applied to cell (B) that settles the root; to
//     cell (C) the child and the root.
//   - `docs/spec_topics/diagnostics/code-registry-load.md` line 30 —
//     `theta/load/prompt-mode-callable`, `E`, load, whose Trigger names the
//     ENTRY and not the depth of the file declaring it. Line 42 —
//     `theta/load/callee-has-errors`, already ERR-6-classified through
//     `preEvalCauseOf`'s `tools-resolution` batch, is the callers' row. Bug 0280
//     §Expected behaviour mints no new registry code, so none is asserted here.
//   - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` line 74: `tools`
//     declares the callable set exposed "from both the model … and from theta
//     code", which is why a silently registered dead callable surfaces inside a
//     model turn after the caller has spent tokens.
//
// WHAT THIS FILE PINS. One cell per bug 0280 §Reproduction row:
//   (A) depth-1 control: the root's own entry names a prompt-mode child. The
//       root refuses carrying exactly one `theta/load/prompt-mode-callable` at
//       its own file and the child registers. Landed behaviour, and the
//       ANTI-DOUBLE-REPORT LOCK for §Fix constraint 2.
//   (B) depth 2: the child's own entry names a prompt-mode grandchild. The
//       child keeps the single mode row; the root carries
//       `theta/load/callee-has-errors` and registers no `child` callable. The
//       central claim.
//   (C) depth 3: the grandchild's own entry names a prompt-mode
//       great-grandchild, so BOTH the child and the root carry
//       `theta/load/callee-has-errors`. Forbids an implementation hard-coded to
//       depth two.
//   (D) control — three healthy levels, no prompt-mode entry: all three register
//       and no diagnostic lands anywhere, so no cell above can pass by refusing
//       everything. It also pins the frozen `child` entry cells (B) and (E)
//       forbid the root to mint.
//   (E) the same shape as (B) under a SUBAGENT-mode root: the caller's own mode
//       is not an input to the verdict.
// §Fix constraint 2 is asserted in every cell: exactly one error-severity
// `theta/load/prompt-mode-callable` row lands per pass, at the namer's file, and
// each caller's row set is exactly `[theta/load/callee-has-errors]` — never a
// second mode row.
//
// §Fix constraint 4 (containment precedes content) and the depth-1 cells named
// in §Non-goals are outside this file; nothing here plants an out-of-root path.
//
// TIER: unit — offline, provider-free, deterministic. Host doubles only; no
// provider, no child process, no live model. The seam is one stub and one
// verdict filter inside the shipped composition root, and
// `composeExtensionInstance` over planted files reaches both directly while
// exposing the registration decisions on `wiring.thetas`, so neither an
// integration nor a live tier is needed. The harness (`makeHost` /
// `plantWorkspace` / `runLoadPass`) is modelled on, and duplicated from rather
// than shared with, `tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts`,
// which this file neither reads from nor mutates.
//
// PATH SEPARATORS. Two walks spell the same file differently, so every path
// comparison below separator-normalises both sides first.
//
// CLOSURE HASHES. Cell (D) pins the entry SHAPE and the `sha256:` form, never a
// literal digest: RFC-0005's closure scope covers the child plus its transitive
// `.thetalib` imports, not the grandchild, so the hash cannot separate a
// prompt-mode grandchild from a healthy one. What separates the cells is the
// registration decision and the diagnostic rows.
//
// DIAG-4. Expected messages are read out of the shipped registry pages through
// `registryMessage`, never copied as prose, so registry drift reds here instead
// of silently comparing against a stale sentence.
//
// No silent skipping: a cell whose precondition is unmet (registry row absent,
// host double never driven, the mode route no longer firing at the namer)
// throws naming the precondition.

// ── Codes ───────────────────────────────────────────────────────────────────

const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";
const PROMPT_MODE_CODE = "theta/load/prompt-mode-callable";

// ── Fixtures (bug 0280 §Reproduction) ───────────────────────────────────────

const ROOT_NAME = "b0280scratchroot.theta";
const ROOT_STEM = "b0280scratchroot";
const CHILD_NAME = "b0280scratchchild.theta";
const CHILD_STEM = "b0280scratchchild";
const GC_NAME = "b0280scratchgrand.theta";
const GC_STEM = "b0280scratchgrand";
const GGC_NAME = "b0280scratchggc.theta";
const GGC_STEM = "b0280scratchggc";

/** The prompt-mode shape: a prompt body, optionally naming its own `tools:`. */
function promptSource(label: string, entry?: { spec: string; alias: string }): string {
  const tools =
    entry === undefined ? "" : `tools:\n  - ${entry.spec} as ${entry.alias}\n`;
  return `---\nmode: prompt\ndescription: b0280 ${label}\n${tools}---\n@\`hi\`\n`;
}

/** The subagent-mode shape: a clean body, optionally naming its own `tools:`. */
function subagentSource(label: string, entry?: { spec: string; alias: string }): string {
  const tools =
    entry === undefined ? "" : `tools:\n  - ${entry.spec} as ${entry.alias}\n`;
  return `---\nmode: subagent\ndescription: b0280 ${label}\n${tools}---\nlet a = 1\n`;
}

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
 * slots opened up. Throws naming the registry pages when the row is absent, so
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
    sendMessage: (message: { customType: string; content: string; details: unknown }): void => {
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
 * (`.pi/theta/`), exactly as bug 0280 §Reproduction does. One workspace per cell
 * keeps every decision below attributable to that cell's file set.
 */
function plantWorkspace(files: Readonly<Record<string, string>>): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0280-"));
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
  const wiring = await composeExtensionInstance(host.pi, host.ctx, undefined, new RendererGate());
  return {
    notes: host.notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL),
    offChannel: host.notes.filter((n) => n.customType !== SYSTEM_NOTE_CHANNEL),
    notified: host.notified,
    registered: wiring.thetas.map((t) => t.slashName),
    thetas: wiring.thetas,
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

/** Error-severity rows the pass located at `file`, in emission order. */
function errorRowsAt(pass: LoadPass, file: string): readonly Diagnostic[] {
  return allDiagnostics(pass.notes).filter(
    (d) => d.severity === "error" && normalisePath(d.file ?? "") === file,
  );
}

/** Files at which the pass located an error-severity row of `code`, sorted. */
function errorFilesOf(pass: LoadPass, code: string): readonly string[] {
  return allDiagnostics(pass.notes)
    .filter((d) => d.severity === "error" && d.code === code)
    .map((d) => normalisePath(d.file ?? "?"))
    .sort();
}

/** The host double must have been driven at all before any decision means anything. */
function requireDriven(pass: LoadPass): void {
  if (pass.notes.length === 0 && pass.registered.length === 0) {
    throw new Error(
      "harness: the composition root neither registered a theta nor put anything on the " +
        "theta-system-note channel — the bug-0280 fixture no longer reaches the load pass, " +
        "so nothing below is verified",
    );
  }
}

/**
 * The premise every cell rests on, and bug 0280 §Fix constraint 2 in one
 * assertion: the mode route fired this pass at EXACTLY the file whose own
 * `tools:` entry names the prompt-mode callee, and nowhere else. Bug 0280's
 * claim is about the levels above that row, so a namer without it means the
 * fixture stopped exercising the route; a second file with it means a caller
 * gained a mode row where `theta/load/callee-has-errors` belongs.
 */
function requireSingleModeRowAtNamer(pass: LoadPass, namerPath: string): void {
  const modeFiles = errorFilesOf(pass, PROMPT_MODE_CODE);
  if (!modeFiles.includes(namerPath)) {
    throw new Error(
      `harness: no error-severity ${PROMPT_MODE_CODE} row is located at the entry's own file ` +
        `${namerPath} — that row is the premise of every assertion below, so its absence is a ` +
        `harness failure, never a skip. Mode rows at: ${modeFiles.join(", ") || "(none)"}\n` +
        describeNotes(pass.notes),
    );
  }
  expect(
    [...modeFiles],
    `one prompt-mode entry is one condition: ${PROMPT_MODE_CODE} belongs at the declaring ` +
      `file alone, and callers above it carry ${CALLEE_HAS_ERRORS_CODE} instead\n` +
      describeNotes(pass.notes),
  ).toEqual([namerPath]);
  const rows = allDiagnostics(pass.notes).filter(
    (d) => d.severity === "error" && d.code === PROMPT_MODE_CODE,
  );
  expect((rows[0] as Diagnostic).message, `${PROMPT_MODE_CODE} message`).toMatch(
    normativeMessagePattern(PROMPT_MODE_CODE),
  );
}

/**
 * `docs/spec_topics/invocation.md` line 22 at each `tools:` edge above the
 * namer: the caller does not register, and EXACTLY ONE error-severity row is
 * located at its file — the V15f `theta/load/callee-has-errors` push carrying
 * the registry's Message. One entry names one callee, so one row; §Fix
 * constraint 2 forbids a second beside it.
 */
function expectCallerRefusedWithCalleeHasErrors(
  pass: LoadPass,
  callerPath: string,
  callerStem: string,
): void {
  expect(
    pass.registered,
    "the caller must not register over a callee this same pass un-registers\n" +
      describeNotes(pass.notes),
  ).not.toContain(callerStem);

  const rows = errorRowsAt(pass, callerPath);
  expect(
    rows.map((d) => d.code),
    `one prompt-mode entry below this caller is one condition, so exactly one error-severity ` +
      `row belongs at ${callerPath}, and it is ${CALLEE_HAS_ERRORS_CODE}\n` +
      describeNotes(pass.notes),
  ).toEqual([CALLEE_HAS_ERRORS_CODE]);
  expect((rows[0] as Diagnostic).message, `${CALLEE_HAS_ERRORS_CODE} message`).toMatch(
    normativeMessagePattern(CALLEE_HAS_ERRORS_CODE),
  );
}

/** The `tools:` snapshot entry a registered theta froze under `alias`. */
function frozenEntry(
  pass: LoadPass,
  stem: string,
  alias: string,
): { kind?: string; mode?: string; calleePath?: string; closureHash?: string } | undefined {
  const theta = pass.thetas.find((t) => t.slashName === stem);
  if (theta === undefined) return undefined;
  return theta.callableSet?.entries.get(alias) as
    | { kind?: string; mode?: string; calleePath?: string; closureHash?: string }
    | undefined;
}

describe("bug 0280 — a callee's declared prompt mode is never read below the immediate callee", () => {
  // ── (A) depth-1 control ──────────────────────────────────────────────────

  it("(A) depth-1 control — the root's own entry names a prompt-mode child: one row, at the root", async () => {
    // The landed disposition and the ANTI-DOUBLE-REPORT LOCK. `resolveEntry`
    // raises the mode row against the file that declares the entry, and the
    // prompt-mode child is itself a well-formed theta, so it registers. A route
    // that satisfies the deeper cells by adding a second row here reds.
    const workspace = plantWorkspace({
      [ROOT_NAME]: promptSource("root", { spec: `./${CHILD_NAME}`, alias: "child" }),
      [CHILD_NAME]: promptSource("child"),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireSingleModeRowAtNamer(pass, workspace.path(ROOT_NAME));

      expect(
        errorRowsAt(pass, workspace.path(ROOT_NAME)).map((d) => d.code),
        `the entry's own declaring file carries exactly one row, ${PROMPT_MODE_CODE}\n` +
          describeNotes(pass.notes),
      ).toEqual([PROMPT_MODE_CODE]);
      expect(
        errorFilesOf(pass, CALLEE_HAS_ERRORS_CODE),
        `the child breaks no check of its own, so ${CALLEE_HAS_ERRORS_CODE} has no subject on ` +
          `this fixture\n${describeNotes(pass.notes)}`,
      ).toEqual([]);
      expect([...pass.registered], describeNotes(pass.notes)).toEqual([CHILD_STEM]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (B) depth 2: the central claim ───────────────────────────────────────

  it("(B) the child's entry names a prompt-mode grandchild: the root refuses and mints no callable", async () => {
    // The child fails a structural check of its own — the same pass records it,
    // at the child's own file, under `theta/load/prompt-mode-callable` — so
    // `docs/spec_topics/invocation.md` line 22 settles the root as REFUSAL AT
    // LOAD. Two registration decisions over the child in one pass must agree
    // (bug 0271 §Fix constraint 1).
    const workspace = plantWorkspace({
      [ROOT_NAME]: promptSource("root", { spec: `./${CHILD_NAME}`, alias: "child" }),
      [CHILD_NAME]: subagentSource("child", { spec: `./${GC_NAME}`, alias: "grand" }),
      [GC_NAME]: promptSource("grandchild"),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireSingleModeRowAtNamer(pass, workspace.path(CHILD_NAME));

      expect(
        errorRowsAt(pass, workspace.path(CHILD_NAME)).map((d) => d.code),
        `the entry's own declaring file keeps exactly one row, ${PROMPT_MODE_CODE}\n` +
          describeNotes(pass.notes),
      ).toEqual([PROMPT_MODE_CODE]);

      expectCallerRefusedWithCalleeHasErrors(pass, workspace.path(ROOT_NAME), ROOT_STEM);
      expect(
        [...errorFilesOf(pass, CALLEE_HAS_ERRORS_CODE)],
        `${CALLEE_HAS_ERRORS_CODE} composes to every caller above the namer\n` +
          describeNotes(pass.notes),
      ).toEqual([workspace.path(ROOT_NAME)]);

      // The grandchild is a well-formed prompt theta and registers on its own
      // account; the callable it may not be reached THROUGH is the root's.
      expect([...pass.registered], describeNotes(pass.notes)).toEqual([GC_STEM]);
      expect(
        frozenEntry(pass, ROOT_STEM, "child"),
        "a refused root freezes no `child` callable — the entry the model and theta code " +
          "would otherwise see is the dead one\n" + describeNotes(pass.notes),
      ).toBeUndefined();
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (C) depth 3: the silence spans two levels ────────────────────────────

  it("(C) the grandchild's entry names a prompt-mode great-grandchild: child and root both refuse", async () => {
    // The disposition is POSITIONAL, not depth-2-specific: the mode row stays at
    // the declaring file wherever it sits, and the span the deep verdict must
    // cover grows with the chain. This cell forbids an implementation hard-coded
    // to depth two.
    const workspace = plantWorkspace({
      [ROOT_NAME]: promptSource("root", { spec: `./${CHILD_NAME}`, alias: "child" }),
      [CHILD_NAME]: subagentSource("child", { spec: `./${GC_NAME}`, alias: "grand" }),
      [GC_NAME]: subagentSource("grandchild", { spec: `./${GGC_NAME}`, alias: "g3" }),
      [GGC_NAME]: promptSource("great-grandchild"),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireSingleModeRowAtNamer(pass, workspace.path(GC_NAME));

      expectCallerRefusedWithCalleeHasErrors(pass, workspace.path(CHILD_NAME), CHILD_STEM);
      expectCallerRefusedWithCalleeHasErrors(pass, workspace.path(ROOT_NAME), ROOT_STEM);
      expect(
        [...errorFilesOf(pass, CALLEE_HAS_ERRORS_CODE)],
        `${CALLEE_HAS_ERRORS_CODE} composes by induction to both callers above the namer\n` +
          describeNotes(pass.notes),
      ).toEqual([workspace.path(CHILD_NAME), workspace.path(ROOT_NAME)].sort());

      expect([...pass.registered], describeNotes(pass.notes)).toEqual([GGC_STEM]);
      expect(
        frozenEntry(pass, CHILD_STEM, "grand"),
        "a refused child freezes no `grand` callable\n" + describeNotes(pass.notes),
      ).toBeUndefined();
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (D) the healthy three-level control ──────────────────────────────────

  it("(D) control — no prompt-mode entry anywhere: root, child and grandchild all register", async () => {
    const workspace = plantWorkspace({
      [ROOT_NAME]: promptSource("root", { spec: `./${CHILD_NAME}`, alias: "child" }),
      [CHILD_NAME]: subagentSource("child", { spec: `./${GC_NAME}`, alias: "grand" }),
      [GC_NAME]: subagentSource("grandchild"),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      expect([...pass.registered].sort(), describeNotes(pass.notes)).toEqual(
        [CHILD_STEM, GC_STEM, ROOT_STEM].sort(),
      );
      expect(
        allDiagnostics(pass.notes).map(
          (d) => `${d.severity} ${d.code} @ ${normalisePath(d.file ?? "?")}`,
        ),
        "a healthy three-level chain must draw no diagnostic anywhere",
      ).toEqual([]);

      // The frozen `tools:` snapshot cells (B) and (E) forbid the root to mint —
      // there the root does not register at all — and the one this control
      // requires it to keep minting when every callee is subagent-mode.
      const entry = frozenEntry(pass, ROOT_STEM, "child");
      expect(entry, "the root's frozen callable set carries no `child` entry").toBeDefined();
      expect(entry?.kind).toBe("theta");
      expect(entry?.mode).toBe("subagent");
      expect(entry?.calleePath).toBe(`./${CHILD_NAME}`);
      expect(typeof entry?.closureHash, "load-time closure hash").toBe("string");
      expect(entry?.closureHash, "load-time closure hash shape").toMatch(/^sha256:[0-9a-f]{64}$/);

      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (E) the caller's own mode is not an input ────────────────────────────

  it("(E) the same chain under a subagent-mode root: the outcome is identical to (B)", async () => {
    // The verdict is a function of the callee graph, not of the caller's
    // frontmatter. This cell exists so an implementation cannot satisfy (B) by
    // discriminating prompt-mode roots.
    const workspace = plantWorkspace({
      [ROOT_NAME]: subagentSource("root", { spec: `./${CHILD_NAME}`, alias: "child" }),
      [CHILD_NAME]: subagentSource("child", { spec: `./${GC_NAME}`, alias: "grand" }),
      [GC_NAME]: promptSource("grandchild"),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireSingleModeRowAtNamer(pass, workspace.path(CHILD_NAME));

      expectCallerRefusedWithCalleeHasErrors(pass, workspace.path(ROOT_NAME), ROOT_STEM);
      expect(
        [...errorFilesOf(pass, CALLEE_HAS_ERRORS_CODE)],
        `${CALLEE_HAS_ERRORS_CODE} composes to every caller above the namer\n` +
          describeNotes(pass.notes),
      ).toEqual([workspace.path(ROOT_NAME)]);

      expect([...pass.registered], describeNotes(pass.notes)).toEqual([GC_STEM]);
      expect(
        frozenEntry(pass, ROOT_STEM, "child"),
        "a refused root freezes no `child` callable\n" + describeNotes(pass.notes),
      ).toBeUndefined();
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });
});
