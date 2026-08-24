// Bug 0250 — `theta/parse/duplicate-enum-value` interpolates the COOKED value
// of an enum variant's string literal into its message with no line-break
// transform (`src/parser/schema-declarations.ts:269`), so an enum whose two
// distinctly-named variants share a value written with a two-character `\n`
// escape — cooked to one U+000A by `classifyEnumValueToken`
// (`src/parser/theta-document.ts:5594`) — yields a `message` of two physical
// lines where `diagnostic-shape.md:34` says single-line summary, and a value
// spelled `x\n  hint: …` forges the reserved `  hint: <hint>` continuation line
// `src/diagnostics/diagnostic.ts:95` emits, on a diagnostic that carries no
// hint field at all
// (docs/bugs/0250-duplicate-enum-value-message-embeds-cooked-newline.md).
//
// Additive H8a cell. The fixed surface is theta PARSE, delivered at load: the
// message a parse-time diagnostic RENDERS into the note channel when the theta
// un-registers, which settles during discovery at `session_start` before any
// turn exists. THIS CELL DRIVES ZERO MODEL TURNS — the rendered text is fixed
// the moment `composeExtensionInstance` finishes, and a `prompt()` call would
// add token cost with no additional observable. It carries no drive
// discriminator for the same reason.
//
// Observables per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving", both read off settled state after the real `session_start` step:
//   1. The `theta-system-note` channel, read off the settled in-memory
//      `SessionManager`. The note carrying `theta/parse/duplicate-enum-value`
//      for the planted `b0250live` theta must exist (fail loudly naming the
//      code and dumping what was collected if it does not), carry no physical
//      line matching `^ {2}hint: `, and put its whole message on ONE physical
//      line.
//   2. `handle.command(stem)` / `handle.registeredNames()` — the control
//      `b0250ctl`, an enum whose two variants carry distinct values, MUST
//      register (no-silent-skip precondition: an unregistered control makes
//      every assertion below vacuous), and `b0250live` MUST NOT.
//
// Subagent child-process launch: NOT reached. Both planted thetas are
// `mode: prompt`, name no callable in their body (`@`hi``), and this cell never
// invokes a command, so no query-time tool-call loop and no RFC-0006 subagent
// child spawn occurs. `harness.ts` carries the `#subagent-child-pins`
// module-scope setters (`process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, `PI_THETA_SUBAGENT_PARENT_PID`) and
// importing it inherits them, but this cell does not exercise that path.
//
// RED / GREEN (AGENTS.md "Verify both directions"): red at HEAD for the right
// reason — the cooked escape reaches the message, so the note spans two
// physical lines and the second matches `^ {2}hint: `. The code has been
// registered since the V5a enum checker shipped, so a red here is never a
// "code missing" red. Green once the fix routes the value through
// `normaliseLiteralValueLineBreaks` (`src/diagnostics/diagnostic.ts:168`): the
// value collapses to `x hint: forged` and no continuation shape is forged.
//
// The offline witness for the same fix is
// tests/duplicate-enum-value-message-line-break.test.ts (every measured
// carrier, both non-carriers and the identity half); this cell adds only what
// an offline diagnostic collector cannot reach: the real discovery →
// `session_start` → `theta-system-note` channel path.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The code this report's fix concerns. */
const DUP_ENUM_CODE = "theta/parse/duplicate-enum-value";

/** A `mode: prompt` `.theta` declaring `enumBody`, body naming no callable. */
function enumTheta(enumBody: string): string {
  return ["---", "mode: prompt", "---", enumBody, "@`hi`"].join("\n") + "\n";
}

describe("bug 0250 live cell — a duplicated enum value carrying a `\\n` escape renders a single-line note with no forged continuation line", () => {
  it("un-registers the forged-hint theta, registers the distinct-value control, and the note forges no hint line", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The control: the same enum shape with DISTINCT values, so the
      // value-duplication check does not fire and the theta registers. This is
      // the no-silent-skip precondition every assertion below rests on.
      {
        source: "project",
        stem: "b0250ctl",
        text: enumTheta('enum E { Low = "low", High = "high" }'),
      },
      // The refused, forgery shape: two distinctly-named variants sharing one
      // value whose source spells the two-character `\n` escape followed by two
      // spaces and `hint: ` — the exact shape
      // `src/diagnostics/diagnostic.ts:95` reserves for a diagnostic's own
      // `hint` field, on a diagnostic that carries none.
      {
        source: "project",
        stem: "b0250live",
        text: enumTheta(
          'enum E { Low = "x\\n  hint: forged", High = "x\\n  hint: forged" }',
        ),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the distinct-value control must register before the
      // refusal assertion means anything.
      expect(
        handle.command("b0250ctl"),
        "bug-0250 live cell precondition unmet: the distinct-value enum control did not " +
          "register — discovery or registration regressed independent of bug 0250, so " +
          "nothing below can be attributed to this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Real observable: the duplicated-value theta must be ABSENT from the
      // registered set, re-asserted here so a route that also stopped
      // un-registering would red on the right symptom instead of passing
      // vacuously.
      expect(
        handle.command("b0250live"),
        "bug-0250 live cell: the duplicated-enum-value theta registered — the enum " +
          "value-duplication check did not fire. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0250 live cell: `b0250live`'s slash name must not appear in the registered set.",
      ).not.toContain("b0250live");

      // The `theta-system-note` channel, read off the settled in-memory
      // `SessionManager`.
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
      // collected if no note names it, rather than asserting vacuously against
      // an empty match.
      const noteForCode = notes.find((n) => n.includes(DUP_ENUM_CODE));
      expect(
        noteForCode,
        "bug-0250 live cell: no `theta-system-note` entry names `" + DUP_ENUM_CODE + "` for " +
          "the planted `b0250live` theta — the parse-diagnostic routing this cell observes " +
          "is not reaching the channel. Notes collected: " + JSON.stringify(notes),
      ).toBeDefined();
      const note = noteForCode as string;
      const physicalLines = note.split(/\r\n|\r|\n/);

      const forgedHintLines = physicalLines.filter((l) => /^ {2}hint: /.test(l));
      expect(
        forgedHintLines,
        "bug-0250 live cell: the rendered note carries a line matching `^ {2}hint: ` for a " +
          "diagnostic with no `hint` field — the shape `src/diagnostics/diagnostic.ts:95` " +
          "reserves. Note: " + JSON.stringify(note),
      ).toEqual([]);

      // The single-line-summary assertion: the cooked escape must have
      // collapsed, so the ENTIRE note text sits on one physical line. This note
      // carries exactly ONE diagnostic — the load router renders each
      // error-severity diagnostic as its own `renderDiagnosticBatch([d])` note —
      // and the diagnostic `checkEnumDeclaration` raises for this code carries
      // neither `hint` nor `related`, so a conformant render is one physical
      // line and nothing else.
      expect(
        physicalLines,
        "bug-0250 live cell: the note carrying `" + DUP_ENUM_CODE + "` spans more than one " +
          "physical line, breaking the single-line-summary contract " +
          "diagnostics/diagnostic-shape.md \"Internal diagnostic shape\" states for a " +
          "`message`, on a diagnostic rendered alone with no `hint` and no `related`. " +
          "Note: " + JSON.stringify(note),
      ).toHaveLength(1);
      expect(
        physicalLines[0],
        "bug-0250 live cell: the note's single physical line does not carry `" +
          DUP_ENUM_CODE + "`. Note: " + JSON.stringify(note),
      ).toContain(DUP_ENUM_CODE);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
