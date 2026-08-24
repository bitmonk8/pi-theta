import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  renderDiagnosticLine,
  type Diagnostic,
} from "../src/diagnostics/diagnostic";
import { composeExtensionInstance } from "../src/extension/production-composition";
import {
  RendererGate,
  SYSTEM_NOTE_CHANNEL,
} from "../src/extension/system-note-channel";

// Bug 0268 — one load pass renders `theta-system-note` file paths under three
// mutually inconsistent separator conventions, and which convention a given
// file gets is decided by whichever walk parsed it first.
//
// The four minting sites and their conventions (bug 0268 §Actual behaviour):
//   - `discoverThetas` builds its conventional roots through `joinPosix`
//     (`src/discovery/discovery-walk.ts`), which appends a forward-slash tail to
//     an un-normalised `fs.cwd()` and never runs the module's own
//     `normalizePath` over the base — a discovered file is a Win32 root with a
//     POSIX tail;
//   - `checkThetaImports` (`src/extension/import-static-checks.ts`) normalises
//     the resolved path before handing it to `parseViaPassCache` — an imported
//     `.thetalib` is fully POSIX;
//   - `collectCallableClosureSources` and `parseCalleeForTools`
//     (`src/extension/production-composition.ts`) resolve through node
//     `path.resolve` — fully Win32 on Win32.
// `renderDiagnosticLine` (`src/diagnostics/diagnostic.ts`) prints the field
// verbatim, and both note sinks — `emitDiagnosticBatch`
// (`src/extension/system-note-channel.ts`) and `emitLoadNoteGroup`
// (`src/extension/production-composition.ts`) — carry it verbatim into
// `details.diagnostics[].file`.
//
// Bug 0264's `PassParseCache` (`src/extension/pass-parse-cache.ts`) normalises
// only the cache KEY and stores the first caller's verbatim path on the
// document, so within one pass a file has exactly ONE spelling — chosen by
// whichever walk parsed it first. Two faces survive, and this file witnesses
// both:
//   (A) CROSS-FILE — different files of one pass render under different
//       conventions, so no single path literal matches the pass's notes.
//   (B) WALK ORDER — one file, one content, renders under two different
//       conventions depending only on which walk reaches it first.
//
// FACE (B) AS MEASURED HERE, not as bug 0268 §Reproduction tables it. That
// table flipped a library between fully-POSIX and fully-Win32 by renaming
// unrelated fixtures, with the Win32 arm minted by
// `collectCallableClosureSources`. Bug 0267's callee-has-errors widening landed
// after that measurement: a `tools:` callee that fails its own structural
// checks is now dropped from the callable-set snapshot, so
// `attachLoadTimeClosureHashes` never reaches the closure walk for a malformed
// closure and the rename-only flip no longer reproduces. The node
// `path.resolve` mint itself is untouched — `parseCalleeForTools` still spells
// a `tools:` callee fully Win32 — so face (B) is driven here by the walk that
// still reaches it: the same malformed `.theta` renders Win32-root-plus-POSIX-
// tail when the discovery walk names it and fully Win32 when only
// `parseCalleeForTools` does. Same file, same bytes, same caller; the spelling
// turns on which directory it sits in, which is bug 0268 §Why it matters'
// "a workspace edit unrelated to the malformed file can change how that file is
// reported".
//
// THE PINNED CONVENTION. Every rendered `file` field and every
// `details.diagnostics[].file` / `.related[].file` of a load pass is spelled
// with the POSIX forward slash. Bug 0268 §Fix constraint 1: the rendered string
// and the structured field must not disagree. Constraint 5: a file first parsed
// by the closure walk and one first parsed by the import checks render
// identically. Path resolution, containment and cache keying are §Non-goals.
//
// SPEC ANCHORS.
//   - `docs/spec_topics/diagnostics/diagnostic-shape.md` line 32 — the `file`
//     field is an absolute path.
//   - `docs/spec_topics/diagnostics/diagnostic-shape.md` line 63 — the
//     serialised content format `<file>:<line>:<col>: <code>: <message>`.
//
// Offline, provider-free, deterministic: host doubles only, no provider, no
// child process. The host doubles and the fixture-planting shape are MODELLED
// ON (duplicated from, not shared with)
// `tests/thetalib-reparse-walk-single-delivery.test.ts`, bug 0264's witness,
// which is neither read from nor mutated by this file. That file counts
// deliveries and deliberately separator-normalises before comparing, so it
// neither witnesses nor blocks this bug.
//
// No silent skipping: an unmet precondition — registry row absent, fixture no
// longer reaching the channel, expected row missing — throws naming itself.

// ── Fixtures (bug 0268 §Reproduction) ───────────────────────────────────────

const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";

/** The malformed library: one lex-phase row plus one parse-phase row. */
const LIB_SOURCE = "fn f() {\n  let t = `unterminated\n  return 1\n}\nexport { f }\n";

/** A prompt-mode importer of a library — the shape that drives the import checks. */
function importerSource(libStem: string): string {
  return `---\nmode: prompt\n---\nimport { f } from "./${libStem}.thetalib"\nlet a = f()\n`;
}

/** A prompt-mode caller naming a callee in `tools:`. */
function callerSource(calleeStem: string): string {
  return `---\nmode: prompt\ntools:\n  - ./${calleeStem}.theta as callee\n---\n@\`hi\`\n`;
}

/** A malformed subagent-mode `.theta`, discovered on its own. */
const MALFORMED_CALLEE_SOURCE =
  "---\nmode: subagent\ndescription: b0268 bad callee\n---\nlet t = `unterminated\nlet a = 1\n";

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
 * registry drift cannot degrade a presence assertion into a comparison against
 * `undefined`.
 */
function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row ` +
        `for ${code} — the DIAG-4 column is this file's only message oracle, so a missing ` +
        `row is a harness failure, never a skip`,
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

// ── The load pass ───────────────────────────────────────────────────────────

interface ComposeWorkspace {
  readonly cwd: string;
  /** The planting directory, POSIX-spelled and with a trailing separator. */
  readonly posixDir: string;
  /** Absolute POSIX-spelled path of a planted fixture file — the pinned form. */
  readonly posixPath: (name: string) => string;
  /** Absolute Win32-spelled path, as node `path.resolve` spells it. */
  readonly nativePath: (name: string) => string;
  /** Win32 root plus POSIX tail, as `joinPosix` spells a discovered file. */
  readonly mixedPath: (name: string) => string;
  readonly dispose: () => void;
}

/** Plant the named fixture files on the conventional project source. */
function plantWorkspace(
  files: Readonly<Record<string, string>>,
): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0268-"));
  for (const [name, body] of Object.entries(files)) {
    const planted = join(cwd, ".pi", "theta", name);
    mkdirSync(dirname(planted), { recursive: true });
    writeFileSync(planted, body, "utf8");
  }
  // An ABSENT settings file is silent (package-and-settings.md §Failure modes),
  // so the plant is hermeticity, not noise suppression.
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    posixDir: `${join(cwd, ".pi", "theta").split("\\").join("/")}/`,
    posixPath: (name: string): string =>
      join(cwd, ".pi", "theta", name).split("\\").join("/"),
    nativePath: (name: string): string => join(cwd, ".pi", "theta", name),
    mixedPath: (name: string): string => `${cwd}/.pi/theta/${name}`,
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}

interface LoadPass {
  readonly notes: readonly RecordedNote[];
  readonly offChannel: readonly RecordedNote[];
  readonly notified: readonly (readonly [string, string])[];
}

/**
 * Drive the SHIPPED composition root over the planted workspace with an
 * UNDEGRADED `RendererGate`, so every note takes the transcript
 * (`pi.sendMessage`) arm and the spellings below are the spellings the author
 * reads.
 */
async function runLoadPass(workspace: ComposeWorkspace): Promise<LoadPass> {
  const host = makeHost(workspace.cwd);
  await composeExtensionInstance(
    host.pi,
    host.ctx,
    undefined,
    new RendererGate(),
  );
  return {
    notes: host.notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL),
    offChannel: host.notes.filter((n) => n.customType !== SYSTEM_NOTE_CHANNEL),
    notified: host.notified,
  };
}

// ── Observation helpers ─────────────────────────────────────────────────────

function noteDiagnostics(note: RecordedNote): readonly Diagnostic[] {
  const details = note.details as { diagnostics?: unknown } | undefined;
  const diagnostics = details?.diagnostics;
  return Array.isArray(diagnostics) ? (diagnostics as readonly Diagnostic[]) : [];
}

function allDiagnostics(pass: LoadPass): readonly Diagnostic[] {
  return pass.notes.flatMap((note) => [...noteDiagnostics(note)]);
}

function describeNotes(pass: LoadPass): string {
  return pass.notes.length === 0
    ? "[] (NO NOTE ON THE CHANNEL)"
    : pass.notes.map((n, i) => `[${i}] ${n.content}`).join("\n");
}

/** Every `file` string a pass put on the channel, head lines and related sites. */
function deliveredFiles(pass: LoadPass): readonly string[] {
  const files: string[] = [];
  for (const diagnostic of allDiagnostics(pass)) {
    if (diagnostic.file !== undefined) {
      files.push(diagnostic.file);
    }
    for (const site of diagnostic.related ?? []) {
      files.push(site.file);
    }
  }
  return files;
}

/** The host double must have been driven before any spelling means anything. */
function requireDriven(pass: LoadPass): void {
  if (pass.notes.length === 0) {
    throw new Error(
      "harness: the composition root put NOTHING on the theta-system-note channel — " +
        "the bug-0268 fixture no longer reaches the diagnostic channel, so no spelling " +
        "below is verified",
    );
  }
}

/**
 * The one lex row the pass produced for a file, located by basename so the
 * lookup does not itself presuppose a spelling. Fails loudly when the fixture
 * stopped producing it.
 */
function lexRowFor(pass: LoadPass, basename: string): Diagnostic {
  const rows = allDiagnostics(pass).filter(
    (d) =>
      d.code === UNTERMINATED_TEMPLATE_CODE &&
      (d.file ?? "").split(/[\\/]/).pop() === basename,
  );
  if (rows.length === 0) {
    throw new Error(
      `harness: no ${UNTERMINATED_TEMPLATE_CODE} row for ${basename} reached the channel — ` +
        `the bug-0268 fixture no longer exercises its walk, so nothing below is ` +
        `verified. Notes:\n${describeNotes(pass)}`,
    );
  }
  return rows[0] as Diagnostic;
}

describe("bug 0268 — one load pass spells every rendered file path under one convention", () => {
  // ── (A) cross-file divergence inside ONE pass ─────────────────────────────

  it("(A) a five-file pass renders every file path fully POSIX, in the note content and in details.diagnostics", async () => {
    // One pass reaching all three minting conventions: `lib2.thetalib` through
    // the import checks of a discovered importer (fully POSIX),
    // `b0268bad.theta` through the discovery walk (Win32 root, POSIX tail), and
    // `sub/zzz_bad.theta` — outside the discovery root, named only in a
    // caller's `tools:` — through `parseCalleeForTools` (fully Win32).
    const workspace = plantWorkspace({
      "lib2.thetalib": LIB_SOURCE,
      "mmm_importer.theta": importerSource("lib2"),
      "b0268bad.theta": MALFORMED_CALLEE_SOURCE,
      "aaa_caller.theta": callerSource("sub/zzz_bad"),
      "sub/zzz_bad.theta": MALFORMED_CALLEE_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      // Every file field the pass delivered is spelled with the forward slash
      // alone, so one path literal matches the whole pass.
      const files = deliveredFiles(pass);
      expect(files.length, describeNotes(pass)).toBeGreaterThan(0);
      expect(
        files.filter((f) => f.includes("\\")),
        `file fields carrying a backslash\n${describeNotes(pass)}`,
      ).toEqual([]);

      // And each is exactly the pinned absolute POSIX path of its fixture.
      const expected = new Set(
        [
          "lib2.thetalib",
          "mmm_importer.theta",
          "b0268bad.theta",
          "aaa_caller.theta",
          "sub/zzz_bad.theta",
        ].map((name) => workspace.posixPath(name)),
      );
      expect(
        files.filter((f) => !expected.has(f)),
        `file fields that are not the pinned POSIX spelling of a fixture\n${describeNotes(pass)}`,
      ).toEqual([]);

      // Constraint 1 — the rendered string and the structured field agree: each
      // delivered diagnostic's own rendering appears verbatim in the note
      // content that carried it.
      for (const note of pass.notes) {
        for (const diagnostic of noteDiagnostics(note)) {
          expect(
            note.content.includes(renderDiagnosticLine(diagnostic)),
            `note content does not carry the rendering of its own diagnostic\n` +
              `content: ${note.content}\nrendered: ${renderDiagnosticLine(diagnostic)}`,
          ).toBe(true);
        }
      }

      // Neither of the two rejected conventions survives anywhere in the
      // rendered transcript.
      const transcript = pass.notes.map((n) => n.content).join("\n");
      for (const name of [
        "lib2.thetalib",
        "b0268bad.theta",
        "sub/zzz_bad.theta",
        "aaa_caller.theta",
      ]) {
        const native = workspace.nativePath(name);
        const mixed = workspace.mixedPath(name);
        if (native !== workspace.posixPath(name)) {
          expect(transcript.includes(native), `Win32 spelling of ${name}`).toBe(false);
        }
        if (mixed !== workspace.posixPath(name)) {
          expect(transcript.includes(mixed), `mixed spelling of ${name}`).toBe(false);
        }
      }

      // DIAG-4 — the presence guard beside the spelling: a fix that silences a
      // walk instead of normalising it reds here as a silent drop.
      for (const basename of ["lib2.thetalib", "b0268bad.theta", "zzz_bad.theta"]) {
        expect(lexRowFor(pass, basename).message).toMatch(
          normativeMessagePattern(UNTERMINATED_TEMPLATE_CODE),
        );
      }

      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (B) walk-order-dependent spelling for ONE file ────────────────────────

  it("(B) the same malformed callee renders identically whichever walk names it first", async () => {
    // Two workspaces, the same three files with byte-identical contents and the
    // same caller/callee topology. The only difference is the directory the
    // callee sits in, which decides whether the discovery walk or
    // `parseCalleeForTools` names it first.
    //
    // Discovered: the discovery walk's `joinPosix` mints the path, so the file
    // renders with a Win32 root and a POSIX tail.
    const discoveryFirst = plantWorkspace({
      "b0268bad.theta": MALFORMED_CALLEE_SOURCE,
      "aaa_caller.theta": callerSource("b0268bad"),
    });
    // Outside the discovery root: only the caller's `tools:` walk names it, and
    // `parseCalleeForTools` resolves through node `path.resolve`, so the file
    // renders fully Win32.
    const toolsWalkFirst = plantWorkspace({
      "sub/b0268bad.theta": MALFORMED_CALLEE_SOURCE,
      "aaa_caller.theta": callerSource("sub/b0268bad"),
    });
    try {
      const discoveryPass = await runLoadPass(discoveryFirst);
      const toolsPass = await runLoadPass(toolsWalkFirst);
      requireDriven(discoveryPass);
      requireDriven(toolsPass);

      const discoveryRow = lexRowFor(discoveryPass, "b0268bad.theta");
      const toolsRow = lexRowFor(toolsPass, "b0268bad.theta");

      // Each spells its own workspace's callee under the pinned convention.
      expect(discoveryRow.file, describeNotes(discoveryPass)).toBe(
        discoveryFirst.posixPath("b0268bad.theta"),
      );
      expect(toolsRow.file, describeNotes(toolsPass)).toBe(
        toolsWalkFirst.posixPath("sub/b0268bad.theta"),
      );

      // The workspace-relative tails differ only by the planted directory, so
      // the separator run is byte-identical across the two walks: the spelling
      // is a function of the file, not of which walk reached it.
      const tail = (row: Diagnostic, workspace: ComposeWorkspace): string =>
        (row.file ?? "").slice(workspace.posixDir.length);
      expect(tail(discoveryRow, discoveryFirst)).toBe("b0268bad.theta");
      expect(tail(toolsRow, toolsWalkFirst)).toBe("sub/b0268bad.theta");

      // Neither pass leaks a backslash into a file field.
      expect(
        [...deliveredFiles(discoveryPass), ...deliveredFiles(toolsPass)].filter((f) =>
          f.includes("\\"),
        ),
        `file fields carrying a backslash\n${describeNotes(discoveryPass)}\n${describeNotes(toolsPass)}`,
      ).toEqual([]);
    } finally {
      discoveryFirst.dispose();
      toolsWalkFirst.dispose();
    }
  });
});
