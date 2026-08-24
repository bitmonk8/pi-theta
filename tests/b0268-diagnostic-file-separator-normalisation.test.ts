import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  renderDiagnosticBatch,
  renderDiagnosticLine,
  type Diagnostic,
} from "../src/diagnostics/diagnostic";
import {
  SYSTEM_NOTE_CHANNEL,
  emitDiagnosticBatch,
  sendSystemNote,
  type SystemNote,
  type SystemNoteChannelDeps,
  type SystemNoteDetails,
  type SystemNoteSender,
} from "../src/extension/system-note-channel";

// Bug 0268 — the presentational seams that spell a diagnostic's `file`.
//
// One load pass mints `Diagnostic.file` at four sites under three separator
// conventions: `joinPosix` (`src/discovery/discovery-walk.ts`) joins an
// un-normalised `fs.cwd()` to a forward-slash tail, so a discovered file is a
// Win32 root with a POSIX tail; `checkThetaImports`
// (`src/extension/import-static-checks.ts`) normalises its resolved path, so an
// imported `.thetalib` is fully POSIX; `collectCallableClosureSources` and
// `parseCalleeForTools` (`src/extension/production-composition.ts`) resolve
// through node `path.resolve`, so on Win32 they are fully Win32.
// `renderDiagnosticLine` (`src/diagnostics/diagnostic.ts`) interpolates the
// field verbatim and `emitDiagnosticBatch`
// (`src/extension/system-note-channel.ts`) carries the same string through
// `details.diagnostics[]`, so one pass emits all three spellings and no single
// path literal matches them.
//
// THE PINNED CONVENTION. Every rendered `file` field and every
// `details.diagnostics[].file` / `.related[].file` a `theta-system-note`
// carries is spelled with the POSIX forward slash. The normalisation is
// presentational and lands at the two seams this file drives:
// `renderDiagnosticLine` for the rendered line, and `sendSystemNote` for the
// structured payload. Path resolution, containment and pass-cache keying are
// bug 0268 §Non-goals and are not touched.
//
// SPEC ANCHORS.
//   - `docs/spec_topics/diagnostics/diagnostic-shape.md` line 32 — the `file`
//     field is an absolute path.
//   - `docs/spec_topics/diagnostics/diagnostic-shape.md` line 63 — the
//     serialised content format `<file>:<line>:<col>: <code>: <message>`.
//   - Bug 0268 §Fix constraint 1 — the rendered string and the structured field
//     must not disagree.
//   - Bug 0268 §Fix constraint 2 — code, severity, `range`, *Message* and
//     `hint` are byte-identical before and after.
//
// Offline, provider-free, deterministic: string inputs and a recording channel
// double, no filesystem, no provider, no child process. The channel double is
// MODELLED ON (duplicated from, not shared with)
// `tests/system-note-channel.test.ts`, which is the V7d witness and is neither
// read from nor mutated here.
//
// No silent skipping: a missing registry row throws naming itself.

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
 * The row's normative *Message* (DIAG-4). Throws naming the registry page when
 * the row is absent, so registry drift cannot degrade a byte-identity
 * assertion into a comparison against `undefined`.
 */
function normativeMessage(code: string): string {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row ` +
        `for ${code} — the DIAG-4 column is this file's only message oracle, so a missing ` +
        `row is a harness failure, never a skip`,
    );
  }
  return message;
}

const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";
const UNSUPPORTED_FEATURE_CODE = "theta/parse/unsupported-feature";

// ── Path spellings under test ───────────────────────────────────────────────

// The directory and the leaf are held apart and joined by interpolation: a
// literal source span shaped like a registry code is scraped by the DIAG-2
// corpus gate (`tests/registry-closed-set-corpus-gate.test.ts`) as an asserted
// code outside the registry.
const DIR_WIN32 = "C:\\Users\\dev\\AppData\\Local\\Temp\\ws\\.pi\\theta";
const DIR_MIXED = "C:\\Users\\dev\\AppData\\Local\\Temp\\ws/.pi/theta";
const DIR_POSIX = "C:/Users/dev/AppData/Local/Temp/ws/.pi/theta";
const LIB_LEAF = "lib1.thetalib";
const BAD_LEAF = "b0268bad.theta";

/** Fully Win32, as node `path.resolve` spells it under the closure walk. */
const WIN32_FILE = `${DIR_WIN32}\\${LIB_LEAF}`;
/** Win32 root plus POSIX tail, as `joinPosix` spells a discovered file. */
const MIXED_FILE = `${DIR_MIXED}/${BAD_LEAF}`;
/** The pinned convention: fully POSIX. */
const POSIX_LIB = `${DIR_POSIX}/${LIB_LEAF}`;
const POSIX_BAD = `${DIR_POSIX}/${BAD_LEAF}`;

// The two fixture positions, held as values so the expected head lines are
// assembled rather than spelled with a literal colon-and-digits run, which the
// citation-form gate (`tests/citation-symbol-form-gate.test.ts`) reads as an
// unattributable continuation citation.
const LIB_LINE = 2;
const LIB_COL = 11;
const BAD_LINE = 5;
const BAD_COL = 9;

// ── Recording channel double ────────────────────────────────────────────────

interface SentNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: SystemNoteDetails;
}

interface ChannelFixture {
  readonly deps: SystemNoteChannelDeps;
  readonly sent: SentNote[];
  readonly notified: Array<readonly [string, string]>;
  readonly emitted: Diagnostic[];
}

function makeChannel(): ChannelFixture {
  const sent: SentNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const emitted: Diagnostic[] = [];

  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      sent.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details,
      });
    },
  };
  const deps: SystemNoteChannelDeps = {
    pi,
    ui: {
      notify: (message: string, type: "error"): void => {
        notified.push([message, type]);
      },
    },
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      emitted.push(diagnostic);
    },
  };
  return { deps, sent, notified, emitted };
}

/** The single note the channel accepted; fails loudly when the arm never ran. */
function soleNote(fixture: ChannelFixture): SentNote {
  if (fixture.sent.length !== 1) {
    throw new Error(
      `harness: the channel double accepted ${fixture.sent.length} notes, expected 1 — ` +
        `the transcript arm of sendSystemNote did not run, so nothing below is verified`,
    );
  }
  return fixture.sent[0] as SentNote;
}

/** The `details.diagnostics` array of a note, or a loud failure. */
function noteDiagnostics(note: SentNote): readonly Diagnostic[] {
  const details = note.details as { diagnostics?: unknown };
  const diagnostics = details.diagnostics;
  if (!Array.isArray(diagnostics)) {
    throw new Error(
      `harness: note carries no details.diagnostics array: ${JSON.stringify(note.details)}`,
    );
  }
  return diagnostics as readonly Diagnostic[];
}

describe("bug 0268 — renderDiagnosticLine spells every file field with the POSIX separator", () => {
  it("normalises the head-line file and each related site's file, leaving every other token byte-identical", () => {
    const message = normativeMessage(UNTERMINATED_TEMPLATE_CODE);
    const related = normativeMessage(UNSUPPORTED_FEATURE_CODE).replace(
      "<construct>",
      "nested template",
    );

    // The closure walk's Win32 head-line spelling beside the discovery walk's
    // mixed related-site spelling: one diagnostic carrying two of the three
    // conventions bug 0268 tables in §Reproduction.
    const diagnostic: Diagnostic = {
      severity: "error",
      code: UNTERMINATED_TEMPLATE_CODE,
      file: WIN32_FILE,
      range: {
        start: { line: LIB_LINE, column: LIB_COL },
        end: { line: 5, column: 1 },
      },
      message,
      hint: "Close the template with a backtick.",
      related: [
        {
          file: MIXED_FILE,
          range: {
            start: { line: BAD_LINE, column: BAD_COL },
            end: { line: 7, column: 1 },
          },
          message: related,
        },
      ],
    };

    // Constraints 1 and 2 together: the file fields move to the pinned POSIX
    // spelling and every other rendered token — code, message, hint, the
    // `<line>:<col>` pair and the two-space continuation indents — is unchanged.
    expect(renderDiagnosticLine(diagnostic)).toBe(
      `${POSIX_LIB}:${LIB_LINE}:${LIB_COL}: ${UNTERMINATED_TEMPLATE_CODE}: ${message}\n` +
        "  hint: Close the template with a backtick.\n" +
        `  ${POSIX_BAD}:${BAD_LINE}:${BAD_COL}: ${related}`,
    );

    // The POSIX-spelled twin of the same diagnostic renders byte-identically,
    // which is what makes the spelling a function of the file alone and not of
    // whichever walk minted it.
    const posixTwin: Diagnostic = {
      ...diagnostic,
      file: POSIX_LIB,
      related: [
        {
          file: POSIX_BAD,
          range: {
            start: { line: BAD_LINE, column: BAD_COL },
            end: { line: 7, column: 1 },
          },
          message: related,
        },
      ],
    };
    expect(renderDiagnosticLine(diagnostic)).toBe(renderDiagnosticLine(posixTwin));
  });

  it("normalises the file-only form and leaves the location-less form untouched", () => {
    const message = normativeMessage(UNTERMINATED_TEMPLATE_CODE);

    // File-only: the `<file>: <code>: <message>` shape is preserved and only
    // the separators move.
    const fileOnly: Diagnostic = {
      severity: "error",
      code: UNTERMINATED_TEMPLATE_CODE,
      file: MIXED_FILE,
      message,
    };
    expect(renderDiagnosticLine(fileOnly)).toBe(
      `${POSIX_BAD}: ${UNTERMINATED_TEMPLATE_CODE}: ${message}`,
    );

    // Location-less: no `file` to normalise, so the line is byte-identical to
    // the pre-fix rendering.
    const locationLess: Diagnostic = {
      severity: "error",
      code: UNTERMINATED_TEMPLATE_CODE,
      message,
    };
    expect(renderDiagnosticLine(locationLess)).toBe(
      `${UNTERMINATED_TEMPLATE_CODE}: ${message}`,
    );
  });

  it("renders a mixed-convention batch under one convention", () => {
    const message = normativeMessage(UNTERMINATED_TEMPLATE_CODE);
    const batch: readonly Diagnostic[] = [
      {
        severity: "error",
        code: UNTERMINATED_TEMPLATE_CODE,
        file: WIN32_FILE,
        range: {
          start: { line: LIB_LINE, column: LIB_COL },
          end: { line: 5, column: 1 },
        },
        message,
      },
      {
        severity: "error",
        code: UNTERMINATED_TEMPLATE_CODE,
        file: MIXED_FILE,
        range: {
          start: { line: BAD_LINE, column: BAD_COL },
          end: { line: 7, column: 1 },
        },
        message,
      },
    ];

    // §Why it matters: one path literal must match every note of one pass.
    expect(renderDiagnosticBatch(batch)).toBe(
      `${POSIX_LIB}:${LIB_LINE}:${LIB_COL}: ${UNTERMINATED_TEMPLATE_CODE}: ${message}\n\n` +
        `${POSIX_BAD}:${BAD_LINE}:${BAD_COL}: ${UNTERMINATED_TEMPLATE_CODE}: ${message}`,
    );
  });
});

describe("bug 0268 — the delivery channel carries POSIX-spelled file fields in details.diagnostics", () => {
  it("emitDiagnosticBatch delivers details.diagnostics[].file and .related[].file fully POSIX and agreeing with the rendered line", () => {
    const message = normativeMessage(UNTERMINATED_TEMPLATE_CODE);
    const relatedMessage = normativeMessage(UNSUPPORTED_FEATURE_CODE).replace(
      "<construct>",
      "nested template",
    );
    const fixture = makeChannel();

    emitDiagnosticBatch(
      [
        {
          severity: "error",
          code: UNTERMINATED_TEMPLATE_CODE,
          file: WIN32_FILE,
          range: {
            start: { line: LIB_LINE, column: LIB_COL },
            end: { line: 5, column: 1 },
          },
          message,
          related: [
            {
              file: MIXED_FILE,
              range: {
                start: { line: BAD_LINE, column: BAD_COL },
                end: { line: 7, column: 1 },
              },
              message: relatedMessage,
            },
          ],
        },
      ],
      fixture.deps,
    );

    const note = soleNote(fixture);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    const delivered = noteDiagnostics(note);
    expect(delivered.length).toBe(1);
    const row = delivered[0] as Diagnostic;

    // Constraint 1 — the structured field carries the pinned spelling.
    expect(row.file).toBe(POSIX_LIB);
    expect(row.related?.[0]?.file).toBe(POSIX_BAD);

    // Constraint 1 — the rendered string and the structured field agree, so a
    // consumer keying on `details.diagnostics[].file` and an operator grepping
    // `content` match the same literal.
    expect(note.content).toBe(renderDiagnosticLine(row));
    expect(
      note.content.startsWith(`${POSIX_LIB}:${LIB_LINE}:${LIB_COL}:`),
    ).toBe(true);

    // Constraint 2 — nothing but the separators moved.
    expect(row.code).toBe(UNTERMINATED_TEMPLATE_CODE);
    expect(row.severity).toBe("error");
    expect(row.message).toBe(message);
    expect(row.range).toEqual({
      start: { line: LIB_LINE, column: LIB_COL },
      end: { line: 5, column: 1 },
    });
    expect(row.related?.[0]?.message).toBe(relatedMessage);

    expect(fixture.notified).toEqual([]);
    expect(fixture.emitted).toEqual([]);
  });

  it("leaves the event, structural and recovery details shapes and their content byte-identical", () => {
    // The three non-diagnostic `details` shapes of the channel
    // (`SystemNoteDetails`, `src/extension/system-note-channel.ts`) carry
    // author- and host-supplied strings that are not the `Diagnostic.file`
    // field, so the presentational normalisation must not reach them.
    const eventNote: SystemNote = {
      content: `theta /x aborted while reading ${WIN32_FILE}`,
      display: true,
      details: { event: { path: WIN32_FILE, reason: MIXED_FILE } },
    };
    const structuralNote: SystemNote = {
      content: "theta set changed",
      display: true,
      details: { structural: { added: [WIN32_FILE], removed: [MIXED_FILE] } },
    };
    const recoveryNote: SystemNote = {
      content: "theta recovered",
      display: true,
      details: { recovery: { thetas: [WIN32_FILE, MIXED_FILE] } },
    };

    for (const note of [eventNote, structuralNote, recoveryNote]) {
      const fixture = makeChannel();
      sendSystemNote(note, fixture.deps);
      const sent = soleNote(fixture);
      expect(sent.content).toBe(note.content);
      expect(sent.details).toEqual(note.details);
      expect(fixture.notified).toEqual([]);
      expect(fixture.emitted).toEqual([]);
    }
  });
});
