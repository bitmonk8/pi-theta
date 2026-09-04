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

// Bug 0255 — a dropped theta's LEX-phase diagnostics reach the
// `theta-system-note` channel TWICE, because two independent delivery sites see
// the same array and neither owns the delivery decision:
//
//   route 1 — `lexTheta` emits its own batch through the V7d producer-facing
//     seam: `emitDiagnosticBatch(diagnostics, deps)` (src/lexer/lexer.ts:131)
//     and then RETURNS the same array (src/lexer/lexer.ts:133).
//   route 2 — the returned rows land in `document.diagnostics`
//     (src/parser/theta-document.ts:904), `parseDiscoveredTheta` hands them back
//     as the drop group (src/extension/production-composition.ts:3352), and the
//     compose pass delivers that group — `sink.emitGroup(parsed.dropped)`
//     (src/extension/production-composition.ts:844) → `emitLoadNoteGroup`
//     (src/extension/production-composition.ts:1462–1479), which routes each
//     error-severity member per-diagnostic through the pre-eval router.
//
// Both channels are built off the same `pi.sendMessage` seam — the parse-time
// channel's `buildSystemNoteDeps` call in `runComposePass` and the
// load-diagnostic `loadSink`/`channel` pair — so the author reads every lex row
// twice, while the parse-phase rows of the same file appear once.
//
// SPEC ANCHORS.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:65 — Multi-error
//     reporting: a rejected theta is reported "with the complete list in **one
//     `pi.sendMessage` call per `.theta` file** … rather than fast-failing on
//     the first error or fanning out one message per error". Two sites each
//     satisfying that rule locally violate it jointly.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:63 — Serialised content
//     format: within one batched note "each `Diagnostic` becomes one such line
//     block and successive blocks are separated by a single blank line".
//   - FM-3 / DIAG-1 (the drop path at
//     src/extension/production-composition.ts:3313–3325: "surface the load/parse
//     diagnostics that un-registered this theta") — every dropped row must
//     still reach the author WITH its registry code and message. Bug 0255 §Fix
//     constraint 1 makes this exact-one, never at-most-one: the guards below
//     therefore assert PRESENCE of code + registry Message beside the counts, so
//     a fix that silences a route without proving the survivor delivers reds
//     here rather than passing as a silent drop.
//
// WHAT THIS FILE PINS (bug 0255 §Fix constraint 5 — an EXACT note count, not a
// lower bound, for a single-row and a multi-row lex drop, driven through the
// SHIPPED composition root `composeExtensionInstance`, red while either route
// double-delivers):
//   (1) single-row lex drop  → EXACTLY 1 note   (HEAD: 2)
//   (2) multi-row lex drop   → EXACTLY 2 notes  (HEAD: 4) — one batched note
//       carrying BOTH lex rows blank-line separated, plus the one parse-phase
//       note; each rendered line appearing exactly once.
//   (3) non-regression controls: a parse-phase-only drop still delivers exactly
//       once (over-suppression guard), and a theta that REGISTERS draws no
//       diagnostic note at all.
//   (4) constraint-1 guard: the lex rows are still PRESENT with their registry
//       code and DIAG-4 Message.
//
// Offline, provider-free, deterministic: host doubles only, no provider, no
// child process. The host doubles are MODELLED ON (duplicated from, not shared
// with) tests/extension-bootstrap-sink-liveness.test.ts — `makeHost`
// (:186–251) and `plantMalformedTheta` (:741–757) — because that file is bug
// 0023's protected witness and is not mutated by this one. That file's element-2
// cell (:759–791) drives the same block-comment path but asserts channel
// ROUTING with `toContain`, never delivery counts, so it neither witnesses nor
// blocks this duplication.
//
// No silent skipping: an unmet precondition (registry row absent, fixture no
// longer producing the expected phase mix) throws naming itself.

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Frontmatter prelude — occupies source lines 1–3; every body starts at line 4. */
const FM = "---\nmode: prompt\n---\n";

const BLOCK_COMMENT_CODE = "theta/parse/block-comment";
const STRAY_BACKSLASH_CODE = "theta/parse/stray-backslash";
const RESERVED_KEYWORD_CODE = "theta/parse/reserved-keyword-as-identifier";
const LET_WITHOUT_INITIALISER_CODE = "theta/parse/let-without-initialiser";

/**
 * One LEX row, one file (bug 0255 §Reproduction (A), row 2). The block comment
 * is rejected by the whole-file lexer; the `let` that follows is well-formed, so
 * the parse phase adds nothing and the file's whole diagnostic set is lex-phase.
 */
const SINGLE_LEX_BODY = '/* c */\nlet a = "x"';

/**
 * TWO lex rows plus ONE parse row (bug 0255 §Reproduction (C)) — the shape that
 * exposes the `n` lex rows → `n + 1` notes law and the two different groupings
 * the author sees for one file: route 1's batched note interleaved with route
 * 2's per-diagnostic re-deliveries.
 */
const MULTI_LEX_BODY = "let a = \\\nlet match = 1";

/**
 * A PARSE-phase-only drop: the lexer accepts every token, and the missing
 * initialiser is diagnosed above it. The over-suppression control — this row has
 * only ONE delivery route (route 2), so any dedup that keys on the drop group
 * wholesale rather than on already-delivered rows silences it and reds here.
 */
const PARSE_ONLY_BODY = "let a: integer";

/** A theta that REGISTERS: no diagnostic of any severity, so no note at all. */
const CLEAN_BODY = 'let greeting = "hi"';

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
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as RegistryRow[];

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
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ` +
        `${code} — the DIAG-4 column is this file's only message oracle for the bug 0255 ` +
        `§Fix constraint-1 presence guard, so a missing row is a harness failure, never a skip`,
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}

// ── Host doubles (modelled on tests/extension-bootstrap-sink-liveness.test.ts) ─

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
  /**
   * The planted `.theta`'s absolute path (the `<file>` half of every rendered
   * line), SEPARATOR-NORMALISED: discovery joins its walk with `/` even on
   * Win32, so the comparison is on the normalised spelling rather than on the
   * platform separator, which is not this bug's subject.
   */
  readonly thetaPath: string;
  readonly dispose: () => void;
}

/**
 * Plant ONE `.theta` on the conventional project source (`.pi/theta/`), exactly
 * as bug 0255 §Reproduction does. One theta per workspace keeps every note count
 * below attributable to a single file, which is the unit
 * diagnostic-shape.md:65's rule is stated in.
 */
function plantTheta(stem: string, body: string): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0255-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  const thetaPath = join(cwd, ".pi", "theta", `${stem}.theta`);
  writeFileSync(thetaPath, `${FM}${body}\n`, "utf8");
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md
  // §Failure modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    thetaPath: normalisePath(thetaPath),
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

// Bug 0268 pins one separator convention (POSIX forward slash) at the
// rendering / delivery seam, so `row.file` below is compared verbatim rather
// than normalised: `normalisePath` is retained ONLY to build the expected
// fixture literal (`plantTheta`'s `thetaPath`), which starts from a native
// path and must state the same pinned spelling the channel now guarantees.
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
 * The diagnostic's rendered FIRST line — `<file>:<line>:<col>: <code>:
 * <message>` (diagnostic-shape.md:63). The hint / related continuations are
 * excluded so the count below measures line occurrences, not note lengths.
 */
function headLine(diagnostic: Diagnostic): string {
  const { file, range, code, message } = diagnostic;
  if (file !== undefined && range !== undefined) {
    return `${file}:${range.start.line}:${range.start.column}: ${code}: ${message}`;
  }
  return file !== undefined
    ? `${file}: ${code}: ${message}`
    : `${code}: ${message}`;
}

/** Occurrences of `needle` across every note's `content`, concatenated. */
function renderedOccurrences(
  notes: readonly RecordedNote[],
  needle: string,
): number {
  const hay = notes.map((n) => n.content).join("\n");
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

function describeNotes(notes: readonly RecordedNote[]): string {
  return notes.length === 0
    ? "[] (NO NOTE ON THE CHANNEL)"
    : notes.map((n, i) => `[${i}] ${n.content}`).join("\n");
}

/**
 * The one diagnostic the pass produced for `code`, deduplicated by rendered
 * line. Fails loudly when the fixture produced none — a fixture that stopped
 * exercising its phase is a harness failure, never a silent pass.
 */
function soleRow(
  notes: readonly RecordedNote[],
  code: string,
): Diagnostic {
  const rows = allDiagnostics(notes).filter((d) => d.code === code);
  if (rows.length === 0) {
    expect.fail(
      `harness: no ${code} row reached the channel — the bug-0255 fixture no longer ` +
        `exercises its phase, so nothing below is verified. Notes:\n${describeNotes(notes)}`,
    );
  }
  const lines = new Set(rows.map(headLine));
  expect(
    lines.size,
    `${code} delivered under ${lines.size} distinct rendered lines; expected one source row`,
  ).toBe(1);
  return rows[0] as Diagnostic;
}

// ── (1) Single-row lex drop ─────────────────────────────────────────────────

describe("bug 0255 — a dropped theta's lex rows reach the channel exactly once", () => {
  it("single lex row: exactly ONE theta-system-note, and its rendered line appears exactly once", async () => {
    const workspace = plantTheta("b0255-single-lex", SINGLE_LEX_BODY);
    try {
      const pass = await runLoadPass(workspace);

      // Constraint 1 (FM-3 / DIAG-1) first: the row must still be PRESENT with
      // its registry code and Message. A fix that silences route 1
      // (src/lexer/lexer.ts:131) without proving route 2
      // (src/extension/production-composition.ts:844) delivers reds here rather
      // than passing the count assertion below on a silent drop.
      const row = soleRow(pass.notes, BLOCK_COMMENT_CODE);
      expect(row.severity).toBe("error");
      expect(row.file ?? "").toBe(workspace.thetaPath);
      expect(row.message).toMatch(normativeMessagePattern(BLOCK_COMMENT_CODE));

      // diagnostic-shape.md:65 — one `pi.sendMessage` per `.theta` file. At HEAD
      // this is 2: route 1's batch plus route 2's per-diagnostic re-delivery.
      expect(pass.notes.length, describeNotes(pass.notes)).toBe(1);
      expect(
        renderedOccurrences(pass.notes, headLine(row)),
        describeNotes(pass.notes),
      ).toBe(1);
      expect(allDiagnostics(pass.notes)).toHaveLength(1);

      // The theta is dropped, and the undegraded gate keeps every note on the
      // transcript arm (nothing toasts, nothing rides another customType).
      expect(pass.registered).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (2) Multi-row lex drop ────────────────────────────────────────────────

  it("two lex rows + one parse row: exactly TWO notes — one blank-line-separated lex batch, one parse row", async () => {
    const workspace = plantTheta("b0255-multi-lex", MULTI_LEX_BODY);
    try {
      const pass = await runLoadPass(workspace);

      const backslash = soleRow(pass.notes, STRAY_BACKSLASH_CODE);
      const reserved = soleRow(pass.notes, RESERVED_KEYWORD_CODE);
      const letRow = soleRow(pass.notes, LET_WITHOUT_INITIALISER_CODE);
      // Constraint 1 again, per row.
      expect(backslash.message).toMatch(
        normativeMessagePattern(STRAY_BACKSLASH_CODE),
      );
      expect(reserved.message).toMatch(
        normativeMessagePattern(RESERVED_KEYWORD_CODE),
      );
      expect(letRow.message).toMatch(
        normativeMessagePattern(LET_WITHOUT_INITIALISER_CODE),
      );

      // At HEAD this is 4 (§Reproduction (C)): route 1's two-row batch, the
      // parse-phase note, and route 2's two per-diagnostic re-deliveries.
      expect(pass.notes.length, describeNotes(pass.notes)).toBe(2);

      // Each rendered line appears exactly once across the whole channel —
      // including the parse-phase row, whose single delivery is the asymmetry
      // this bug measures and must not regress.
      for (const row of [backslash, reserved, letRow]) {
        expect(
          renderedOccurrences(pass.notes, headLine(row)),
          `${row.code}\n${describeNotes(pass.notes)}`,
        ).toBe(1);
      }
      expect(allDiagnostics(pass.notes)).toHaveLength(3);

      // diagnostic-shape.md:63 — the two lex rows travel in ONE note, as line
      // blocks separated by a single blank line, in source order. Bug 0013's
      // severity split (production-composition.ts:1462–1479) keeps the
      // parse-phase error on its own per-diagnostic note; §Fix constraint 3
      // forbids collapsing that split, so exactly one note carries two rows and
      // exactly one carries one.
      const lexBatch = pass.notes.filter((n) => noteDiagnostics(n).length === 2);
      expect(lexBatch.length, describeNotes(pass.notes)).toBe(1);
      expect((lexBatch[0] as RecordedNote).content).toContain(
        `${headLine(backslash)}\n\n${headLine(reserved)}`,
      );
      const parseNote = pass.notes.filter((n) => noteDiagnostics(n).length === 1);
      expect(parseNote.length, describeNotes(pass.notes)).toBe(1);
      expect((parseNote[0] as RecordedNote).content).toContain(
        headLine(letRow),
      );

      expect(pass.registered).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (3) Non-regression controls ───────────────────────────────────────────

  it("control: a parse-phase-only drop still delivers exactly once (no over-suppression)", async () => {
    const workspace = plantTheta("b0255-parse-only", PARSE_ONLY_BODY);
    try {
      const pass = await runLoadPass(workspace);

      const row = soleRow(pass.notes, LET_WITHOUT_INITIALISER_CODE);
      expect(row.message).toMatch(
        normativeMessagePattern(LET_WITHOUT_INITIALISER_CODE),
      );
      // This row travels route 2 ONLY, so its count is already correct at HEAD.
      // Pinning it makes an over-broad dedup — one that suppresses the drop
      // group wholesale instead of only the rows route 1 already delivered —
      // red as a silent drop (§Fix constraint 1).
      expect(pass.notes.length, describeNotes(pass.notes)).toBe(1);
      expect(
        renderedOccurrences(pass.notes, headLine(row)),
        describeNotes(pass.notes),
      ).toBe(1);
      expect(pass.registered).toEqual([]);
      expect(pass.notified).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  it("control: a theta that REGISTERS draws no diagnostic note at all", async () => {
    const workspace = plantTheta("b0255-clean", CLEAN_BODY);
    try {
      const pass = await runLoadPass(workspace);

      // Fail loudly rather than pass vacuously: a fixture that stopped
      // registering would make the zero-note assertion meaningless.
      expect(
        pass.registered,
        `the clean bug-0255 fixture did not register; notes:\n${describeNotes(pass.notes)}`,
      ).toEqual(["b0255-clean"]);
      expect(pass.notes, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });
});
