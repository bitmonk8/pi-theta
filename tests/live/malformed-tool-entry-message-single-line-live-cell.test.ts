// Bug 0105 — `theta/load/malformed-tool-entry` interpolates the offending
// `tools:` entry into its message with no line-break transform, so a
// block-mapping sequence item of two or more keys (the shape the bug 0069 fix
// made recoverable in `extractToolsList`'s non-scalar sequence-item arm, which
// slices the item's own verbatim YAML via `paramValueSource` instead of
// dropping it, `src/parser/frontmatter.ts`)
// yields a `message` spanning physical lines where
// `diagnostic-shape.md:34` says single-line summary — and an author-chosen
// second key spelled `hint:` at column 2 forges the reserved `  hint: <hint>`
// continuation line `src/diagnostics/diagnostic.ts:80` emits, on a diagnostic
// that carries no hint field at all
// (docs/bugs/0105-malformed-tool-entry-message-embeds-raw-newline.md).
//
// Additive H8a-T cell. The fixed surface is theta LOAD: the message a
// load-time diagnostic RENDERS, which settles during discovery at
// `session_start`, before any turn exists — so, exactly as the sibling bug
// 0104 live cell states for its own registration-only surface, THIS CELL
// DRIVES ZERO MODEL TURNS. There is nothing for a turn to exercise: the
// rendered `message` string is fixed the moment
// `discoverAndComposeFixtures` / `composeExtensionInstance` finishes, and a
// `prompt()` call would only add token cost with no additional observable.
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same
// harness the bug 0104 and bug 0151 registration/note-channel cells use.
//
// Observables per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving", both read off settled state after the real `session_start`
// step, never off a `prompt()` resolution:
//   1. The `theta-system-note` channel, read off the settled in-memory
//      `SessionManager` — the reader shape mirrors
//      `tests/live/fn-param-list-unclosed-live-cell.test.ts`'s notes loop
//      verbatim. The note carrying `theta/load/malformed-tool-entry` for the
//      planted `b0105live` theta must: exist (fail loudly naming the code
//      and dumping what was collected if it does not); carry no physical
//      line matching `^ {2}hint: ` (the forged hint-continuation shape); no
//      physical line matching `^ {2}\S+:\d+:\d+: ` (the forged related-site
//      shape); and collapse the whole entry onto ONE physical line.
//   2. `handle.command(stem)` / `handle.registeredNames()` — the sibling
//      control `b0105ctl` (same tool name, admitted plain-scalar spelling)
//      MUST register (no-silent-skip precondition: an unregistered control
//      would make every assertion below vacuous), and `b0105live` MUST NOT.
//
// 
//
// Subagent child-process launch: NOT reached. Both planted thetas are
// `mode: prompt`, name no callable in their body (`@`hi``), and this cell
// never invokes a command, so no query-time tool-call loop and no RFC-0006
// subagent-child spawn occurs. `harness.ts` carries the
// `#subagent-child-pins` module-scope setters (`process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, `PI_THETA_SUBAGENT_PARENT_PID`), and
// importing it inherits them, but this cell does not exercise that path.
//
// RED / GREEN (AGENTS.md "Verify both directions"): red at HEAD (pre-fix) for
// the right reason — the note's message carries the author's own U+000A, so
// it spans more than one physical line, and the `hint:`-spelled second key
// forges a line matching `^ {2}hint: `; the code exists throughout (0069
// shipped it in 0.62.0), so a red here is never a "code missing" red. Green
// once the fix (`normaliseLiteralValueLineBreaks`,
// src/diagnostics/diagnostic.ts) lands: the message collapses to one line and
// no continuation shape is forged.
//
// The offline whole-plant witness for the same fix is
// tests/tools-entry-message-line-break.test.ts (30 cells, every carrier and
// the shared transform itself); this cell adds only what an offline
// `ctx.ui.notify` collector cannot reach: the real discovery →
// `session_start` → `theta-system-note` channel path.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The code this report's fix concerns. */
const MALFORMED_CODE = "theta/load/malformed-tool-entry";

/** A `mode: prompt` `.theta` whose `tools:` field is the given lines, body names no callable. */
function toolsTheta(toolsLines: readonly string[]): string {
  return ["---", "mode: prompt", ...toolsLines].join("\n") + "\n---\n@`hi`\n";
}

describe("bug 0105 live cell — a two-key block-mapping `tools:` item renders a single-line note with no forged continuation line", () => {
  it("un-registers the forged-hint theta, registers the admitted-spelling control, and the note carries no forged continuation shape", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The control: the SAME tool name (`read`), admitted plain-scalar
      // spelling. Must register — the no-silent-skip precondition every
      // assertion below rests on.
      { source: "project", stem: "b0105ctl", text: toolsTheta(["tools: read"]) },
      // The refused, forgery shape: a `tools:` sequence written at column 0
      // so the block-mapping item's keys land at column 2, second key
      // spelled `hint:` — the exact shape
      // `src/diagnostics/diagnostic.ts:80` reserves for a diagnostic's own
      // `hint` field, on a diagnostic that carries none.
      {
        source: "project",
        stem: "b0105live",
        text: toolsTheta(["tools:", "- name: read", "  hint: write 'read' instead"]),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the admitted-spelling control must register before the
      // refusal assertion means anything.
      expect(
        handle.command("b0105ctl"),
        "bug-0105 live cell precondition unmet: the plain-scalar `tools: read` control did " +
          "not register — discovery or registration regressed independent of " +
          "bug 0105, so nothing below can be attributed to this bug. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Real observable: the forged-second-key theta must be ABSENT from the
      // registered set — 0069's closed-grammar contract, untouched by this
      // fix and re-asserted here so a route that also stopped un-registering
      // would red on the right symptom instead of passing vacuously.
      expect(
        handle.command("b0105live"),
        "bug-0105 live cell: the two-key block-mapping `tools:` theta registered — the " +
          "closed per-entry grammar (bug 0069) did not fire. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0105 live cell: `b0105live`'s slash name must not appear in the registered set.",
      ).not.toContain("b0105live");

      // The `theta-system-note` channel, read off the settled in-memory
      // `SessionManager` — reader shape mirrors
      // tests/live/fn-param-list-unclosed-live-cell.test.ts's notes loop.
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

      // No-silent-skip: fail loudly naming the code and dumping what was
      // collected if no note names it, rather than asserting vacuously
      // against an empty match.
      const noteForCode = notes.find((n) => n.includes(MALFORMED_CODE));
      expect(
        noteForCode,
        "bug-0105 live cell: no `theta-system-note` entry names `" + MALFORMED_CODE + "` for " +
          "the planted `b0105live` theta — the load-diagnostic routing this cell observes " +
          "is not reaching the channel. Notes collected: " + JSON.stringify(notes),
      ).toBeDefined();
      const note = noteForCode as string;
      const physicalLines = note.split(/\r\n|\r|\n/);

      // The two forged-continuation-line assertions.
      const forgedHintLines = physicalLines.filter((l) => /^ {2}hint: /.test(l));
      expect(
        forgedHintLines,
        "bug-0105 live cell: the rendered note carries a line matching `^ {2}hint: ` for a " +
          "diagnostic with no `hint` field — the shape `src/diagnostics/diagnostic.ts:80` " +
          "reserves. Note: " + JSON.stringify(note),
      ).toEqual([]);
      const forgedRelatedLines = physicalLines.filter((l) =>
        /^ {2}\S+:\d+:\d+: /.test(l),
      );
      expect(
        forgedRelatedLines,
        "bug-0105 live cell: the rendered note carries a line matching `^ {2}\\S+:\\d+:\\d+: ` " +
          "for a diagnostic whose `related` is absent — the shape " +
          "`src/diagnostics/diagnostic.ts:86` reserves. Note: " + JSON.stringify(note),
      ).toEqual([]);

      // The single-line-summary assertion: the recovered slice's own break
      // must have collapsed, so the ENTIRE note text sits on one physical
      // line. This note carries exactly ONE diagnostic — the load router
      // renders each error-severity load diagnostic as its own
      // `renderDiagnosticBatch([diagnostic])` note — and the diagnostic
      // `callable-set.ts` raises for this code carries neither `hint` nor
      // `related`, so a conformant render is one physical line and nothing
      // else. The `codeLine`-exists precondition folds into the second
      // assertion: the one line must be the line naming the code.
      expect(
        physicalLines,
        "bug-0105 live cell: the note carrying `" + MALFORMED_CODE + "` spans more than one " +
          "physical line, breaking the single-line-summary contract " +
          "diagnostics/diagnostic-shape.md \"Internal diagnostic shape\" states for a " +
          "`message`, on a diagnostic rendered alone with no `hint` and no `related`. " +
          "Note: " + JSON.stringify(note),
      ).toHaveLength(1);
      expect(
        physicalLines[0],
        "bug-0105 live cell: the note's single physical line does not carry `" +
          MALFORMED_CODE + "`. Note: " + JSON.stringify(note),
      ).toContain(MALFORMED_CODE);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
