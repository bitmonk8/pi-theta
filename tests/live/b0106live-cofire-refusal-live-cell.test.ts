// Bug 0106 — standalone live load/registration cell (the 0104
// `tools-field-shape-refusal-live-cell.test.ts` precedent; not a numbered
// live-production-acceptance cell).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION: a
// `tools:` entry the closed per-entry grammar rejects
// (`theta/load/malformed-tool-entry`) must draw THAT diagnostic and nothing
// else — where at HEAD (pre-fix) a malformed entry whose FIRST TOKEN happens
// to name an existing erroneous `.theta` also draws
// `theta/load/callee-has-errors`, because the pre-parse callee cache keys on
// `toolsEntrySpec`'s first token (its call site in `resolveThetaToolsAtLoad`,
// src/extension/production-composition.ts, inside the `for (const entry of
// toolsList)` loop) and the V15f callee-has-errors loop over that cache
// (`for (const [spec, callee] of calleeCache)`) fires for a callee the closed
// grammar says the entry
// does not reference (docs/spec_topics/diagnostics/code-registry-load.md:40;
// docs/bugs/0106-tools-entry-grammar-derivations-outside-lockstep.md). Fixed by
// gating the cache loop on `parseToolsEntry` before it calls `toolsEntrySpec`
// (bug 0106 §Fix (b), second placement), so a malformed entry never enters the
// cache and the V15f loop has no member to fire for.
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same harness
// the existing "discovery → registration" H8a-T cells use. No live turn is
// driven, so this cell spends no tokens beyond `requireLiveProvider`'s
// credential resolution.
//
// OBSERVABLES (AGENTS.md "Assert on real observables, not on `prompt()`
// resolving"; no `prompt()` is called here at all). Two channels, both read
// off the settled boot:
//   1. REGISTRATION — `handle.command(stem)` / `handle.registeredNames()`, off
//      the real `ExtensionRunner` after the real `pi.registerCommand` step.
//      §Fix constraint 1's invariant: every malformed spelling un-registers,
//      with or without the co-fire.
//   2. The `theta-system-note` CHANNEL — the shipped sink routes every
//      error-severity load diagnostic through `routePreEvalFailure` with
//      `content: renderDiagnosticBatch([diagnostic])`
//      (`emitLoadNoteGroup`, src/extension/production-composition.ts), and
//      `renderDiagnosticLine` (src/diagnostics/diagnostic.ts) puts the
//      registry CODE and the file path in that text. So the notes appended
//      during `bindExtensions` carry per-file, per-code load diagnostics —
//      which is the only channel on which the co-fire is visible at all
//      (registration is identical either way). Read off
//      `handle.sessionManager`, the deterministic settled-transcript read, not
//      off racy events. The harness exports no note reader for the BOOT phase
//      (`collectSystemNotes` is private to `driveSlashCaptureTurn`), so this
//      cell carries its own reader over `handle.sessionManager.getEntries()`.
//
// NO SILENT SKIPPING: `requireLiveProvider` fails loudly on a missing
// provider/model, and this cell fails loudly (`failLoudly`) if the boot
// appended NO load note at all — an unobservable channel must red by name, not
// let the `not.toContain` assertion below pass vacuously.
//
// Subagent child-process launch: NOT reached. The cell registers only and
// never invokes a command, so there is no query-time tool-call loop and no
// RFC-0006 subagent-child spawn. `tests/live/harness.ts` already carries the
// `#subagent-child-pins` module-scope setters (`process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, `PI_THETA_SUBAGENT_PARENT_PID`) for cells
// that DO reach that launch; importing the harness inherits them. 

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
  type LiveExtensionHandle,
  type PlantedTheta,
} from "./harness";

const MALFORMED = "theta/load/malformed-tool-entry";
const CALLEE_HAS_ERRORS = "theta/load/callee-has-errors";

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * The `theta-system-note` channel contents of the settled in-memory
 * `SessionManager` — every note the boot appended, including the shipped
 * sink's per-error load-diagnostic notes. Mirrors the harness's own private
 * `collectSystemNotes` reader (string or text-part-array content).
 */
function bootNotes(handle: LiveExtensionHandle): readonly string[] {
  const notes: string[] = [];
  for (const entry of handle.sessionManager.getEntries()) {
    const e = entry as { customType?: string; content?: unknown };
    if (e.customType !== "theta-system-note") continue;
    if (typeof e.content === "string") notes.push(e.content);
    else if (Array.isArray(e.content)) {
      for (const part of e.content) {
        const t = (part as { text?: string }).text;
        if (typeof t === "string") notes.push(t);
      }
    }
  }
  return notes;
}

/** The boot notes naming one planted `.theta` file (the rendered line carries its path). */
function notesFor(handle: LiveExtensionHandle, stem: string): readonly string[] {
  return bootNotes(handle).filter((n) => n.includes(`${stem}.theta`));
}

describe("bug 0106 live cell — a malformed `tools:` entry naming an erroneous callee draws the grammar rejection alone at live production load", () => {
  it("the co-fire caller draws theta/load/malformed-tool-entry and NOT theta/load/callee-has-errors, while the well-formed control keeps callee-has-errors", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The erroneous callee: an unresolved `params:` named type is an
      // error-severity parse diagnostic, so it is exactly the V15f
      // `hasErrors` subject. It does not register on its own account.
      {
        source: "project",
        stem: "b0106broken",
        text: theta(
          "---",
          "mode: subagent",
          "params:",
          "  x: NoSuchType",
          "---",
          "@`broken`",
        ),
      },
      // The clean callee, and the clean control's target.
      {
        source: "project",
        stem: "b0106good",
        text: theta("---", "mode: subagent", "---", "@`good`"),
      },
      // THE SUBJECT: a MALFORMED entry (two tokens) whose first token names
      // the erroneous callee. Post-fix: the grammar rejection alone.
      {
        source: "project",
        stem: "b0106cofire",
        text: theta(
          "---",
          "mode: subagent",
          "tools:",
          "  - ./b0106broken.theta junk",
          "---",
          "@`hi`",
        ),
      },
      // The separability control (§Fix constraint 2): the SAME callee named by
      // a WELL-FORMED entry must keep drawing `callee-has-errors`. Without it
      // a red cannot distinguish "the co-fire is closed" from "the V15f check
      // is broken".
      {
        source: "project",
        stem: "b0106ctlwell",
        text: theta(
          "---",
          "mode: subagent",
          "tools:",
          "  - ./b0106broken.theta",
          "---",
          "@`hi`",
        ),
      },
      // The clean control: a well-formed entry naming the error-free callee.
      // Registers, and draws no load diagnostic.
      {
        source: "project",
        stem: "b0106clean",
        text: theta(
          "---",
          "mode: subagent",
          "tools:",
          "  - ./b0106good.theta",
          "---",
          "@`hi`",
        ),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      const registered = JSON.stringify(handle.registeredNames());

      // Precondition 1 (registration): the clean control registered, so
      // discovery and registration ran. Without it every absence assertion
      // below would hold vacuously.
      expect(
        handle.command("b0106clean"),
        "bug-0106 live cell precondition unmet: the clean `- ./b0106good.theta` control did " +
          "not register — discovery or registration regressed independent of bug 0106. " +
          "Registered: " + registered,
      ).toBeDefined();

      // §Fix constraint 1, the invariant the fix must NOT move: every
      // malformed spelling, and a well-formed entry naming an erroneous
      // callee, un-register their theta.
      expect(
        handle.registeredNames(),
        "bug-0106 live cell: a malformed `tools:` entry must un-register its theta. " +
          "Registered: " + registered,
      ).not.toContain("b0106cofire");
      expect(
        handle.registeredNames(),
        "bug-0106 live cell: a well-formed entry naming an erroneous callee must " +
          "un-register its theta. Registered: " + registered,
      ).not.toContain("b0106ctlwell");

      // Precondition 2 (the diagnostic channel): the shipped sink appended at
      // least one load note during boot. Fail loudly rather than let the
      // co-fire assertion pass on an unobservable channel.
      const allNotes = bootNotes(handle);
      if (allNotes.length === 0) {
        failLoudly(
          "bug-0106 live cell precondition unmet: the boot appended NO `theta-system-note` " +
            "entries, so the shipped load-diagnostic channel is unobservable here and the " +
            "co-fire assertion below would pass vacuously. Registered: " + registered,
        );
      }
      const wellFormedNotes = notesFor(handle, "b0106ctlwell");
      expect(
        wellFormedNotes.join("\n"),
        "bug-0106 live cell precondition unmet: the WELL-FORMED entry naming the erroneous " +
          `callee did not draw ${CALLEE_HAS_ERRORS} on the note channel, so the channel ` +
          "does not carry this surface's load diagnostics and the co-fire assertion cannot " +
          "witness anything. Notes: " + JSON.stringify(allNotes),
      ).toContain(CALLEE_HAS_ERRORS);

      // THE FIXED OBSERVABLE: one authoring mistake, one diagnostic — the one
      // that names it.
      const cofireNotes = notesFor(handle, "b0106cofire");
      expect(
        cofireNotes.join("\n"),
        `bug-0106 live cell: the malformed entry must draw ${MALFORMED}. Notes: ` +
          JSON.stringify(cofireNotes),
      ).toContain(MALFORMED);
      expect(
        cofireNotes.join("\n"),
        `bug-0106 live cell: the malformed entry must NOT ALSO draw ${CALLEE_HAS_ERRORS} — ` +
          "the pre-parse callee cache (the `for (const entry of toolsList)` loop in " +
          "production-composition.ts) gates on `parseToolsEntry` before calling " +
          "`toolsEntrySpec`, so a malformed entry never enters the cache and the V15f " +
          "callee-has-errors loop has no member to fire " +
          "for; the closed grammar's rejection is the entry's only disposition " +
          "(code-registry-load.md:40). Notes: " + JSON.stringify(cofireNotes),
      ).not.toContain(CALLEE_HAS_ERRORS);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
