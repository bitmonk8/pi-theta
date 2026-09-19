import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry } from "../tools/code-registry/index.js";
import {
  allDiagnostics,
  describeNotes,
  finishWorkspace,
  headLine,
  normalisePath,
  normativeMessagePattern,
  noteDiagnostics,
  renderedOccurrences,
  runLoadPass,
  soleRow,
  type ComposeWorkspace as SharedComposeWorkspace,
  type RecordedNote,
} from "./helpers/compose-workspace-harness";

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
// child process. The host and load-pass harness is shared through
// `tests/helpers/compose-workspace-harness.ts`; fixture planting stays local.
// Bug 0023's witness, `tests/extension-bootstrap-sink-liveness.test.ts`, drives
// the same block-comment path in its element-2 cell but asserts channel
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

// ── The load pass ───────────────────────────────────────────────────────────

interface ComposeWorkspace extends SharedComposeWorkspace {
  /**
   * The planted `.theta`'s absolute path (the `<file>` half of every rendered
   * line), SEPARATOR-NORMALISED: discovery joins its walk with `/` even on
   * Win32, so the comparison is on the normalised spelling rather than on the
   * platform separator, which is not this bug's subject.
   */
  readonly thetaPath: string;
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
  return {
    ...finishWorkspace(cwd),
    // Bug 0268 pins POSIX spelling at delivery: normalise only the expected
    // fixture literal, never the delivered `row.file` compared below.
    thetaPath: normalisePath(thetaPath),
  };
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
      const row = soleRow(pass.notes, BLOCK_COMMENT_CODE, "0255");
      expect(row.severity).toBe("error");
      expect(row.file ?? "").toBe(workspace.thetaPath);
      expect(row.message).toMatch(normativeMessagePattern(REGISTRY, BLOCK_COMMENT_CODE));

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

      const backslash = soleRow(pass.notes, STRAY_BACKSLASH_CODE, "0255");
      const reserved = soleRow(pass.notes, RESERVED_KEYWORD_CODE, "0255");
      const letRow = soleRow(pass.notes, LET_WITHOUT_INITIALISER_CODE, "0255");
      // Constraint 1 again, per row.
      expect(backslash.message).toMatch(
        normativeMessagePattern(REGISTRY, STRAY_BACKSLASH_CODE),
      );
      expect(reserved.message).toMatch(
        normativeMessagePattern(REGISTRY, RESERVED_KEYWORD_CODE),
      );
      expect(letRow.message).toMatch(
        normativeMessagePattern(REGISTRY, LET_WITHOUT_INITIALISER_CODE),
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

      const row = soleRow(pass.notes, LET_WITHOUT_INITIALISER_CODE, "0255");
      expect(row.message).toMatch(
        normativeMessagePattern(REGISTRY, LET_WITHOUT_INITIALISER_CODE),
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
