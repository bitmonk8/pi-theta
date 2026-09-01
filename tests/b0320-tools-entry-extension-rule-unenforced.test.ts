import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { composeExtensionInstance } from "../src/extension/production-composition";
import { RendererGate, SYSTEM_NOTE_CHANNEL } from "../src/extension/system-note-channel";
import type { ParsedTheta } from "../src/extension/reload-wiring";

// Bug 0320 — the `tools:` half of `theta/parse/invoke-non-theta-extension` is
// unenforced. The registry row's Trigger names two surfaces — "An `invoke(...)`
// literal or a `tools:` `.theta` entry whose path string does not end in
// `.theta`" (`docs/spec_topics/diagnostics/code-registry-parse.md` line 17) —
// but only the invoke-literal emitter exists. `resolveEntry`
// (`src/parser/callable-set.ts` line 379) has exactly two entry classes: a bare
// identifier (a Pi tool) and everything else (a `.theta` path). Its theta-path
// arm's first act (`src/parser/callable-set.ts` line 402-403) is the callee
// lookup `deps.resolveThetaCallee(spec)` — no extension check runs between
// `parseToolsEntry`'s open `<spec> ('as' <name>)?` grammar and callee
// resolution. So the disposition of a WRONG-EXTENSION `tools:` entry is decided
// by the named file's CONTENTS, not by the extension rule:
//   - a `.txt` whose bytes parse as a subagent theta REGISTERS SILENTLY (a live,
//     model-facing callable per `frontmatter-fields-a.md` line 74), and
//   - a valid `.thetalib` draws `theta/load/callee-has-errors` — a message
//     asserting the callee is broken when the callee is a perfectly valid
//     library and the defect is the entry's extension.
//
// SPEC ANCHORS (the disposition every cell asserts is the SPECIFIED one, not
// today's).
//   - `docs/spec_topics/diagnostics/code-registry-parse.md` line 17:
//     `theta/parse/invoke-non-theta-extension` (E, parse) fires for "a `tools:`
//     `.theta` entry whose path string does not end in `.theta`", "on the path
//     literal as written (no realpath normalisation)", byte-exact lowercase.
//     Message `invoke path '<path>' does not end in .theta` (read via the
//     DIAG-4 oracle below, never copied as prose).
//   - `docs/spec_topics/invocation.md` line 10: the extension "match is
//     byte-exact lowercase".
//   - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` line 79: `tools:`
//     `.theta` paths "must end in `.theta` — the extension match is byte-exact
//     lowercase"; line 74: the callable set is exposed "from both the model …
//     and from theta code", which is why a silently registered non-`.theta`
//     callable matters.
//
// EXPECTED END STATE (bug 0320 §Fix constraint 1, the settled fix): a `tools:`
// entry whose spec is not a bare identifier and does not end in byte-exact
// lowercase `.theta` must draw `theta/parse/invoke-non-theta-extension` (E) with
// the registry Message and un-register the caller, BEFORE any callee read or
// parse — the check goes in `resolveEntry`'s theta-path arm before
// `deps.resolveThetaCallee` (`callable-set.ts` line 403). Because
// `resolveCallableSet` pushes a `resolveEntry` diagnostic and `continue`s
// (`callable-set.ts` line 217-220), the extension row REPLACES whatever
// content-decided disposition each cell records at HEAD.
//
// TIER: unit — offline, provider-free, deterministic. Host doubles only; no
// provider, no child process, no live model. The seam is one classifier inside
// the shipped composition root, and `composeExtensionInstance` over planted
// files reaches it directly, so no integration or live tier is needed. The
// harness (`makeHost` / `plantWorkspace` / `runLoadPass` and the observation
// helpers) is modelled on, and DUPLICATED FROM rather than shared with,
// `tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`
// (bug 0270's landed witness), which this file neither reads from nor mutates.
//
// PATH SEPARATORS: Win32 `\` and POSIX `/` spell the same file differently;
// every path comparison separator-normalises both sides first.
//
// DIAG-4: the expected Message is read out of the shipped PARSE registry page
// (this code is a `theta/parse/*` code, NOT a load code) through
// `registryMessage`, so registry drift reds here instead of comparing against a
// stale sentence. A missing row throws naming the page — never a skip.
//
// No silent skipping: an unmet precondition (registry row absent, composition
// root never driven) THROWS naming itself.

// ── Codes ───────────────────────────────────────────────────────────────────

const INVOKE_NON_THETA_EXTENSION_CODE = "theta/parse/invoke-non-theta-extension";
/** Bug 0111's containment route, which the extension check must preempt (cell H). */
const INVOKE_PATH_ESCAPE_CODE = "theta/load/invoke-path-escape";
const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";
const UNRESOLVABLE_THETA_PATH_CODE = "theta/load/unresolvable-theta-path";

// ── Fixtures (bug 0320 §Reproduction / §Summary table) ───────────────────────

/** A prompt-mode caller carrying one `tools:` entry; the body is its tail expression. */
function promptCaller(entry: string): string {
  return "---\nmode: prompt\ntools:\n" + `  - ${entry}\n---\n@\`hi\`\n`;
}

/** Row 1's masquerading file: a `.txt` whose bytes parse as a valid subagent theta. */
const MASQ_TXT_SOURCE = "---\nmode: subagent\ndescription: masq callee\n---\nlet a = 1\n";

/** Row 2's library: a valid `.thetalib` the `import` surface would accept. */
const HELPER_THETALIB_SOURCE = "fn double(x: number): number { x * 2 }\n";

/** A valid subagent `.theta` callee, for the extension-conformant control cells. */
const VALID_SUBAGENT_CALLEE_SOURCE =
  "---\nmode: subagent\ndescription: b0320 callee\n---\nlet a = 1\n";

// ── Registry oracle (DIAG-4) ─────────────────────────────────────────────────

interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  message: string;
}

// This code is a `theta/parse/*` code, so its Message lives on the PARSE page,
// not the load page bug 0270's neighbour reads.
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/**
 * The row's normative Message (DIAG-4) as a regex with the `<placeholder>` slots
 * opened. Throws naming the registry page when the row is absent, so registry
 * drift can never degrade a presence assertion into a comparison against
 * `undefined`.
 */
function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      "harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for " +
        `${code} — the DIAG-4 column is this file's only message oracle, so a missing row is a ` +
        "harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}

// ── Host doubles ─────────────────────────────────────────────────────────────

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

// ── The workspace ─────────────────────────────────────────────────────────────

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
 * (`.pi/theta/`), exactly as bug 0320 §Reproduction does. One workspace per cell
 * keeps every decision attributable to that cell's file set. A minimal
 * `settings.json` pins the settings read to a known value (an absent file is
 * silent, so the plant is hermeticity, not noise suppression).
 */
function plantWorkspace(files: Readonly<Record<string, string>>): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0320-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, ".pi", "theta", name), body, "utf8");
  }
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}

// ── The load pass ─────────────────────────────────────────────────────────────

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

// ── Observation helpers ───────────────────────────────────────────────────────

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

/** The composition root must have been driven at all before any decision means anything. */
function requireDriven(pass: LoadPass): void {
  if (pass.notes.length === 0 && pass.registered.length === 0) {
    throw new Error(
      "harness: the composition root neither registered a theta nor put anything on the " +
        "theta-system-note channel — the bug-0320 fixture no longer reaches the load pass, " +
        "so nothing below is verified",
    );
  }
}

/**
 * Bug 0320 §Fix constraint 1: a wrong-extension `tools:` entry un-registers the
 * caller and draws an error-severity `theta/parse/invoke-non-theta-extension`
 * row at the CALLER's file carrying the registry Message. This is the SPECIFIED
 * disposition, red at HEAD wherever the content-decided one differs.
 */
function expectExtensionRefusal(
  pass: LoadPass,
  callerPath: string,
  callerName: string,
): void {
  expect(
    pass.registered,
    "a wrong-extension `tools:` entry must un-register the caller\n" + describeNotes(pass.notes),
  ).not.toContain(callerName);

  const rows = allDiagnostics(pass.notes).filter(
    (d) =>
      d.code === INVOKE_NON_THETA_EXTENSION_CODE &&
      d.severity === "error" &&
      normalisePath(d.file ?? "") === callerPath,
  );
  expect(
    rows.length,
    `error-severity ${INVOKE_NON_THETA_EXTENSION_CODE} rows at the caller's file: ` +
      `${rows.length}\n${describeNotes(pass.notes)}`,
  ).toBeGreaterThanOrEqual(1);
  expect(
    (rows[0] as Diagnostic).message,
    `${INVOKE_NON_THETA_EXTENSION_CODE} message`,
  ).toMatch(normativeMessagePattern(INVOKE_NON_THETA_EXTENSION_CODE));
}

/** The channel discipline every cell holds: nothing off the note channel, no host toasts. */
function expectQuietChannels(pass: LoadPass): void {
  expect(pass.notified).toEqual([]);
  expect(pass.offChannel).toEqual([]);
}

describe("bug 0320 — a `tools:` entry naming a non-`.theta` path must draw invoke-non-theta-extension", () => {
  // ── (A) the masquerading `.txt` ────────────────────────────────────────────

  it("(A) `tools: ./masq.txt as masq` whose file parses as a subagent theta: caller refuses, does not register silently", async () => {
    const caller = "b0320-caller-a.theta";
    const workspace = plantWorkspace({
      "b0320-masq-a.txt": MASQ_TXT_SOURCE,
      [caller]: promptCaller("./b0320-masq-a.txt as masq"),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      // HEAD reality (bug 0320 §Summary row 1): the caller REGISTERS with ZERO
      // diagnostics — silent permissive acceptance of a live callable over a
      // non-`.theta` file. `resolveEntry`'s theta-path arm (`callable-set.ts`
      // line 402-403) resolves `./b0320-masq-a.txt` by its literal path and
      // never looks at the extension, so `pass.registered` is
      // `["b0320-caller-a"]` and `errorCodesAt` is `[]` at HEAD.
      expectExtensionRefusal(pass, workspace.path(caller), "b0320-caller-a");
      expect(
        errorCodesAt(pass, workspace.path(caller)),
        `the extension row is the caller's only error code\n${describeNotes(pass.notes)}`,
      ).toEqual([INVOKE_NON_THETA_EXTENSION_CODE]);
      // The masquerading `.txt` is not itself a discoverable `.theta`, so after
      // the fix un-registers the caller nothing registers at all.
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expectQuietChannels(pass);
    } finally {
      workspace.dispose();
    }
  });

  // ── (B) the valid `.thetalib` mislabelled as a callee ──────────────────────

  it("(B) `tools: ./helper.thetalib as helper` draws the parse extension row, NOT callee-has-errors", async () => {
    const caller = "b0320-caller-b.theta";
    const workspace = plantWorkspace({
      "b0320-helper-b.thetalib": HELPER_THETALIB_SOURCE,
      [caller]: promptCaller("./b0320-helper-b.thetalib as helper"),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      // HEAD reality (bug 0320 §Summary row 2): the wrong-extension entry falls
      // through to callee parsing, the valid library fails to parse as a theta,
      // and the caller draws `theta/load/callee-has-errors` with an empty
      // `related` — a diagnostic that is a lie in both fields. The fix REPLACES
      // that row with the parse extension row (§Fix constraint 1), so
      // callee-has-errors must be ABSENT for this caller.
      expectExtensionRefusal(pass, workspace.path(caller), "b0320-caller-b");
      expect(
        errorCodesAt(pass, workspace.path(caller)),
        "the extension row replaces callee-has-errors; the related-empty lie is gone\n" +
          describeNotes(pass.notes),
      ).toEqual([INVOKE_NON_THETA_EXTENSION_CODE]);
      expect(
        allDiagnostics(pass.notes).some((d) => d.code === CALLEE_HAS_ERRORS_CODE),
        `${CALLEE_HAS_ERRORS_CODE} must not fire for a wrong-extension entry\n` +
          describeNotes(pass.notes),
      ).toBe(false);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expectQuietChannels(pass);
    } finally {
      workspace.dispose();
    }
  });

  // ── (C) control — the invoke-literal twin, unchanged ───────────────────────

  it("(C) control — `invoke(\"./masq.txt\")?` in a body keeps drawing invoke-non-theta-extension (green at HEAD)", async () => {
    // The conformant surface bug 0320 §Non-goals leaves untouched. The parse
    // error fires on the path literal as written at load time (bug 0320
    // §Reproduction observed this note on the channel through the same
    // `composeExtensionInstance` path), so the file behind the literal is never
    // read and need not exist. This cell is GREEN at HEAD and must stay green.
    const caller = "b0320-invcaller-c.theta";
    const workspace = plantWorkspace({
      [caller]: "---\nmode: prompt\n---\ninvoke(\"./b0320-masq-c.txt\")?\n",
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      expectExtensionRefusal(pass, workspace.path(caller), "b0320-invcaller-c");
      expect(
        errorCodesAt(pass, workspace.path(caller)),
        `the invoke-literal twin's single row\n${describeNotes(pass.notes)}`,
      ).toEqual([INVOKE_NON_THETA_EXTENSION_CODE]);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expectQuietChannels(pass);
    } finally {
      workspace.dispose();
    }
  });

  // ── (D) controls — no behaviour change for the conformant arms ─────────────

  it("(D1) control — a bare-identifier Pi-tool entry `tools: read` keeps its HEAD disposition (registers clean)", async () => {
    // `resolveEntry`'s bare-identifier arm (`callable-set.ts` line 384) is the
    // Pi-tool route the extension check must not touch (bug 0320 §Fix constraint
    // 3). The shipped composition root supplies the host Pi tools, so `read`
    // resolves and the caller registers with no diagnostic at HEAD; the check
    // is scoped to non-bare specs, so this is unchanged after the fix.
    const caller = "b0320-caller-d1.theta";
    const workspace = plantWorkspace({ [caller]: promptCaller("read") });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      expect(pass.registered, describeNotes(pass.notes)).toContain("b0320-caller-d1");
      expect(
        errorCodesAt(pass, workspace.path(caller)),
        `a bare-identifier Pi-tool entry draws no error\n${describeNotes(pass.notes)}`,
      ).toEqual([]);
      expect(
        allDiagnostics(pass.notes).some((d) => d.code === INVOKE_NON_THETA_EXTENSION_CODE),
        "a bare-identifier entry must never draw the path-extension row",
      ).toBe(false);
      expectQuietChannels(pass);
    } finally {
      workspace.dispose();
    }
  });

  it("(D2) control — a `.theta`-suffixed entry `tools: ./callee.theta as callee` registers cleanly (green at HEAD)", async () => {
    // The byte-exact-lowercase `.theta` case that PASSES the rule (bug 0320
    // §Fix constraint 3): caller and callee both register with no diagnostic,
    // unchanged by the fix.
    const caller = "b0320-caller-d2.theta";
    const workspace = plantWorkspace({
      "b0320-callee-d2.theta": VALID_SUBAGENT_CALLEE_SOURCE,
      [caller]: promptCaller("./b0320-callee-d2.theta as callee"),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      expect([...pass.registered].sort(), describeNotes(pass.notes)).toEqual([
        "b0320-callee-d2",
        "b0320-caller-d2",
      ]);
      expect(
        allDiagnostics(pass.notes).map(
          (d) => `${d.severity} ${d.code} @ ${normalisePath(d.file ?? "?")}`,
        ),
        "a valid `.theta` entry must draw no diagnostic anywhere",
      ).toEqual([]);
      expectQuietChannels(pass);
    } finally {
      workspace.dispose();
    }
  });

  // ── (E) byte-exact lowercase ───────────────────────────────────────────────

  it("(E) uppercase `tools: ./CALLEE.THETA as callee` must refuse — the extension match is byte-exact lowercase", async () => {
    // `.THETA`.endsWith(".theta") is false, mirroring the invoke-literal twin's
    // exact casing semantics (`invocation.md` line 10; `frontmatter-fields-a.md`
    // line 79). HEAD resolves the file by its literal path on a case-insensitive
    // FS and the caller REGISTERS clean (only the discovery non-canonical-
    // extension WARNING lands at the callee file), so `pass.registered` is
    // `["b0320-caller-eup"]` and no error sits at the caller at HEAD.
    const caller = "b0320-caller-eup.theta";
    const workspace = plantWorkspace({
      "b0320-callee-up.THETA": MASQ_TXT_SOURCE,
      [caller]: promptCaller("./b0320-callee-up.THETA as callee"),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      expectExtensionRefusal(pass, workspace.path(caller), "b0320-caller-eup");
      expect(
        errorCodesAt(pass, workspace.path(caller)),
        `the uppercase-extension entry's single caller-located error\n${describeNotes(pass.notes)}`,
      ).toEqual([INVOKE_NON_THETA_EXTENSION_CODE]);
      expect(pass.registered, describeNotes(pass.notes)).not.toContain("b0320-caller-eup");
      // The discovery non-canonical-extension warning is at the callee file,
      // not the caller, so it does not disturb the caller-scoped assertions or
      // the channel discipline (it is on-channel).
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  it("(E) lowercase `tools: ./callee.theta as callee` passes byte-exact — registers cleanly (green at HEAD)", async () => {
    const caller = "b0320-caller-elo.theta";
    const workspace = plantWorkspace({
      "b0320-callee-lo.theta": VALID_SUBAGENT_CALLEE_SOURCE,
      [caller]: promptCaller("./b0320-callee-lo.theta as callee"),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      expect(pass.registered, describeNotes(pass.notes)).toContain("b0320-caller-elo");
      expect(
        errorCodesAt(pass, workspace.path(caller)),
        `a byte-exact lowercase .theta entry draws no error\n${describeNotes(pass.notes)}`,
      ).toEqual([]);
      expectQuietChannels(pass);
    } finally {
      workspace.dispose();
    }
  });

  // ── (F) precedence — extension check before the callee FS read ─────────────

  it("(F) `tools: ./missing.txt as m` (file absent) draws invoke-non-theta-extension, NOT unresolvable-theta-path", async () => {
    // Bug 0320 §Fix constraint 1: the extension check runs BEFORE any callee
    // read (`frontmatter-fields-a.md` line 79 — the parse-time literal check).
    // At HEAD the entry falls straight into `deps.resolveThetaCallee`, which
    // returns `undefined` for the absent file and draws
    // `theta/load/unresolvable-theta-path` (`callable-set.ts` line 405-414) —
    // the wrong code, and evidence the FS read ran first.
    const caller = "b0320-caller-f.theta";
    const workspace = plantWorkspace({ [caller]: promptCaller("./b0320-missing-f.txt as m") });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      expectExtensionRefusal(pass, workspace.path(caller), "b0320-caller-f");
      expect(
        errorCodesAt(pass, workspace.path(caller)),
        "the extension check wins before the FS read, so no unresolvable-theta-path fires\n" +
          describeNotes(pass.notes),
      ).toEqual([INVOKE_NON_THETA_EXTENSION_CODE]);
      expect(
        allDiagnostics(pass.notes).some((d) => d.code === UNRESOLVABLE_THETA_PATH_CODE),
        `${UNRESOLVABLE_THETA_PATH_CODE} must not fire — the extension check precedes the read`,
      ).toBe(false);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expectQuietChannels(pass);
    } finally {
      workspace.dispose();
    }
  });

  // ── (G) the rule holds in both grammar shapes ──────────────────────────────

  it("(G) a wrong-extension entry refuses identically bare and aliased (`as name`)", async () => {
    // `parseToolsEntry` accepts `<spec>` and `<spec> as <name>`; the extension
    // rule must fire on the spec regardless of the alias. HEAD dispositions
    // differ by shape — bare `./masq.txt` derives the invalid default name
    // `b0320_masq_g.txt` and draws `theta/load/invalid-derived-tool-name`, while
    // aliased `./masq.txt as masq` registers clean — yet both must land on the
    // one extension row after the fix (which returns from `resolveEntry` before
    // name derivation runs).
    const bareCaller = "b0320-caller-gbare.theta";
    const bareWorkspace = plantWorkspace({
      "b0320-masq-g.txt": MASQ_TXT_SOURCE,
      [bareCaller]: promptCaller("./b0320-masq-g.txt"),
    });
    try {
      const pass = await runLoadPass(bareWorkspace);
      requireDriven(pass);
      expectExtensionRefusal(pass, bareWorkspace.path(bareCaller), "b0320-caller-gbare");
      expect(
        errorCodesAt(pass, bareWorkspace.path(bareCaller)),
        `bare-shape refusal draws only the extension row\n${describeNotes(pass.notes)}`,
      ).toEqual([INVOKE_NON_THETA_EXTENSION_CODE]);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expectQuietChannels(pass);
    } finally {
      bareWorkspace.dispose();
    }

    const aliasCaller = "b0320-caller-galias.theta";
    const aliasWorkspace = plantWorkspace({
      "b0320-masq-g.txt": MASQ_TXT_SOURCE,
      [aliasCaller]: promptCaller("./b0320-masq-g.txt as masq"),
    });
    try {
      const pass = await runLoadPass(aliasWorkspace);
      requireDriven(pass);
      expectExtensionRefusal(pass, aliasWorkspace.path(aliasCaller), "b0320-caller-galias");
      expect(
        errorCodesAt(pass, aliasWorkspace.path(aliasCaller)),
        `aliased-shape refusal draws only the extension row\n${describeNotes(pass.notes)}`,
      ).toEqual([INVOKE_NON_THETA_EXTENSION_CODE]);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expectQuietChannels(pass);
    } finally {
      aliasWorkspace.dispose();
    }
  });

  // ── (H) extension check precedes containment ───────────────────────────────

  it("(H) a wrong-extension entry that also escapes the roots draws the extension row, NOT invoke-path-escape", async () => {
    // The extension check is a parse-time literal check (`code-registry-parse.md`
    // §`invoke-non-theta-extension`: "on the path literal as written") and the
    // fix places it before any callee read or containment walk. So a spec that
    // is BOTH wrong-extension and escaping draws only the extension row — the
    // containment route (`theta/load/invoke-path-escape`, bug 0111) never sees
    // the entry because the pre-parse `calleeCache` loop is skipped for it. This
    // locks the ordering the fix's second placement in `resolveThetaToolsAtLoad`
    // creates. The named file need not exist: the literal check precedes
    // resolution, so no FS read for it occurs.
    const caller = "b0320-caller-h.theta";
    const escapingSpec = "../b0320-escape.txt";
    const workspace = plantWorkspace({
      [caller]: promptCaller(`${escapingSpec} as esc`),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      expectExtensionRefusal(pass, workspace.path(caller), "b0320-caller-h");
      expect(
        errorCodesAt(pass, workspace.path(caller)),
        `the escaping wrong-extension entry draws only the extension row\n${describeNotes(pass.notes)}`,
      ).toEqual([INVOKE_NON_THETA_EXTENSION_CODE]);
      // Containment must NOT co-fire anywhere: the extension check preempts it.
      expect(
        allDiagnostics(pass.notes).map((d) => d.code),
        `no ${INVOKE_PATH_ESCAPE_CODE} may co-fire\n${describeNotes(pass.notes)}`,
      ).not.toContain(INVOKE_PATH_ESCAPE_CODE);
      // DIAG-4, exact substitution: the message is the registry template with
      // `<path>` filled by the literal as written (not merely pattern-matched).
      const row = allDiagnostics(pass.notes).find(
        (d) => d.code === INVOKE_NON_THETA_EXTENSION_CODE,
      );
      expect(row?.message).toBe(
        (registryMessage(REGISTRY, INVOKE_NON_THETA_EXTENSION_CODE) as string).replace(
          "<path>",
          escapingSpec,
        ),
      );
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expectQuietChannels(pass);
    } finally {
      workspace.dispose();
    }
  });
});
