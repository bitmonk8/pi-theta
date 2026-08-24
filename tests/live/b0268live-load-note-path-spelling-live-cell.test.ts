// Bug 0268 — one load pass must spell every `theta-system-note` file path under
// one convention: POSIX forward slash, on every host platform.
//
// Standalone live cell (the standalone-live-file precedent of
// `tests/live/unterminated-template-registration-live-cell.test.ts` and
// `tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts`;
// this lane's parent renumbers the H8a sequence of
// `tests/live/live-production-acceptance.test.ts` at merge, so this file carries
// no numeric id from that file's own cell sequence).
//
// TIER: H8a (live). The fixed surface is the SPELLING OF A PATH MINTED FROM THE
// HOST'S OWN `cwd`, and the divergence bug 0268 reports is platform-visible only
// where the three conventions differ — a real boot over a real temp workspace on
// the running host. The offline witnesses
// (`tests/b0268-load-note-path-spelling-single-convention.test.ts`,
// `tests/b0268-diagnostic-file-separator-normalisation.test.ts`) drive
// `composeExtensionInstance` over host doubles, so their `pi.sendMessage` is a
// recorder: they read the note object the extension handed the host, never the
// entry a real `SessionManager` settled, and their `ctx.cwd` is a string the
// test itself chose rather than the cwd a real `AgentSession` carries into
// discovery. This cell adds those two claims — the spelling survives the real
// host's message path into the settled transcript, and the structured
// `details.diagnostics[].file` that reaches a real consumer agrees byte-for-byte
// with the head line of the same settled note.
//
// WHAT THE CELL OBSERVES. ONE boot over ONE workspace holding four files, two of
// them malformed and REACHED BY DIFFERENT WALKS, so the pass carries bug 0268
// §Reproduction's cross-file face (A) — the face that survives at HEAD:
//
//   • `b0268livebad.theta` — malformed, discovered. Its path is minted by the
//     discovery walk's `joinPosix(fs.cwd(), …)`
//     (`src/discovery/discovery-walk.ts`), which appends a forward-slash tail to
//     an un-normalised `fs.cwd()`; on Win32 that historically rendered a Win32
//     root with a POSIX tail.
//   • `b0268livelib.thetalib` — malformed, imported by the discovered
//     `b0268liveimporter.theta`. Its path is minted by `checkThetaImports`
//     (`src/extension/import-static-checks.ts`), which normalises the resolved
//     path, so it was already fully POSIX.
//
// Two files of one pass, two minting sites, historically two conventions. After
// the fix both render one convention, and that is what the oracle below reads.
//
// NO SEPARATOR NORMALISATION IN THE ORACLE. The exact spelling is the subject,
// so every comparison here is byte-for-byte against a path this file computes
// from the workspace root. A helper that folded `\` into `/` before comparing
// would assert nothing — that compensation is exactly what bug 0268 §Fix
// constraint 6 retires from the two committed witnesses that carried it.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables, not on `prompt()`
// resolving"; no assertion here is `prompt()` merely resolving):
//   1. The `theta-system-note` CHANNEL of the settled in-memory `SessionManager`
//      (never racy events): the rendered `content` string of every load note.
//   2. The `details` payload of the same settled entries — the structured
//      `diagnostics[].file` / `.related[].file` a downstream consumer reads.
//   3. The driven turn's `userTexts` (deterministic outbound render) and its
//      `systemNotes` (every fail-closed ending of a top-level drive lands
//      there). The model's arithmetic reply is stochastic and is not asserted.
//
// DIAG-4. The expected *Message* is read out of the shipped registry page
// through `registryMessage`, never transcribed as prose, so registry drift reds
// here instead of comparing against a stale sentence. It stands beside the
// spelling claims as the presence guard: a change that silenced a walk rather
// than normalising it would satisfy every absence assertion and red here.
//
// NO SILENT SKIPPING: `requireLiveProvider` fails loudly on a missing
// provider/model; a boot that put NOTHING on the note channel, or that stopped
// producing a row for either malformed fixture, `failLoudly`s by name rather
// than letting an absence assertion pass vacuously.
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins").
// The driven theta is prompt mode with no callee, so the RFC-0006 child launch
// is not expected here; `tests/live/harness.ts` nonetheless sets all three
// ambient inputs at module scope — `process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN` and the `PI_THETA_SUBAGENT_PARENT_PID`
// carriage — and importing the harness inherits them, so a child that did spawn
// would bind this working tree.
//
// Token-bounded: ONE boot, four tiny fixtures, ONE live turn driven only after
// every load claim has held, and a fixed-pair arithmetic question (bug 0243
// retired the verbatim-echo drive sentinel).
//
// SPEC ANCHORS.
//   - `docs/spec_topics/diagnostics/diagnostic-shape.md`, §Internal diagnostic
//     shape, the `file?:` line — the field is an absolute path under the pinned
//     separator convention.
//   - `docs/spec_topics/diagnostics/diagnostic-shape.md`, §Serialised content
//     format — `<file>:<line>:<col>: <code>: <message>`.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";
import { renderDiagnosticLine, type Diagnostic } from "../../src/diagnostics/diagnostic";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
  type LiveExtensionHandle,
  type PlantedTheta,
} from "./harness";

const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";

const BAD_STEM = "b0268livebad";
const IMPORTER_STEM = "b0268liveimporter";
const CLEAN_STEM = "b0268liveclean";
const LIB_NAME = "b0268livelib.thetalib";

/** The arithmetic drive question — task-framed, no verbatim-echo demand (bug 0243). */
const DRIVE_QUESTION = "What is 263 plus 514? Answer with the number only.";

/**
 * The discovered malformed `.theta`: the discovery walk names it, so its
 * `Diagnostic.file` is the one minted by `joinPosix(fs.cwd(), …)`.
 */
const BAD_SOURCE = ["---", "mode: prompt", "---", "let t = `unterminated", "let a = 1", ""].join(
  "\n",
);

/**
 * The malformed library: reached only through the importer's static checks, so
 * its `Diagnostic.file` is the one minted by `checkThetaImports`. Every
 * top-level `fn` in a `.thetalib` is implicitly exported
 * (`docs/spec_topics/imports.md`, §Visibility), and the explicit `export`
 * statement keeps the fixture equal to the offline witnesses' library bytes.
 */
const LIB_SOURCE = "fn f() {\n  let t = `unterminated\n  return 1\n}\nexport { f }\n";

/** A discovered importer of the malformed library — the file that drives the import checks. */
const IMPORTER_SOURCE = [
  "---",
  "mode: prompt",
  "---",
  `import { f } from "./${LIB_NAME}"`,
  "let a = f()",
  "",
].join("\n");

/**
 * The healthy neighbour: import-free, `tools:`-free, and the only file of the
 * pass that registers. It is the vacuity guard — a boot in which it fails to
 * register has a discovery or registration regression and no spelling claim
 * below means anything — and it is the one file driven, so the cell proves its
 * observations come from a real live host.
 */
const CLEAN_SOURCE = ["---", "mode: prompt", "---", `@\`${DRIVE_QUESTION}\``, ""].join("\n");

const THETAS: readonly PlantedTheta[] = [
  { source: "project", stem: BAD_STEM, text: BAD_SOURCE },
  { source: "project", stem: IMPORTER_STEM, text: IMPORTER_SOURCE },
  { source: "project", stem: CLEAN_STEM, text: CLEAN_SOURCE },
];

// ── Registry oracle (DIAG-4) ────────────────────────────────────────────────

interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/**
 * The row's normative *Message* (DIAG-4) as a regex with the `<placeholder>`
 * slots opened up. Fails loudly naming the registry page when the row is absent,
 * so registry drift can never degrade a presence assertion into a comparison
 * against `undefined`.
 */
function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    failLoudly(
      "bug-0268 live cell precondition unmet: " +
        "docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for " +
        `${code} — the DIAG-4 column is this cell's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}

// ── The settled note channel ────────────────────────────────────────────────

/** One settled `theta-system-note` entry: its rendered content and its structured payload. */
interface SettledNote {
  readonly content: string;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * The `theta-system-note` entries of the settled in-memory `SessionManager`,
 * carrying BOTH channels this cell compares: the rendered `content` string and
 * the `details.diagnostics` payload the host stored beside it
 * (`appendCustomMessageEntry` keeps `details` on the entry).
 */
function settledNotes(handle: LiveExtensionHandle): readonly SettledNote[] {
  const notes: SettledNote[] = [];
  for (const entry of handle.sessionManager.getEntries()) {
    const e = entry as { customType?: string; content?: unknown; details?: unknown };
    if (e.customType !== "theta-system-note") continue;
    let content = "";
    if (typeof e.content === "string") {
      content = e.content;
    } else if (Array.isArray(e.content)) {
      for (const part of e.content) {
        const t = (part as { text?: string }).text;
        if (typeof t === "string") content += t;
      }
    }
    const details = e.details as { diagnostics?: unknown } | undefined;
    const diagnostics = Array.isArray(details?.diagnostics)
      ? (details?.diagnostics as readonly Diagnostic[])
      : [];
    notes.push({ content, diagnostics });
  }
  return notes;
}

function describeNotes(notes: readonly SettledNote[]): string {
  return notes.length === 0
    ? "[] (NO NOTE ON THE CHANNEL)"
    : notes.map((n, i) => `[${i}] ${n.content}`).join("\n");
}

/** Every `file` string the structured payloads carry — head fields and related sites. */
function structuredFiles(notes: readonly SettledNote[]): readonly string[] {
  const files: string[] = [];
  for (const note of notes) {
    for (const diagnostic of note.diagnostics) {
      if (diagnostic.file !== undefined) files.push(diagnostic.file);
      for (const site of diagnostic.related ?? []) files.push(site.file);
    }
  }
  return files;
}

// `renderDiagnosticLine` (`src/diagnostics/diagnostic.ts`) writes a located head
// line as `<file>:<line>:<col>: <code>: <message>`, a file-only head line as
// `<file>: <code>: <message>`, and each related site as a two-space-indented
// `<file>:<line>:<col>: <message>`. The file segment is read back out of the
// rendered text with no separator folding, so the content channel is compared
// on its own bytes.
const LOCATED_HEAD_LINE = /^(.+):\d+:\d+: (theta\/\S+): /;
const FILE_ONLY_HEAD_LINE = /^(.+): (theta\/\S+): /;
const RELATED_LINE = /^ {2}(.+):\d+:\d+: /;

/** Every `file` string the RENDERED content carries — head lines and related lines. */
function renderedFiles(notes: readonly SettledNote[]): readonly string[] {
  const files: string[] = [];
  for (const note of notes) {
    for (const line of note.content.split("\n")) {
      if (line.startsWith("  ")) {
        if (line.startsWith("  hint: ")) continue;
        const related = RELATED_LINE.exec(line);
        if (related !== null) files.push(related[1] as string);
        continue;
      }
      const located = LOCATED_HEAD_LINE.exec(line);
      if (located !== null) {
        files.push(located[1] as string);
        continue;
      }
      const fileOnly = FILE_ONLY_HEAD_LINE.exec(line);
      if (fileOnly !== null) files.push(fileOnly[1] as string);
    }
  }
  return files;
}

/** The `file` fields of the rows carrying `code`, read out of the RENDERED content. */
function renderedFilesForCode(notes: readonly SettledNote[], code: string): readonly string[] {
  const files: string[] = [];
  for (const note of notes) {
    for (const line of note.content.split("\n")) {
      const located = LOCATED_HEAD_LINE.exec(line);
      if (located !== null && located[2] === code) files.push(located[1] as string);
    }
  }
  return files;
}

/** The structured rows carrying `code`, whatever file they name. */
function structuredRowsForCode(
  notes: readonly SettledNote[],
  code: string,
): readonly Diagnostic[] {
  return notes.flatMap((note) => note.diagnostics.filter((d) => d.code === code));
}

describe("bug 0268 live cell — a real boot's load notes spell every file path fully POSIX, in the rendered line and in the structured payload alike", () => {
  it("the discovery-walk `.theta` and the import-check `.thetalib` of one pass both render the exact absolute POSIX path, with no backslash in any rendered or structured file field", async () => {
    const provider = await requireLiveProvider();

    const workspace = plantThetaWorkspace(THETAS);
    // `plantThetaWorkspace` writes `<stem>.theta` only; the malformed library is
    // written beside them into the same project source directory it creates.
    writeFileSync(join(workspace.cwd, ".pi", "theta", LIB_NAME), LIB_SOURCE, "utf8");

    // The three spellings bug 0268 §Reproduction tables, computed from the
    // workspace root this cell owns — the POSIX one is the pinned expectation,
    // the other two are the rejected conventions asserted absent below. On a
    // POSIX host all three coincide, and the absence assertions are guarded on
    // that coincidence rather than asserting a path against itself.
    const posixRoot = workspace.cwd.split("\\").join("/");
    const posixPath = (name: string): string => `${posixRoot}/.pi/theta/${name}`;
    const nativePath = (name: string): string => join(workspace.cwd, ".pi", "theta", name);
    const mixedPath = (name: string): string => `${workspace.cwd}/.pi/theta/${name}`;

    const plantedNames = [
      `${BAD_STEM}.theta`,
      `${IMPORTER_STEM}.theta`,
      `${CLEAN_STEM}.theta`,
      LIB_NAME,
    ];
    const expectedPosix = new Set(plantedNames.map(posixPath));

    const handle = await bootShippedExtension({ workspace, provider });
    try {
      const registered = JSON.stringify(handle.registeredNames());

      // Vacuity guard: the healthy neighbour of the same boot registered, so
      // discovery and registration ran.
      expect(
        handle.command(CLEAN_STEM),
        "bug-0268 live cell precondition unmet: the healthy neighbour theta did not register, " +
          "so discovery or registration regressed independently of bug 0268 and every spelling " +
          "claim below would hold vacuously. Registered: " + registered,
      ).toBeDefined();

      const notes = settledNotes(handle);
      if (notes.length === 0) {
        failLoudly(
          "bug-0268 live cell precondition unmet: the boot appended NO `theta-system-note` " +
            "entries, so the shipped load-diagnostic channel is unobservable here and no " +
            "spelling is verified. Registered: " + registered,
        );
      }

      // Precondition: BOTH walks reached the channel. Bug 0268's face (A) needs
      // two files minted by two different sites in one pass; a fixture that
      // stopped producing either row would leave the cross-file claim with one
      // file and no cross-file content.
      const structuredLexRows = structuredRowsForCode(notes, UNTERMINATED_TEMPLATE_CODE);
      const lexRowFiles = structuredLexRows.map((row) => row.file ?? "");
      for (const name of [`${BAD_STEM}.theta`, LIB_NAME]) {
        if (!lexRowFiles.some((file) => file.split(/[\\/]/).pop() === name)) {
          failLoudly(
            `bug-0268 live cell precondition unmet: no ${UNTERMINATED_TEMPLATE_CODE} row names ` +
              `${name}, so the walk that mints that file's path did not run and its spelling is ` +
              `unverified. Rows: ${JSON.stringify(lexRowFiles)}\n${describeNotes(notes)}`,
          );
        }
      }

      // ── The structured field (`details.diagnostics[].file`) ─────────────
      const structured = structuredFiles(notes);
      expect(
        structured.length,
        `no structured file field reached the settled transcript\n${describeNotes(notes)}`,
      ).toBeGreaterThan(0);
      expect(
        structured.filter((file) => file.includes("\\")),
        "bug-0268 §Fix constraint 1: a downstream consumer reads `details.diagnostics[].file`, " +
          "so no structured file field may carry a backslash. Pre-fix the discovery walk's " +
          "`joinPosix` base and the `path.resolve` mints put Win32 separators here on Win32.\n" +
          describeNotes(notes),
      ).toEqual([]);
      expect(
        structured.filter((file) => !expectedPosix.has(file)),
        "each structured file field must be EXACTLY the absolute POSIX path of its planted " +
          `fixture. Expected one of ${JSON.stringify([...expectedPosix])}\n${describeNotes(notes)}`,
      ).toEqual([]);

      // ── The rendered field (the note `content` head and related lines) ───
      const rendered = renderedFiles(notes);
      expect(
        rendered.length,
        `no rendered file field reached the settled transcript\n${describeNotes(notes)}`,
      ).toBeGreaterThan(0);
      expect(
        rendered.filter((file) => file.includes("\\")),
        "bug-0268 PRIMARY: an operator greps the rendered transcript with ONE path literal, so " +
          "no rendered file field may carry a backslash on any host.\n" + describeNotes(notes),
      ).toEqual([]);
      expect(
        rendered.filter((file) => !expectedPosix.has(file)),
        "each rendered file field must be EXACTLY the absolute POSIX path of its planted " +
          `fixture. Expected one of ${JSON.stringify([...expectedPosix])}\n${describeNotes(notes)}`,
      ).toEqual([]);

      // ── The two walks, named ────────────────────────────────────────────
      // Face (A): the discovery-walk file and the import-check file of the SAME
      // pass carry the same convention, each spelled exactly.
      const lexRenderedFiles = renderedFilesForCode(notes, UNTERMINATED_TEMPLATE_CODE);
      expect(
        lexRenderedFiles,
        "the discovery walk mints this path through `joinPosix(fs.cwd(), …)` " +
          "(`src/discovery/discovery-walk.ts`), which historically left a Win32 root on a POSIX " +
          `tail\n${describeNotes(notes)}`,
      ).toContain(posixPath(`${BAD_STEM}.theta`));
      expect(
        lexRenderedFiles,
        "the import static checks mint this path through `normalizePath` " +
          `(\`src/extension/import-static-checks.ts\`)\n${describeNotes(notes)}`,
      ).toContain(posixPath(LIB_NAME));

      // ── Rendered and structured agree byte-for-byte, per note ───────────
      for (const note of notes) {
        for (const diagnostic of note.diagnostics) {
          expect(
            note.content.includes(renderDiagnosticLine(diagnostic)),
            "bug-0268 §Fix constraint 1: the rendered string and the structured field must not " +
              `disagree\ncontent: ${note.content}\nrendered: ${renderDiagnosticLine(diagnostic)}`,
          ).toBe(true);
        }
        const noteRendered = renderedFiles([note]);
        const noteStructured = structuredFiles([note]);
        expect(
          [...noteRendered].sort(),
          "every file field parsed back out of one note's rendered content must be the same " +
            `byte string as its own \`details.diagnostics[].file\` set\ncontent: ${note.content}`,
        ).toEqual([...noteStructured].sort());
      }

      // ── The two rejected conventions are absent from the transcript ─────
      const transcript = notes.map((note) => note.content).join("\n");
      for (const name of plantedNames) {
        const native = nativePath(name);
        const mixed = mixedPath(name);
        if (native !== posixPath(name)) {
          expect(
            transcript.includes(native),
            `the fully-Win32 spelling of ${name} must not appear\n${transcript}`,
          ).toBe(false);
        }
        if (mixed !== posixPath(name)) {
          expect(
            transcript.includes(mixed),
            `the Win32-root-plus-POSIX-tail spelling of ${name} must not appear\n${transcript}`,
          ).toBe(false);
        }
      }

      // ── DIAG-4: the rows are still the rows, not a silenced walk ────────
      for (const row of structuredLexRows) {
        expect(
          row.message,
          `the ${UNTERMINATED_TEMPLATE_CODE} row must carry the registry's normative Message ` +
            "(DIAG-4, read from docs/spec_topics/diagnostics/code-registry-parse.md, not " +
            "transcribed here), so a fix that dropped a walk instead of normalising its " +
            "spelling reds here",
        ).toMatch(normativeMessagePattern(UNTERMINATED_TEMPLATE_CODE));
      }

      // ── The boot is a live host, and it drives ──────────────────────────
      // Driven last: every load claim above holds before a token is spent.
      const driven = await driveSlashCaptureTurn(handle, `/${CLEAN_STEM}`);
      expect(
        driven.userTexts.join("\n"),
        "the healthy neighbour's QRY-18 rendered template is the deterministic outbound-render " +
          "channel; its absence means the query never reached the provider, so no real model " +
          "turn ran and the notes above came from a boot that never became a live session. " +
          "Observed: " + JSON.stringify(driven.userTexts),
      ).toContain(DRIVE_QUESTION);
      expect(
        driven.systemNotes,
        "every fail-closed ending of a top-level drive lands on the theta-system-note channel " +
          "(the SLSH-3 err note, the cancelled note, the panic framings); the healthy neighbour " +
          "must end with none. Observed: " + JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
