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
import {
  RendererGate,
  SYSTEM_NOTE_CHANNEL,
} from "../src/extension/system-note-channel";

// Bug 0264 — a malformed `.thetalib` (or a callee `.theta`) puts its lex rows on
// the `theta-system-note` channel once per PARSING WALK, not once per file per
// load pass.
//
// `lexTheta` (`src/lexer/lexer.ts`) hands its diagnostics to the V7d producer
// seam (`emitDiagnosticBatch`) and then returns the same array, so every walk
// that parses a file causes one delivery of that file's lex rows — whether or
// not the walk reads `document.diagnostics`. The walks that re-parse a file
// already parsed in the same pass are:
//   - `parseThetaLib`, the inner cache of `checkThetaImports`
//     (`src/extension/import-static-checks.ts`): its `parseCache` is built per
//     call, so it dedups within ONE importer and not across importers;
//   - the import-check drop group — `checkThetaImports` copies each
//     registration-error row of the parsed library into its returned
//     `diagnostics` (filter `isRegistrationError`) and `runComposePass`
//     (`src/extension/production-composition.ts`) emits that array wholesale
//     through `sink.emitGroup`, re-delivering the objects the lexer already
//     delivered;
//   - `visit` inside `collectCallableClosureSources`
//     (`src/extension/production-composition.ts`), which re-parses each closure
//     member and never reads `document.diagnostics`;
//   - `parseCalleeForTools` (`src/extension/production-composition.ts`), which
//     parses the callee and then reads only `document.frontmatter` /
//     `hasLoadParseError`.
//
// Bug 0255's landed identity filter (`ThetaDocument.deliveredDiagnostics`, read
// in `parseDiscoveredTheta`'s drop arm) removes the second delivery at ONE site
// only — the primary discovery parse — which is why the counts below still
// scale with the walk count.
//
// SPEC ANCHORS.
//   - `docs/spec_topics/diagnostics/diagnostic-shape.md` line 65 (§Multi-error
//     reporting): every parse / type pass collects all errors from the full file
//     "(and from transitive `.thetalib` imports)" and reports them "with the
//     complete list in **one `pi.sendMessage` call per `.theta` file**". The
//     rule's unit is the FILE, so a library reached by two importers and by a
//     closure walk in one pass still yields one delivery of its rows.
//   - `docs/spec_topics/diagnostics/diagnostic-shape.md` line 24 (§Re-scan
//     deduplication) licenses re-emission across a watcher-triggered reload,
//     i.e. across load passes. Every count below is inside ONE
//     `composeExtensionInstance` pass, so the carve-out does not reach it.
//   - `docs/spec_topics/diagnostics/diagnostic-shape.md` line 63 (serialised
//     content format): each `Diagnostic` renders as one line block.
//   - Bug 0264 §Fix constraint 1 (no silent drop): the surviving delivery must
//     still carry the registry code and the DIAG-4 Message. Each cell therefore
//     asserts PRESENCE of code + registry Message beside the counts, so a fix
//     that silences a walk without proving another site delivers reds here
//     instead of passing as a silent drop.
//
// WHAT THIS FILE PINS (bug 0264 §Fix constraint 6 — EXACT occurrence counts, one
// per row per file per pass, never a lower bound), with the counts measured at
// HEAD `616c6d0e` (v0.258.0) in parentheses:
//   (A) library + ONE importer            — lex row 1 (HEAD 2), parse row 1 (HEAD 1)
//   (B) same library + TWO importers      — lex row 1 (HEAD 4), parse row 1 (HEAD 2)
//   (C) library imported by a subagent-mode callee named in a prompt-mode
//       caller's `tools:`                 — lex row 1 (HEAD 3), parse row 1 (HEAD 1)
//   (D) malformed `.theta` BOTH discovered AND named by a caller's `tools:`
//                                         — lex row 1 (HEAD 2), parse row 1 (HEAD 1)
// The parse-phase row of the same file is the non-regression control: it is
// already 1 at HEAD in (A), (C) and (D) — its delivery is the drop group's alone
// — and 2 in (B), one per importer. Both are pinned to the same
// one-per-file-per-pass expectation, so an over-broad dedup that suppresses a
// drop group wholesale reds here as a silent drop.
//
// Registration decisions are pinned beside the counts (bug 0264 §Expected
// behaviour: "the drop/registration decisions are unchanged").
//
// COUNTING BY NORMALISED RENDERING. In (C) and (D) two walks spell the SAME file
// differently — the discovery / import walk emits the separator-normalised path
// and the closure / callee walk emits the Win32-separator path — so a raw
// exact-string occurrence count sees two distinct lines and would not red. The
// oracle below therefore separator-normalises both the note content and the
// expected line before counting, and counts the structural rows by
// (normalised file, line, column, code). The path-spelling divergence itself is
// an explicit bug 0264 §Non-goal and is NOT asserted on.
//
// Offline, provider-free, deterministic: host doubles only, no provider, no
// child process. The host doubles and the fixture-planting shape are MODELLED ON
// (duplicated from, not shared with) `tests/lex-drop-single-delivery.test.ts`,
// which is bug 0255's protected witness and is not read from or mutated by this
// file. That file drives the PRIMARY-parse double delivery of a discovered
// `.theta` and asserts nothing about a re-parse walk, so it neither witnesses
// nor blocks this bug.
//
// No silent skipping: an unmet precondition (registry row absent, fixture no
// longer producing the expected phase mix, host double never called) throws
// naming itself.

// ── Fixtures (bug 0264 §Reproduction) ───────────────────────────────────────

const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";
const UNSUPPORTED_FEATURE_CODE = "theta/parse/unsupported-feature";
const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";

/**
 * The malformed library: one LEX-phase row (`unterminated-template`, from the
 * backtick that runs to end of file) plus one PARSE-phase row
 * (`unsupported-feature`, the same backtick in value position). The two phases
 * in one file are what makes the lex/parse asymmetry measurable.
 */
const LIB_SOURCE = "fn f() {\n  let t = `unterminated\n  return 1\n}\nexport { f }\n";

/** A prompt-mode importer of the library — the shape that drives one walk. */
const IMPORTER_SOURCE =
  '---\nmode: prompt\n---\nimport { f } from "./b0264lib.thetalib"\nlet a = f()\n';

/** A subagent-mode callee that imports the library; reachable as a `tools:` entry. */
const CALLEE_IMPORTER_SOURCE =
  '---\nmode: subagent\ndescription: b0264 callee\n---\n' +
  'import { f } from "./b0264lib.thetalib"\nlet a = f()\n';

/** The (D) fixture: a malformed subagent-mode `.theta`, discovered on its own. */
const MALFORMED_CALLEE_SOURCE =
  "---\nmode: subagent\ndescription: b0264 bad callee\n---\nlet t = `unterminated\nlet a = 1\n";

/** A prompt-mode caller naming a callee in `tools:`. */
function callerSource(calleeStem: string): string {
  return `---\nmode: prompt\ntools:\n  - ./${calleeStem}.theta as callee\n---\n@\`hi\`\n`;
}

// ── Registry oracle (DIAG-4) ────────────────────────────────────────────────

interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  message: string;
}

const REGISTRY = [
  "code-registry-parse.md",
  "code-registry-load.md",
].flatMap((page) =>
  parseRegistry(
    readFileSync(
      fileURLToPath(
        new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
      ),
      "utf8",
    ),
  ) as RegistryRow[],
);

/**
 * The row's normative *Message* (DIAG-4), as a regex with the `<placeholder>`
 * slots opened up. Throws naming the registry page when the row is absent, so
 * registry drift can never degrade a constraint-1 presence assertion into a
 * comparison against `undefined`.
 */
function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      `harness: the docs/spec_topics/diagnostics/ registry pages carry no Message row for ` +
        `${code} — the DIAG-4 column is this file's only message oracle for the bug 0264 ` +
        `§Fix constraint-1 presence guard, so a missing row is a harness failure, never a skip`,
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}

// ── Host doubles (modelled on tests/lex-drop-single-delivery.test.ts) ────────

type PiHandler = (event: unknown, ctx: ExtensionContext) => unknown;

interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly details: unknown;
}

interface HostDouble {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  /** `pi.sendMessage` envelopes the host accepted. */
  readonly notes: RecordedNote[];
  /** `ctx.ui.notify` deliveries the host accepted. */
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
  /** The discovery-root `ctx.cwd` points at. */
  readonly cwd: string;
  /** Absolute, separator-normalised path of a planted fixture file. */
  path: (name: string) => string;
  readonly dispose: () => void;
}

/**
 * Plant the named fixture files on the conventional project source
 * (`.pi/theta/`), exactly as bug 0264 §Reproduction does. One workspace per cell
 * keeps every count below attributable to that cell's file set.
 */
function plantWorkspace(files: Readonly<Record<string, string>>): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0264-"));
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
    path: (name: string): string =>
      normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}

interface LoadPass {
  /** Every `theta-system-note` the pass put on the channel, in order. */
  readonly notes: readonly RecordedNote[];
  /** `pi.sendMessage` envelopes on any other customType (expected: none). */
  readonly offChannel: readonly RecordedNote[];
  readonly notified: readonly (readonly [string, string])[];
  /** Slash names the pass actually registered. */
  readonly registered: readonly string[];
}

/**
 * Drive the SHIPPED composition root over the planted workspace with an
 * UNDEGRADED `RendererGate`, so every note takes the transcript
 * (`pi.sendMessage`) arm and the counts below are the counts the author reads.
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
  };
}

// ── Observation helpers ─────────────────────────────────────────────────────

/** Separator-normalise a path so Win32 `\` and POSIX `/` spellings compare. */
function normalisePath(path: string): string {
  return path.replace(/\\/g, "/");
}

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

/**
 * The diagnostic's rendered FIRST line — `<file>:<line>:<col>: <code>: <message>`
 * (`docs/spec_topics/diagnostics/diagnostic-shape.md` line 63) — with the file
 * separator-normalised. The hint / related continuations are excluded so the
 * count below measures line occurrences, not note lengths.
 */
function headLine(diagnostic: Diagnostic): string {
  const { file, range, code, message } = diagnostic;
  const spelling = file === undefined ? undefined : normalisePath(file);
  if (spelling !== undefined && range !== undefined) {
    return `${spelling}:${range.start.line}:${range.start.column}: ${code}: ${message}`;
  }
  return spelling !== undefined
    ? `${spelling}: ${code}: ${message}`
    : `${code}: ${message}`;
}

/** The position key a duplicate delivery shares: file + start position + code. */
function positionKey(diagnostic: Diagnostic): string {
  const file = diagnostic.file === undefined ? "" : normalisePath(diagnostic.file);
  const range = diagnostic.range;
  const at =
    range === undefined ? "" : `${range.start.line}:${range.start.column}`;
  return `${file}@${at}#${diagnostic.code}`;
}

/**
 * Occurrences of `needle` across every note's `content`, separator-normalised
 * before comparison so the two spellings of one file that (C) and (D) produce
 * collapse into one counted line.
 */
function renderedOccurrences(
  notes: readonly RecordedNote[],
  needle: string,
): number {
  const hay = notes.map((n) => normalisePath(n.content)).join("\n");
  let count = 0;
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at === -1) {
      return count;
    }
    count += 1;
    from = at + needle.length;
  }
}

/** Structural counterpart of the rendered count: rows sharing one position key. */
function structuralOccurrences(
  notes: readonly RecordedNote[],
  row: Diagnostic,
): number {
  const key = positionKey(row);
  return allDiagnostics(notes).filter((d) => positionKey(d) === key).length;
}

function describeNotes(notes: readonly RecordedNote[]): string {
  return notes.length === 0
    ? "[] (NO NOTE ON THE CHANNEL)"
    : notes.map((n, i) => `[${i}] ${n.content}`).join("\n");
}

/**
 * The one source row the pass produced for `code`, deduplicated by normalised
 * rendered line. Fails loudly when the fixture produced none — a fixture that
 * stopped exercising its phase is a harness failure, never a silent pass.
 */
function soleRow(notes: readonly RecordedNote[], code: string): Diagnostic {
  const rows = allDiagnostics(notes).filter((d) => d.code === code);
  if (rows.length === 0) {
    expect.fail(
      `harness: no ${code} row reached the channel — the bug-0264 fixture no longer ` +
        `exercises its phase, so nothing below is verified. Notes:\n${describeNotes(notes)}`,
    );
  }
  const lines = new Set(rows.map(headLine));
  expect(
    lines.size,
    `${code} delivered under ${lines.size} distinct normalised rendered lines; ` +
      `expected one source row\n${describeNotes(notes)}`,
  ).toBe(1);
  return rows[0] as Diagnostic;
}

/**
 * The constraint-1 presence oracle plus the constraint-6 exact count, for one
 * row of one file: the row is present with its registry code, severity, file and
 * DIAG-4 Message, and it reaches the channel EXACTLY once in this pass.
 */
function expectDeliveredExactlyOnce(
  pass: LoadPass,
  code: string,
  file: string,
): Diagnostic {
  const row = soleRow(pass.notes, code);
  expect(row.severity, `${code} severity`).toBe("error");
  expect(normalisePath(row.file ?? ""), `${code} file`).toBe(file);
  expect(row.message, `${code} message`).toMatch(normativeMessagePattern(code));
  expect(
    renderedOccurrences(pass.notes, headLine(row)),
    `${code} rendered deliveries\n${describeNotes(pass.notes)}`,
  ).toBe(1);
  expect(
    structuralOccurrences(pass.notes, row),
    `${code} structural deliveries\n${describeNotes(pass.notes)}`,
  ).toBe(1);
  return row;
}

/** The host double must have been driven at all before any count means anything. */
function requireDriven(pass: LoadPass): void {
  if (pass.notes.length === 0) {
    throw new Error(
      "harness: the composition root put NOTHING on the theta-system-note channel — " +
        "the bug-0264 fixture no longer reaches the diagnostic channel, so no count " +
        "below is verified",
    );
  }
}

describe("bug 0264 — a malformed .thetalib's rows reach the channel once per file per pass", () => {
  // ── (A) library + ONE importer ─────────────────────────────────────────────

  it("(A) library + one importer: the lex row is delivered exactly once", async () => {
    const workspace = plantWorkspace({
      "b0264lib.thetalib": LIB_SOURCE,
      "b0264one.theta": IMPORTER_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      const lib = workspace.path("b0264lib.thetalib");

      // HEAD: 3 notes, the lex row delivered TWICE — once by `lexTheta` under
      // `parseThetaLib`, once by the import-check drop group.
      expectDeliveredExactlyOnce(pass, UNTERMINATED_TEMPLATE_CODE, lib);
      // Non-regression control: the parse-phase row of the SAME file. Its only
      // delivery is the drop group's, so it is already 1 at HEAD; pinning it
      // makes an over-broad dedup red as a silent drop.
      expectDeliveredExactlyOnce(pass, UNSUPPORTED_FEATURE_CODE, lib);

      expect(pass.registered).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (B) same library + TWO importers ──────────────────────────────────────

  it("(B) library + two importers: the lex row is still delivered exactly once", async () => {
    const workspace = plantWorkspace({
      "b0264lib.thetalib": LIB_SOURCE,
      "b0264one.theta": IMPORTER_SOURCE,
      "b0264two.theta": IMPORTER_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      const lib = workspace.path("b0264lib.thetalib");

      // HEAD: 6 notes, the lex row delivered FOUR times — the (A) pair once per
      // importing `.theta`, because `parseThetaLib`'s cache is per
      // `checkThetaImports` call and not per pass.
      expectDeliveredExactlyOnce(pass, UNTERMINATED_TEMPLATE_CODE, lib);
      // Control: at HEAD the parse-phase row is delivered TWICE here, once per
      // importer's drop group. The rule's unit is the file, so it is pinned to
      // the same 1 as the lex row.
      expectDeliveredExactlyOnce(pass, UNSUPPORTED_FEATURE_CODE, lib);

      expect(pass.registered).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (C) library imported by a `tools:` callee ─────────────────────────────

  it("(C) library imported by a subagent-mode `tools:` callee: the lex row is delivered exactly once", async () => {
    const workspace = plantWorkspace({
      "b0264lib.thetalib": LIB_SOURCE,
      "b0264callee.theta": CALLEE_IMPORTER_SOURCE,
      "b0264caller.theta": callerSource("b0264callee"),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      const lib = workspace.path("b0264lib.thetalib");

      // HEAD: 4 notes, the lex row delivered THREE times — the (A) pair plus the
      // closure walk `visit` inside `collectCallableClosureSources`, whose
      // delivery spells the library's path with Win32 separators, which is why
      // the oracle normalises before counting (bug 0264 §Non-goals keeps the
      // path-spelling divergence itself out of scope).
      expectDeliveredExactlyOnce(pass, UNTERMINATED_TEMPLATE_CODE, lib);
      // Control: the parse-phase row is already 1 at HEAD in this cell.
      expectDeliveredExactlyOnce(pass, UNSUPPORTED_FEATURE_CODE, lib);

      // Registration decision. Bug 0264's fix left this pin at
      // ["b0264caller"] — the caller registered while the importing callee did
      // not. Bug 0267 is the claim that the pinned value was wrong: a `tools:`
      // `.theta` entry pointing at a callee that fails its own structural
      // checks is error severity, "the callable cannot be created, and the
      // parent theta does not register"
      // (docs/spec_topics/invocation.md, §Static resolution, line 22). The
      // callee's `.thetalib` import resolution is one of those structural
      // checks, so BOTH files un-register here and the caller carries
      // `theta/load/callee-has-errors` at its own `tools:` site. Moved under
      // bug 0267 §Fix constraint 7, which names this pin as its subject; bug
      // 0264's note-count assertions above are the same file's other subject
      // and are left intact.
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (D) malformed `.theta` discovered AND named in `tools:` ───────────────

  it("(D) malformed .theta both discovered and named in `tools:`: the lex row is delivered exactly once", async () => {
    const workspace = plantWorkspace({
      "b0264bad.theta": MALFORMED_CALLEE_SOURCE,
      "b0264caller.theta": callerSource("b0264bad"),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      const bad = workspace.path("b0264bad.theta");
      const caller = workspace.path("b0264caller.theta");

      // HEAD: 4 notes, the lex row delivered TWICE — once by the discovery parse
      // in `parseDiscoveredTheta` (whose drop-arm duplicate bug 0255 already
      // filters), once by `parseCalleeForTools` under `resolveThetaToolsAtLoad`.
      // The two deliveries spell the same file with DIFFERENT separators, so the
      // count is taken over the normalised rendering, not the raw string.
      expectDeliveredExactlyOnce(pass, UNTERMINATED_TEMPLATE_CODE, bad);
      // Control: the parse-phase row of the same file is already 1 at HEAD.
      expectDeliveredExactlyOnce(pass, UNSUPPORTED_FEATURE_CODE, bad);
      // The caller's own load row still reaches the author exactly once: the
      // registration decision and its diagnostic are unchanged by the fix.
      expectDeliveredExactlyOnce(pass, CALLEE_HAS_ERRORS_CODE, caller);

      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });
});
