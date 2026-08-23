// Bug 0248 — standalone live load/registration cell (the sibling of
// `b0106live-cofire-refusal-live-cell.test.ts`, which pins the DEPTH-0 half of
// the same gate; not a numbered live-production-acceptance cell).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION at
// DEPTH 1: a `tools:` `.theta` entry written by a CALLEE, whose token sequence
// the closed per-entry grammar rejects
// (docs/spec_topics/frontmatter/frontmatter-fields-a.md:88) and whose first
// token names a path outside every active discovery root, must draw
// `theta/load/malformed-tool-entry` on the callee's OWN file and must NOT draw
// `theta/load/invoke-path-escape` at the caller that names the callee. A
// malformed token sequence is not "a `tools:` `.theta` entry", so it is not the
// subject of that code's *Trigger*
// (docs/spec_topics/diagnostics/code-registry-load.md:35), which bug 0111
// settled names the entry KIND and not the entry's DEPTH.
//
// Both containment loops in src/extension/production-composition.ts gate on
// `parseToolsEntry` before `toolsEntrySpec` runs: the depth-0 cache-head loop
// in `resolveThetaToolsAtLoad` and `checkNestedToolsContainment`, bug 0111's
// depth-1 surface (bug 0248 §Fix (a),
// docs/bugs/0248-malformed-escaping-tools-entry-containment-unwitnessed.md), so
// the identical entry text draws `theta/load/malformed-tool-entry` on the file
// that writes it and nothing at the caller, whichever depth writes it.
//
// The depth-1 composed CALLER therefore draws NO diagnostic and REGISTERS. Its
// own entry is well-formed, in-root and error-free; the callee's malformed entry
// is not `theta/load/invoke-path-escape`'s *Trigger* subject at either depth
// (above), and it is not `theta/load/callee-has-errors`' subject either — that
// *Trigger* (docs/spec_topics/diagnostics/code-registry-load.md:41) presupposes
// a callee that failed its own parse or structural checks, which
// `parseCalleeForTools`' `hasErrors` input cannot see for an entry-grammar
// rejection `resolveCallableSet` raises later. This is the same disposition the
// shipped IN-ROOT class already has for the same shape, and it mints no
// out-of-root callable: the callee's own callable-set resolution rejects the
// malformed entry by the same closed grammar, and the callee does not register.
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), plus a SECOND
// `mkdtempSync` directory this cell creates itself and disposes in its
// `finally`, which no active discovery root contains (it is not a `--theta`
// CLI source, so it is not `plantThetaWorkspace`'s `cli` arm) and which is
// therefore the INV-1 escape subject. No live turn is driven, so this cell
// spends no tokens beyond `requireLiveProvider`'s credential resolution.
//
// OBSERVABLES (AGENTS.md "Assert on real observables, not on `prompt()`
// resolving"; no `prompt()` is called here at all). Two channels, both read off
// the settled boot, the same two the bug-0106 live cell reads:
//   1. REGISTRATION — `handle.command(stem)` / `handle.registeredNames()`, off
//      the real `ExtensionRunner` after the real `pi.registerCommand` step:
//      every row carrying an error-severity load diagnostic is absent, the
//      diagnostic-free depth-1 composed caller is present, and the clean
//      control is present, in the same boot.
//   2. The `theta-system-note` CHANNEL — the shipped sink routes every
//      error-severity load diagnostic through `routePreEvalFailure` with
//      `content: renderDiagnosticBatch([diagnostic])` (`emitLoadNoteGroup`,
//      src/extension/production-composition.ts), and `renderDiagnosticLine`
//      (src/diagnostics/diagnostic.ts) puts the registry CODE and the file path
//      in that text. It is the channel that carries WHICH code a caller
//      receives, which registration alone cannot report. Read off
//      `handle.sessionManager`, the deterministic settled-transcript read, not
//      off racy events.
//
// NO SILENT SKIPPING: `requireLiveProvider` fails loudly on a missing
// provider/model, and this cell fails loudly (`failLoudly`) if the boot
// appended NO load note at all — an unobservable channel must red by name, not
// let the `not.toContain` assertion below pass vacuously. The WELL-FORMED
// depth-1 control is the second, sharper precondition: it must CARRY
// `theta/load/invoke-path-escape`, so the depth-1 containment surface is proven
// live in the same boot.
//
// Subagent child-process launch: NOT reached. The cell registers only and never
// invokes a command, so there is no query-time tool-call loop and no RFC-0006
// subagent-child spawn. `tests/live/harness.ts` already carries the
// `#subagent-child-pins` module-scope setters (`process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, `PI_THETA_SUBAGENT_PARENT_PID`) for cells
// that DO reach that launch; importing the harness inherits them.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const INVOKE_PATH_ESCAPE = "theta/load/invoke-path-escape";

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * The `theta-system-note` channel contents of the settled in-memory
 * `SessionManager` — every note the boot appended, including the shipped sink's
 * per-error load-diagnostic notes. Mirrors the harness's own private
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

describe("bug 0248 live cell — a callee's MALFORMED escaping `tools:` entry draws no containment refusal at its caller at live production load", () => {
  it("the caller of the malformed-entry callee carries NO theta/load/invoke-path-escape, while the well-formed control caller carries it and the callee keeps theta/load/malformed-tool-entry", async () => {
    const provider = await requireLiveProvider();
    // The out-of-root directory: created here rather than through
    // `plantThetaWorkspace`, whose `cli` arm would make it a `--theta`
    // discovery source and therefore CONTAINED. Disposed in the `finally`.
    const outOfRootDir = mkdtempSync(join(tmpdir(), "theta-b0248live-out-"));
    // Forward-slash absolute spelling: the entry text is a `.theta` path spec,
    // not a platform path, and `<path>` renders it AS WRITTEN.
    const farSpec = `${outOfRootDir.replaceAll("\\", "/")}/b0248livefar.theta`;
    writeFileSync(
      join(outOfRootDir, "b0248livefar.theta"),
      theta("---", "mode: subagent", "---", "@`far`"),
      "utf8",
    );
    const caller = (entry: string): string =>
      theta("---", "mode: subagent", "tools:", `  - ${entry}`, "---", "@`hi`");
    const thetas: PlantedTheta[] = [
      // THE SUBJECT, depth 1: the callee's OWN entry is malformed (two tokens)
      // AND escaping. It draws the grammar rejection on its own file.
      {
        source: "project",
        stem: "b0248livenestmesc",
        text: caller(`${farSpec} junk`),
      },
      // The caller names that callee with a WELL-FORMED, CONTAINED entry, so
      // the only escaping path in reach is one the closed grammar denies is a
      // `tools:` `.theta` entry at all. Post-fix: no escape refusal here.
      {
        source: "project",
        stem: "b0248livecallmesc",
        text: caller("./b0248livenestmesc.theta"),
      },
      // The depth-1 CONTROL (bug 0111's shipped class): the callee's escaping
      // entry is WELL-FORMED, so the caller must keep drawing the containment
      // refusal. This is the precondition that proves the depth-1 surface is
      // live in this boot — without it the assertion above passes vacuously.
      {
        source: "project",
        stem: "b0248livenestwesc",
        text: caller(farSpec),
      },
      {
        source: "project",
        stem: "b0248livecallwesc",
        text: caller("./b0248livenestwesc.theta"),
      },
      // The clean control: a well-formed entry naming a contained, error-free
      // callee. Registers, and draws no load diagnostic.
      {
        source: "project",
        stem: "b0248livegood",
        text: theta("---", "mode: subagent", "---", "@`good`"),
      },
      {
        source: "project",
        stem: "b0248liveclean",
        text: caller("./b0248livegood.theta"),
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
        handle.command("b0248liveclean"),
        "bug-0248 live cell precondition unmet: the clean " +
          "`- ./b0248livegood.theta` control did not register — discovery or " +
          "registration regressed independent of bug 0248. Registered: " +
          registered,
      ).toBeDefined();

      // Every row carrying an error-severity load diagnostic is absent from the
      // registered set: the callee's own grammar rejection
      // (docs/spec_topics/diagnostics/code-registry-load.md:25) and the
      // containment refusal at the well-formed control's two files
      // (docs/spec_topics/invocation.md:12).
      for (const stem of [
        "b0248livenestmesc",
        "b0248livenestwesc",
        "b0248livecallwesc",
      ]) {
        expect(
          handle.registeredNames(),
          `bug-0248 live cell: \`${stem}\` must not register — the grammar ` +
            "rejection and the containment refusal both un-register their " +
            "theta. Registered: " + registered,
        ).not.toContain(stem);
      }

      // The depth-1 composed caller draws NO diagnostic, so it REGISTERS. Its
      // own entry is well-formed, in-root and error-free; the callee's
      // malformed entry is the subject of neither `theta/load/invoke-path-escape`
      // (docs/spec_topics/diagnostics/code-registry-load.md:35, read with the
      // closed grammar at
      // docs/spec_topics/frontmatter/frontmatter-fields-a.md:88) nor
      // `theta/load/callee-has-errors` (:41, whose *Trigger* presupposes a
      // callee that failed its own parse or structural checks). Nothing
      // out-of-root becomes callable: the callee's own callable-set resolution
      // rejects the malformed entry by the same closed grammar.
      expect(
        handle.command("b0248livecallmesc"),
        "bug-0248 live cell: the caller of the malformed-entry callee draws no " +
          "load diagnostic, so it registers — the same disposition the shipped " +
          "IN-ROOT class of this shape already has. Registered: " + registered,
      ).toBeDefined();

      // Precondition 2 (the diagnostic channel exists): the shipped sink
      // appended at least one load note during boot.
      const allNotes = bootNotes(handle);
      if (allNotes.length === 0) {
        failLoudly(
          "bug-0248 live cell precondition unmet: the boot appended NO " +
            "`theta-system-note` entries, so the shipped load-diagnostic " +
            "channel is unobservable here and the absence assertion below " +
            "would pass vacuously. Registered: " + registered,
        );
      }

      // Precondition 3 (the depth-1 containment surface is LIVE): the
      // well-formed nested entry still draws the refusal at its caller.
      const controlNotes = notesFor(handle, "b0248livecallwesc");
      expect(
        controlNotes.join("\n"),
        "bug-0248 live cell precondition unmet: the caller of the WELL-FORMED " +
          `escaping callee did not draw ${INVOKE_PATH_ESCAPE} on the note ` +
          "channel, so bug 0111's depth-1 containment surface is not live in " +
          "this boot and the absence assertion below witnesses nothing. " +
          "Notes: " + JSON.stringify(allNotes),
      ).toContain(INVOKE_PATH_ESCAPE);
      expect(
        handle.registeredNames(),
        "the separability control's other half: the well-formed nested escaping " +
          "entry keeps un-registering its caller " +
          "(docs/spec_topics/invocation.md:12), so the composed caller's " +
          "registration is the gate's doing and not a dead containment surface. " +
          "Registered: " + registered,
      ).not.toContain("b0248livecallwesc");

      // The callee's own disposition: one authoring mistake, one diagnostic —
      // the one that names it (code-registry-load.md:25).
      const calleeNotes = notesFor(handle, "b0248livenestmesc");
      expect(
        calleeNotes.join("\n"),
        "bug-0248 live cell: the malformed-entry callee must keep drawing " +
          `${MALFORMED} on its OWN file, so no input loses its refusal. ` +
          "Notes: " + JSON.stringify(calleeNotes),
      ).toContain(MALFORMED);

      // THE FIXED OBSERVABLE (bug 0248 §Fix (a)): the caller of the
      // malformed-entry callee is not told that a `tools:` `.theta` entry
      // escapes the discovery roots, for a token sequence that is not one.
      const subjectNotes = notesFor(handle, "b0248livecallmesc");
      expect(
        subjectNotes.join("\n"),
        `bug-0248 live cell: the caller must NOT draw ${INVOKE_PATH_ESCAPE}. ` +
          "Its own entry `- ./b0248livenestmesc.theta` is well-formed and " +
          "contained; the escaping path belongs to the callee's MALFORMED " +
          "entry, which the closed grammar says is not a `tools:` `.theta` " +
          "entry (frontmatter-fields-a.md:88) and therefore not that code's " +
          "*Trigger* subject at either depth (code-registry-load.md:35; bug " +
          "0111 settled that the *Trigger* names the entry kind, not its " +
          "depth). Notes: " + JSON.stringify(subjectNotes),
      ).not.toContain(INVOKE_PATH_ESCAPE);
    } finally {
      await handle.dispose();
      workspace.dispose();
      rmSync(outOfRootDir, { recursive: true, force: true });
    }
  });
});
